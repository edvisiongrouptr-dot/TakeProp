-- Freeze the commercial/risk contract on every account and make evaluation
-- transitions deterministic. Plan edits must never change a live challenge.
alter table public.trading_accounts
  add column if not exists rule_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists risk_breach_reason text,
  add column if not exists risk_breached_at timestamptz,
  add column if not exists passed_at timestamptz;

update public.trading_accounts a
set rule_snapshot = jsonb_build_object(
  'version', 1,
  'challengeType', coalesce(p.rules->>'challenge_type', 'one_step'),
  'dailyLossPct', p.daily_loss_limit_pct,
  'maxLossPct', p.max_loss_limit_pct,
  'profitTargetPct', coalesce(a.evaluation_target_pct, p.profit_target_pct),
  'phase2ProfitTargetPct', coalesce(nullif(p.rules->>'phase_2_profit_target_pct','')::numeric, p.profit_target_pct),
  'minTradingDays', p.min_trading_days,
  'maxLeverage', p.leverage_ratio,
  'profitSplitPct', p.profit_split_pct,
  'minimumPayoutUsd', coalesce(nullif(p.rules->>'minimum_payout_usd','')::numeric,50),
  'capturedAt', now()
)
from public.challenge_plans p
where p.id = a.plan_id and a.rule_snapshot = '{}'::jsonb;

create or replace function public.internal_freeze_account_rules()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_plan public.challenge_plans%rowtype;
begin
  if tg_op='UPDATE' then
    if new.rule_snapshot is distinct from old.rule_snapshot or new.plan_id is distinct from old.plan_id then
      raise exception 'Account plan and rule snapshot are immutable';
    end if;
    return new;
  end if;

  select * into v_plan from public.challenge_plans where id=new.plan_id;
  if not found then raise exception 'Challenge plan not found'; end if;

  if new.rule_snapshot='{}'::jsonb then
    new.rule_snapshot:=jsonb_build_object(
      'version',1,
      'challengeType',coalesce(v_plan.rules->>'challenge_type','one_step'),
      'dailyLossPct',v_plan.daily_loss_limit_pct,
      'maxLossPct',v_plan.max_loss_limit_pct,
      'profitTargetPct',coalesce(new.evaluation_target_pct,v_plan.profit_target_pct),
      'phase2ProfitTargetPct',coalesce(nullif(v_plan.rules->>'phase_2_profit_target_pct','')::numeric,v_plan.profit_target_pct),
      'minTradingDays',v_plan.min_trading_days,
      'maxLeverage',v_plan.leverage_ratio,
      'profitSplitPct',v_plan.profit_split_pct,
      'minimumPayoutUsd',coalesce(nullif(v_plan.rules->>'minimum_payout_usd','')::numeric,50),
      'capturedAt',now()
    );
  end if;
  return new;
end;$function$;

drop trigger if exists freeze_account_rules on public.trading_accounts;
create trigger freeze_account_rules
before insert or update on public.trading_accounts
for each row execute function public.internal_freeze_account_rules();

-- This trigger runs after freeze_account_rules (Postgres orders same-event
-- triggers by name), so lifecycle fields also come from the frozen contract.
create or replace function public.internal_initialize_evaluation_account()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare
  v_plan public.challenge_plans%rowtype;
  v_challenge_type text;
  v_phase_one_target numeric;
  v_phase_two_target numeric;
begin
  select * into v_plan from public.challenge_plans where id=new.plan_id;
  if not found then raise exception 'Challenge plan not found'; end if;

  v_challenge_type:=coalesce(nullif(new.rule_snapshot->>'challengeType',''),v_plan.rules->>'challenge_type','one_step');
  v_phase_one_target:=coalesce(nullif(new.rule_snapshot->>'profitTargetPct','')::numeric,v_plan.profit_target_pct);
  v_phase_two_target:=coalesce(nullif(new.rule_snapshot->>'phase2ProfitTargetPct','')::numeric,
    nullif(v_plan.rules->>'phase_2_profit_target_pct','')::numeric,v_phase_one_target);

  if new.phase='challenge' then
    new.evaluation_steps:=case when v_challenge_type='two_step' then 2 else 1 end;
    new.evaluation_step:=greatest(1,coalesce(new.evaluation_step,1));
    new.evaluation_target_pct:=coalesce(new.evaluation_target_pct,
      case when new.evaluation_step=2 then v_phase_two_target else v_phase_one_target end);
  elsif new.phase='funded' then
    new.evaluation_steps:=case when v_challenge_type='two_step' then 2 else 1 end;
    new.evaluation_target_pct:=null;
  end if;
  return new;
