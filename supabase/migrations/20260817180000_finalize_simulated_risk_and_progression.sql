create unique index if not exists trading_accounts_source_step_unique
 on public.trading_accounts(source_account_id,evaluation_step) where source_account_id is not null;

create or replace function public.internal_finalize_sim_account(p_user_id uuid,p_account_id uuid,p_marks jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_account public.trading_accounts%rowtype;v_plan public.challenge_plans%rowtype;v_trade public.trades%rowtype;
 v_mark numeric;v_gross numeric;v_fees numeric;v_net numeric;v_target numeric;v_next_phase text;v_next_step integer;v_new_id uuid;v_floor numeric;
begin
 perform public.internal_sync_sim_account(p_user_id,p_account_id,p_marks);
 select * into v_account from public.trading_accounts where id=p_account_id and user_id=p_user_id for update;
 if not found then raise exception 'Trading account not found';end if;
 select * into v_plan from public.challenge_plans where id=v_account.plan_id;

 if v_account.status='breached' then
  for v_trade in select * from public.trades where account_id=p_account_id and closed_at is null for update loop
   v_mark:=nullif(p_marks->>v_trade.symbol,'')::numeric;
   if v_mark is null or v_mark<=0 then raise exception 'Missing trusted mark for %',v_trade.symbol;end if;
   v_gross:=case when v_trade.side='long' then (v_mark-v_trade.entry_price)*v_trade.quantity else (v_trade.entry_price-v_mark)*v_trade.quantity end;
   v_fees:=((v_trade.entry_price+v_mark)*v_trade.quantity)*0.0004;v_net:=v_gross-v_fees;
   update public.trades set exit_price=v_mark,realized_pnl=v_net,fees=v_fees,closed_at=now(),metadata=metadata||jsonb_build_object('gross_pnl',v_gross,'exit_mark_source','validated_multi_provider','close_reason','risk_breach') where id=v_trade.id;
   update public.trading_accounts set balance=greatest(0,balance+v_net) where id=p_account_id;
  end loop;
  update public.trading_accounts set equity=balance,total_pnl=balance-starting_balance,daily_pnl=balance-daily_start_balance,last_synced_at=now(),updated_at=now() where id=p_account_id returning * into v_account;
  v_floor:=greatest(v_account.daily_start_balance*(1-v_plan.daily_loss_limit_pct/100),v_account.starting_balance*(1-v_plan.max_loss_limit_pct/100));
  if not exists(select 1 from public.risk_events where account_id=p_account_id and event_type='loss_limit_breach') then
   insert into public.risk_events(account_id,user_id,event_type,severity,status,measured_value,limit_value,details)
   values(p_account_id,p_user_id,'loss_limit_breach','critical','open',v_account.equity,v_floor,jsonb_build_object('automatic_liquidation',true));
   insert into public.notifications(user_id,notification_type,title,body,action_url) values(p_user_id,'risk_breach','Account locked','Your simulated account exceeded a loss limit and all open positions were closed.','/dashboard');
  end if;
 end if;

 select * into v_account from public.trading_accounts where id=p_account_id;
 v_target:=v_account.starting_balance*(1+coalesce(v_account.evaluation_target_pct,v_plan.profit_target_pct)/100);
 if v_account.phase='challenge' and v_account.status='active' and v_account.balance>=v_target and v_account.trading_days>=v_plan.min_trading_days
    and not exists(select 1 from public.trades where account_id=p_account_id and closed_at is null) then
  update public.trading_accounts set status='passed',ended_at=now(),updated_at=now() where id=p_account_id;
  if not exists(select 1 from public.trading_accounts where source_account_id=p_account_id) then
   v_next_step:=v_account.evaluation_step+1;
   v_next_phase:=case when v_next_step<=v_account.evaluation_steps then 'challenge' else 'funded' end;
   insert into public.trading_accounts(user_id,plan_id,order_id,provider,provider_account_id,display_account_id,phase,status,starting_balance,balance,equity,high_water_mark,daily_start_equity,daily_start_balance,started_at,funded_at,source_account_id,evaluation_step,evaluation_steps,evaluation_target_pct)
   values(p_user_id,v_account.plan_id,v_account.order_id,'takeprop_sim','SIM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20)),'TP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),v_next_phase,'active',v_account.starting_balance,v_account.starting_balance,v_account.starting_balance,v_account.starting_balance,v_account.starting_balance,v_account.starting_balance,now(),case when v_next_phase='funded' then now() else null end,p_account_id,v_next_step,v_account.evaluation_steps,case when v_next_phase='challenge' then coalesce((v_plan.rules->>'phase_2_profit_target_pct')::numeric,v_plan.profit_target_pct) else null end) returning id into v_new_id;
   insert into public.notifications(user_id,notification_type,title,body,action_url) values(p_user_id,'account_advanced',case when v_next_phase='funded' then 'Funded account created' else 'Next evaluation step unlocked' end,case when v_next_phase='funded' then 'You passed the evaluation. Your funded simulated account is ready.' else 'You passed step '||v_account.evaluation_step||'. Step '||v_next_step||' is ready.' end,'/dashboard');
  end if;
 end if;
 return public.internal_sync_sim_account(p_user_id,p_account_id,p_marks);
end;$function$;
revoke all on function public.internal_finalize_sim_account(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.internal_finalize_sim_account(uuid,uuid,jsonb) to service_role;

-- Provider labels are deliberately neutral because the execution reference is validated across providers.
update public.trades set metadata=jsonb_set(metadata,'{mark_source}','"validated_multi_provider"'::jsonb,true)
where metadata->>'mark_source'='binance_usdm';
