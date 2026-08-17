create index if not exists trades_open_account_idx
  on public.trades (account_id, opened_at)
  where closed_at is null;

create or replace function public.internal_sync_sim_account(
  p_user_id uuid,
  p_account_id uuid,
  p_marks jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account public.trading_accounts%rowtype;
  v_plan public.challenge_plans%rowtype;
  v_trade public.trades%rowtype;
  v_mark numeric;
  v_unrealized numeric := 0;
  v_equity numeric;
  v_daily_floor numeric;
  v_static_floor numeric;
  v_breached boolean := false;
  v_today date := (now() at time zone 'utc')::date;
begin
  select * into v_account from public.trading_accounts
   where id = p_account_id and user_id = p_user_id for update;
  if not found then raise exception 'Trading account not found'; end if;

  select * into v_plan from public.challenge_plans where id = v_account.plan_id;
  if not found then raise exception 'Challenge plan not found'; end if;

  if not exists (select 1 from public.account_daily_metrics where account_id=p_account_id and trade_date=v_today) then
    update public.trading_accounts
       set daily_start_balance=balance, daily_start_equity=equity, daily_pnl=0, updated_at=now()
     where id=p_account_id
     returning * into v_account;
    insert into public.account_daily_metrics(account_id,user_id,trade_date,start_balance,end_balance,start_equity,end_equity)
    values(p_account_id,p_user_id,v_today,v_account.balance,v_account.balance,v_account.equity,v_account.equity)
    on conflict(account_id,trade_date) do nothing;
  end if;

  for v_trade in select * from public.trades where account_id=p_account_id and closed_at is null loop
    v_mark := nullif(p_marks ->> v_trade.symbol, '')::numeric;
    if v_mark is null or v_mark <= 0 then raise exception 'Missing trusted mark for %', v_trade.symbol; end if;
    v_unrealized := v_unrealized + case when v_trade.side='long'
      then (v_mark-v_trade.entry_price)*v_trade.quantity
      else (v_trade.entry_price-v_mark)*v_trade.quantity end;
  end loop;

  v_equity := greatest(0, v_account.balance + v_unrealized);
  v_daily_floor := v_account.daily_start_balance * (1 - v_plan.daily_loss_limit_pct/100);
  v_static_floor := v_account.starting_balance * (1 - v_plan.max_loss_limit_pct/100);
  v_breached := v_equity <= v_daily_floor or v_equity <= v_static_floor;

  update public.trading_accounts set
    equity=v_equity,
    total_pnl=v_equity-starting_balance,
    daily_pnl=v_equity-daily_start_balance,
    high_water_mark=greatest(high_water_mark,v_equity),
    status=case when v_breached and status='active' then 'breached' else status end,
    ended_at=case when v_breached and status='active' then now() else ended_at end,
    last_synced_at=now(), updated_at=now()
  where id=p_account_id returning * into v_account;

  update public.account_daily_metrics set
    end_balance=v_account.balance,
    end_equity=v_account.equity,
    unrealized_pnl=v_unrealized,
    max_intraday_drawdown_pct=greatest(max_intraday_drawdown_pct,
      case when start_balance>0 then greatest(0,(start_balance-v_account.equity)/start_balance*100) else 0 end)
  where account_id=p_account_id and trade_date=v_today;

  return jsonb_build_object(
    'account',to_jsonb(v_account),
    'plan',jsonb_build_object('name',v_plan.name,'dailyLossPct',v_plan.daily_loss_limit_pct,
      'maxLossPct',v_plan.max_loss_limit_pct,'profitTargetPct',v_plan.profit_target_pct,'maxLeverage',v_plan.leverage_ratio),
    'unrealizedPnl',v_unrealized,'dailyFloor',v_daily_floor,'staticFloor',v_static_floor,
    'positions',coalesce((select jsonb_agg(to_jsonb(t) order by t.opened_at desc) from public.trades t where t.account_id=p_account_id and t.closed_at is null),'[]'::jsonb),
    'recentTrades',coalesce((select jsonb_agg(to_jsonb(t) order by t.closed_at desc) from (select * from public.trades where account_id=p_account_id and closed_at is not null order by closed_at desc limit 20) t),'[]'::jsonb)
  );
end;
$function$;

create or replace function public.internal_open_sim_trade(
  p_user_id uuid,
  p_account_id uuid,
  p_symbol text,
  p_side text,
  p_margin numeric,
  p_leverage integer,
  p_mark numeric,
  p_marks jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account public.trading_accounts%rowtype;
  v_plan public.challenge_plans%rowtype;
  v_open_margin numeric;
  v_quantity numeric;
begin
  if p_symbol not in ('BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT') then raise exception 'Unsupported symbol'; end if;
  if p_side not in ('long','short') then raise exception 'Invalid side'; end if;
  if p_margin < 10 or p_mark <= 0 then raise exception 'Invalid order size or price'; end if;

  select * into v_account from public.trading_accounts where id=p_account_id and user_id=p_user_id for update;
  if not found then raise exception 'Trading account not found'; end if;
  if v_account.status <> 'active' then raise exception 'Trading account is not active'; end if;
  select * into v_plan from public.challenge_plans where id=v_account.plan_id;
  if p_leverage < 1 or p_leverage > v_plan.leverage_ratio then raise exception 'Leverage exceeds plan limit'; end if;

  select coalesce(sum((metadata->>'margin_usdt')::numeric),0) into v_open_margin
    from public.trades where account_id=p_account_id and closed_at is null;
  if v_open_margin + p_margin > v_account.balance then raise exception 'Insufficient simulated margin'; end if;

  v_quantity := (p_margin*p_leverage)/p_mark;
  insert into public.trades(account_id,user_id,provider_trade_id,symbol,side,quantity,leverage,entry_price,opened_at,metadata)
  values(p_account_id,p_user_id,'SIM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20)),p_symbol,p_side,v_quantity,p_leverage,p_mark,now(),
    jsonb_build_object('margin_usdt',p_margin,'notional_usdt',p_margin*p_leverage,'mark_source','binance_usdm','fee_rate',0.0004));

  return public.internal_sync_sim_account(p_user_id,p_account_id,p_marks);
end;
$function$;

create or replace function public.internal_close_sim_trade(
  p_user_id uuid,
  p_account_id uuid,
  p_trade_id uuid,
  p_mark numeric,
  p_marks jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account public.trading_accounts%rowtype;
  v_trade public.trades%rowtype;
  v_gross numeric;
  v_fees numeric;
  v_net numeric;
  v_today date := (now() at time zone 'utc')::date;
begin
  if p_mark <= 0 then raise exception 'Invalid trusted mark'; end if;
  select * into v_account from public.trading_accounts where id=p_account_id and user_id=p_user_id for update;
  if not found then raise exception 'Trading account not found'; end if;
  select * into v_trade from public.trades where id=p_trade_id and account_id=p_account_id and user_id=p_user_id and closed_at is null for update;
  if not found then raise exception 'Open position not found'; end if;

  v_gross := case when v_trade.side='long' then (p_mark-v_trade.entry_price)*v_trade.quantity else (v_trade.entry_price-p_mark)*v_trade.quantity end;
  v_fees := ((v_trade.entry_price+p_mark)*v_trade.quantity)*0.0004;
  v_net := v_gross-v_fees;
  update public.trades set exit_price=p_mark,realized_pnl=v_net,fees=v_fees,closed_at=now(),
    metadata=metadata||jsonb_build_object('gross_pnl',v_gross,'exit_mark_source','binance_usdm') where id=p_trade_id;
  update public.trading_accounts set balance=greatest(0,balance+v_net),updated_at=now() where id=p_account_id;
  update public.account_daily_metrics set realized_pnl=realized_pnl+v_net,trade_count=trade_count+1
    where account_id=p_account_id and trade_date=v_today;
  if not found then
    insert into public.account_daily_metrics(account_id,user_id,trade_date,start_balance,end_balance,start_equity,end_equity,realized_pnl,trade_count)
    values(p_account_id,p_user_id,v_today,v_account.daily_start_balance,greatest(0,v_account.balance+v_net),v_account.daily_start_equity,greatest(0,v_account.balance+v_net),v_net,1);
  end if;
  update public.trading_accounts set trading_days=(select count(*) from public.account_daily_metrics where account_id=p_account_id and trade_count>0) where id=p_account_id;
  return public.internal_sync_sim_account(p_user_id,p_account_id,p_marks);
end;
$function$;

revoke all on function public.internal_sync_sim_account(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.internal_open_sim_trade(uuid,uuid,text,text,numeric,integer,numeric,jsonb) from public,anon,authenticated;
revoke all on function public.internal_close_sim_trade(uuid,uuid,uuid,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.internal_sync_sim_account(uuid,uuid,jsonb) to service_role;
grant execute on function public.internal_open_sim_trade(uuid,uuid,text,text,numeric,integer,numeric,jsonb) to service_role;
grant execute on function public.internal_close_sim_trade(uuid,uuid,uuid,numeric,jsonb) to service_role;