end;$function$;

create index if not exists trading_accounts_active_risk_idx
  on public.trading_accounts(id,user_id,status) where status='active';

create or replace function public.internal_sync_sim_account(
  p_user_id uuid,p_account_id uuid,p_marks jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_account public.trading_accounts%rowtype;v_plan public.challenge_plans%rowtype;
  v_trade public.trades%rowtype;v_mark numeric;v_unrealized numeric:=0;v_equity numeric;
  v_daily_pct numeric;v_static_pct numeric;v_target_pct numeric;v_max_leverage integer;
  v_daily_floor numeric;v_static_floor numeric;v_daily_breach boolean;v_static_breach boolean;
  v_reason text;v_today date:=(now() at time zone 'utc')::date;
begin
  select * into v_account from public.trading_accounts
  where id=p_account_id and user_id=p_user_id for update;
  if not found then raise exception 'Trading account not found'; end if;
  select * into v_plan from public.challenge_plans where id=v_account.plan_id;
  if not found then raise exception 'Challenge plan not found'; end if;

  v_daily_pct:=coalesce(nullif(v_account.rule_snapshot->>'dailyLossPct','')::numeric,v_plan.daily_loss_limit_pct);
  v_static_pct:=coalesce(nullif(v_account.rule_snapshot->>'maxLossPct','')::numeric,v_plan.max_loss_limit_pct);
  v_target_pct:=coalesce(v_account.evaluation_target_pct,nullif(v_account.rule_snapshot->>'profitTargetPct','')::numeric,v_plan.profit_target_pct);
  v_max_leverage:=coalesce(nullif(v_account.rule_snapshot->>'maxLeverage','')::integer,v_plan.leverage_ratio);

  if not exists(select 1 from public.account_daily_metrics where account_id=p_account_id and trade_date=v_today) then
    update public.trading_accounts set daily_start_balance=balance,daily_start_equity=equity,daily_pnl=0,updated_at=now()
    where id=p_account_id returning * into v_account;
    insert into public.account_daily_metrics(account_id,user_id,trade_date,start_balance,end_balance,start_equity,end_equity)
    values(p_account_id,p_user_id,v_today,v_account.balance,v_account.balance,v_account.equity,v_account.equity)
    on conflict(account_id,trade_date) do nothing;
  end if;

  for v_trade in select * from public.trades where account_id=p_account_id and closed_at is null loop
    v_mark:=nullif(p_marks->>v_trade.symbol,'')::numeric;
    if v_mark is null or v_mark<=0 then raise exception 'Missing trusted mark for %',v_trade.symbol;end if;
    v_unrealized:=v_unrealized+case when v_trade.side='long'
      then (v_mark-v_trade.entry_price)*v_trade.quantity
      else (v_trade.entry_price-v_mark)*v_trade.quantity end;
  end loop;

  v_equity:=greatest(0,v_account.balance+v_unrealized);
  v_daily_floor:=v_account.daily_start_balance*(1-v_daily_pct/100);
  v_static_floor:=v_account.starting_balance*(1-v_static_pct/100);
  v_daily_breach:=v_equity<=v_daily_floor;
  v_static_breach:=v_equity<=v_static_floor;
  v_reason:=case when v_daily_breach and v_static_breach then 'daily_and_static_loss'
    when v_daily_breach then 'daily_loss' when v_static_breach then 'static_loss' else null end;

  update public.trading_accounts set
    equity=v_equity,total_pnl=v_equity-starting_balance,daily_pnl=v_equity-daily_start_balance,
    high_water_mark=greatest(high_water_mark,v_equity),
    status=case when v_reason is not null and status='active' then 'breached' else status end,
    risk_breach_reason=case when v_reason is not null and status='active' then v_reason else risk_breach_reason end,
    risk_breached_at=case when v_reason is not null and status='active' then now() else risk_breached_at end,
    ended_at=case when v_reason is not null and status='active' then now() else ended_at end,
    last_synced_at=now(),updated_at=now()
  where id=p_account_id returning * into v_account;

  update public.account_daily_metrics set end_balance=v_account.balance,end_equity=v_account.equity,
    unrealized_pnl=v_unrealized,max_intraday_drawdown_pct=greatest(max_intraday_drawdown_pct,
      case when start_balance>0 then greatest(0,(start_balance-v_account.equity)/start_balance*100) else 0 end)
  where account_id=p_account_id and trade_date=v_today;

  return jsonb_build_object(
    'account',to_jsonb(v_account),
    'plan',jsonb_build_object('name',v_plan.name,'dailyLossPct',v_daily_pct,'maxLossPct',v_static_pct,
      'profitTargetPct',v_target_pct,'maxLeverage',v_max_leverage,
      'minTradingDays',coalesce(nullif(v_account.rule_snapshot->>'minTradingDays','')::integer,v_plan.min_trading_days)),
    'unrealizedPnl',v_unrealized,'dailyFloor',v_daily_floor,'staticFloor',v_static_floor,
    'risk',jsonb_build_object('dailyBreached',v_daily_breach,'staticBreached',v_static_breach,'breachReason',v_account.risk_breach_reason),
    'stage',jsonb_build_object('phase',v_account.phase,'step',v_account.evaluation_step,'steps',v_account.evaluation_steps,
      'targetPct',v_target_pct,'tradingDays',v_account.trading_days,
      'minTradingDays',coalesce(nullif(v_account.rule_snapshot->>'minTradingDays','')::integer,v_plan.min_trading_days)),
    'positions',coalesce((select jsonb_agg(to_jsonb(t) order by t.opened_at desc) from public.trades t where t.account_id=p_account_id and t.closed_at is null),'[]'::jsonb),
    'recentTrades',coalesce((select jsonb_agg(to_jsonb(t) order by t.closed_at desc) from (select * from public.trades where account_id=p_account_id and closed_at is not null order by closed_at desc limit 20)t),'[]'::jsonb)
  );
end;$function$;

create or replace function public.internal_finalize_sim_account(p_user_id uuid,p_account_id uuid,p_marks jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_account public.trading_accounts%rowtype;v_plan public.challenge_plans%rowtype;v_trade public.trades%rowtype;
  v_mark numeric;v_gross numeric;v_fees numeric;v_net numeric;v_target_pct numeric;v_target numeric;
  v_min_days integer;v_next_phase text;v_next_step integer;v_new_id uuid;v_floor numeric;
begin
  -- The sync obtains the account row lock; all decisions below happen in this transaction.
  perform public.internal_sync_sim_account(p_user_id,p_account_id,p_marks);
  select * into v_account from public.trading_accounts where id=p_account_id and user_id=p_user_id for update;
  if not found then raise exception 'Trading account not found'; end if;
  select * into v_plan from public.challenge_plans where id=v_account.plan_id;
  if not found then raise exception 'Challenge plan not found'; end if;

  if v_account.status='breached' then
    for v_trade in select * from public.trades where account_id=p_account_id and closed_at is null for update loop
      v_mark:=nullif(p_marks->>v_trade.symbol,'')::numeric;
      if v_mark is null or v_mark<=0 then raise exception 'Missing trusted mark for %',v_trade.symbol;end if;
      v_gross:=case when v_trade.side='long' then (v_mark-v_trade.entry_price)*v_trade.quantity else (v_trade.entry_price-v_mark)*v_trade.quantity end;
      v_fees:=((v_trade.entry_price+v_mark)*v_trade.quantity)*0.0004;v_net:=v_gross-v_fees;
      update public.trades set exit_price=v_mark,realized_pnl=v_net,fees=v_fees,closed_at=now(),close_reason='risk_breach',
        metadata=metadata||jsonb_build_object('gross_pnl',v_gross,'exit_mark_source','validated_multi_provider','close_reason','risk_breach') where id=v_trade.id;
      update public.trading_accounts set balance=greatest(0,balance+v_net) where id=p_account_id;
    end loop;
    update public.trading_accounts set equity=balance,total_pnl=balance-starting_balance,daily_pnl=balance-daily_start_balance,last_synced_at=now(),updated_at=now()
      where id=p_account_id returning * into v_account;
    v_floor:=greatest(
      v_account.daily_start_balance*(1-coalesce(nullif(v_account.rule_snapshot->>'dailyLossPct','')::numeric,v_plan.daily_loss_limit_pct)/100),
      v_account.starting_balance*(1-coalesce(nullif(v_account.rule_snapshot->>'maxLossPct','')::numeric,v_plan.max_loss_limit_pct)/100));
    if not exists(select 1 from public.risk_events where account_id=p_account_id and event_type='loss_limit_breach') then
      insert into public.risk_events(account_id,user_id,event_type,severity,status,measured_value,limit_value,details)
      values(p_account_id,p_user_id,'loss_limit_breach','critical','open',v_account.equity,v_floor,
        jsonb_build_object('automatic_liquidation',true,'breach_reason',v_account.risk_breach_reason,'rule_snapshot',v_account.rule_snapshot));
      insert into public.notifications(user_id,notification_type,title,body,action_url)
      values(p_user_id,'risk_breach','Account locked','Your simulated account exceeded a loss limit and all open positions were closed.','/dashboard');
    end if;
  end if;

  select * into v_account from public.trading_accounts where id=p_account_id;
  v_target_pct:=coalesce(v_account.evaluation_target_pct,nullif(v_account.rule_snapshot->>'profitTargetPct','')::numeric,v_plan.profit_target_pct);
  v_min_days:=coalesce(nullif(v_account.rule_snapshot->>'minTradingDays','')::integer,v_plan.min_trading_days);
  v_target:=v_account.starting_balance*(1+v_target_pct/100);
  if v_account.phase='challenge' and v_account.status='active' and v_account.balance>=v_target
    and v_account.trading_days>=v_min_days
    and not exists(select 1 from public.trades where account_id=p_account_id and closed_at is null)
    and not exists(select 1 from public.pending_orders where account_id=p_account_id and status='pending') then
    update public.trading_accounts set status='passed',passed_at=now(),ended_at=now(),updated_at=now()
      where id=p_account_id and status='active' returning * into v_account;
    if found and not exists(select 1 from public.trading_accounts where source_account_id=p_account_id) then
      v_next_step:=v_account.evaluation_step+1;
      v_next_phase:=case when v_next_step<=v_account.evaluation_steps then 'challenge' else 'funded' end;
      insert into public.trading_accounts(user_id,plan_id,order_id,provider,provider_account_id,display_account_id,
        phase,status,starting_balance,balance,equity,high_water_mark,daily_start_equity,daily_start_balance,started_at,funded_at,
        source_account_id,evaluation_step,evaluation_steps,evaluation_target_pct,rule_snapshot)
      values(p_user_id,v_account.plan_id,v_account.order_id,'takeprop_sim','SIM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20)),
        'TP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),v_next_phase,'active',v_account.starting_balance,
        v_account.starting_balance,v_account.starting_balance,v_account.starting_balance,v_account.starting_balance,v_account.starting_balance,
        now(),case when v_next_phase='funded' then now() else null end,p_account_id,v_next_step,v_account.evaluation_steps,
        case when v_next_phase='challenge' then coalesce(nullif(v_account.rule_snapshot->>'phase2ProfitTargetPct','')::numeric,v_target_pct) else null end,
        case when v_next_phase='challenge' then jsonb_set(v_account.rule_snapshot,'{profitTargetPct}',to_jsonb(coalesce(nullif(v_account.rule_snapshot->>'phase2ProfitTargetPct','')::numeric,v_target_pct)),true)
          else v_account.rule_snapshot end)
      returning id into v_new_id;
      insert into public.notifications(user_id,notification_type,title,body,action_url)
      values(p_user_id,'account_advanced',case when v_next_phase='funded' then 'Funded account created' else 'Next evaluation step unlocked' end,
        case when v_next_phase='funded' then 'You passed the evaluation. Your funded simulated account is ready.'
          else 'You passed step '||v_account.evaluation_step||'. Step '||v_next_step||' is ready.' end,'/dashboard');
    end if;
  end if;
  return public.internal_sync_sim_account(p_user_id,p_account_id,p_marks);
end;$function$;

revoke all on function public.internal_freeze_account_rules() from public,anon,authenticated;
revoke all on function public.internal_initialize_evaluation_account() from public,anon,authenticated;
revoke all on function public.internal_sync_sim_account(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.internal_finalize_sim_account(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.internal_sync_sim_account(uuid,uuid,jsonb) to service_role;
grant execute on function public.internal_finalize_sim_account(uuid,uuid,jsonb) to service_role;
