-- Advanced simulated orders. All mutations stay server-owned and are serialized
-- on the trading account row to prevent duplicate fills and margin races.
alter table public.trades add column if not exists stop_loss numeric(28,8);
alter table public.trades add column if not exists take_profit numeric(28,8);
alter table public.trades add column if not exists close_reason text;

create table if not exists public.pending_orders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol in ('BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT')),
  side text not null check (side in ('long','short')),
  order_type text not null check (order_type in ('limit','stop')),
  margin numeric(28,8) not null check (margin >= 10),
  leverage integer not null check (leverage between 1 and 100),
  trigger_price numeric(28,8) not null check (trigger_price > 0),
  stop_loss numeric(28,8),
  take_profit numeric(28,8),
  status text not null default 'pending' check (status in ('pending','filled','canceled','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  filled_at timestamptz,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists pending_orders_account_status_idx
  on public.pending_orders(account_id,status,created_at);
create index if not exists pending_orders_trigger_idx
  on public.pending_orders(symbol,status,order_type,trigger_price) where status='pending';

alter table public.pending_orders enable row level security;
drop policy if exists "Users read own pending orders" on public.pending_orders;
create policy "Users read own pending orders" on public.pending_orders
  for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.pending_orders from anon;
revoke insert,update,delete on public.pending_orders from authenticated;
grant select on public.pending_orders to authenticated;

create or replace function public.internal_validate_protection(
  p_side text,p_reference numeric,p_stop_loss numeric,p_take_profit numeric
) returns void language plpgsql immutable set search_path=''
as $function$
begin
 if p_reference is null or p_reference<=0 then raise exception 'Invalid reference price'; end if;
 if p_stop_loss is not null and p_stop_loss<=0 then raise exception 'Invalid stop-loss price'; end if;
 if p_take_profit is not null and p_take_profit<=0 then raise exception 'Invalid take-profit price'; end if;
 if p_side='long' then
  if p_stop_loss is not null and p_stop_loss>=p_reference then raise exception 'Long stop loss must be below the entry reference'; end if;
  if p_take_profit is not null and p_take_profit<=p_reference then raise exception 'Long take profit must be above the entry reference'; end if;
 elsif p_side='short' then
  if p_stop_loss is not null and p_stop_loss<=p_reference then raise exception 'Short stop loss must be above the entry reference'; end if;
  if p_take_profit is not null and p_take_profit>=p_reference then raise exception 'Short take profit must be below the entry reference'; end if;
 else raise exception 'Invalid side'; end if;
end;$function$;

create or replace function public.internal_open_sim_trade_advanced(
 p_user_id uuid,p_account_id uuid,p_symbol text,p_side text,p_margin numeric,
 p_leverage integer,p_mark numeric,p_stop_loss numeric,p_take_profit numeric,p_marks jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_account public.trading_accounts%rowtype;v_plan public.challenge_plans%rowtype;
 v_reserved numeric;v_quantity numeric;v_trade_id uuid;
begin
 if p_symbol not in ('BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT') then raise exception 'Unsupported symbol'; end if;
 if p_side not in ('long','short') or p_margin<10 or p_mark<=0 then raise exception 'Invalid order'; end if;
 perform public.internal_validate_protection(p_side,p_mark,p_stop_loss,p_take_profit);
 select * into v_account from public.trading_accounts where id=p_account_id and user_id=p_user_id for update;
 if not found then raise exception 'Trading account not found'; end if;
 if v_account.status<>'active' then raise exception 'Trading account is not active'; end if;
 select * into v_plan from public.challenge_plans where id=v_account.plan_id;
 if p_leverage<1 or p_leverage>v_plan.leverage_ratio then raise exception 'Leverage exceeds plan limit'; end if;
 select coalesce((select sum((metadata->>'margin_usdt')::numeric) from public.trades where account_id=p_account_id and closed_at is null),0)
      +coalesce((select sum(margin) from public.pending_orders where account_id=p_account_id and status='pending'),0) into v_reserved;
 if v_reserved+p_margin>v_account.balance then raise exception 'Insufficient simulated margin'; end if;
 v_quantity:=(p_margin*p_leverage)/p_mark;
 insert into public.trades(account_id,user_id,provider_trade_id,symbol,side,quantity,leverage,entry_price,stop_loss,take_profit,opened_at,metadata)
 values(p_account_id,p_user_id,'SIM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20)),p_symbol,p_side,v_quantity,p_leverage,p_mark,p_stop_loss,p_take_profit,now(),
 jsonb_build_object('margin_usdt',p_margin,'notional_usdt',p_margin*p_leverage,'mark_source','validated_multi_provider','fee_rate',0.0004)) returning id into v_trade_id;
 return public.internal_sync_sim_account(p_user_id,p_account_id,p_marks)||jsonb_build_object('openedTradeId',v_trade_id);
end;$function$;

create or replace function public.internal_place_pending_order(
 p_user_id uuid,p_account_id uuid,p_symbol text,p_side text,p_order_type text,
 p_margin numeric,p_leverage integer,p_trigger_price numeric,p_stop_loss numeric,
 p_take_profit numeric,p_current_mark numeric
) returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_account public.trading_accounts%rowtype;v_plan public.challenge_plans%rowtype;v_reserved numeric;v_id uuid;
begin
 if p_symbol not in ('BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT') or p_side not in ('long','short') then raise exception 'Invalid market'; end if;
 if p_order_type not in ('limit','stop') or p_margin<10 or p_trigger_price<=0 or p_current_mark<=0 then raise exception 'Invalid pending order'; end if;
 if (p_order_type='limit' and p_side='long' and p_trigger_price>=p_current_mark)
 or (p_order_type='limit' and p_side='short' and p_trigger_price<=p_current_mark)
 or (p_order_type='stop' and p_side='long' and p_trigger_price<=p_current_mark)
 or (p_order_type='stop' and p_side='short' and p_trigger_price>=p_current_mark) then raise exception 'Trigger price is on the wrong side of the current mark'; end if;
 perform public.internal_validate_protection(p_side,p_trigger_price,p_stop_loss,p_take_profit);
 select * into v_account from public.trading_accounts where id=p_account_id and user_id=p_user_id for update;
 if not found or v_account.status<>'active' then raise exception 'Trading account is not active'; end if;
 select * into v_plan from public.challenge_plans where id=v_account.plan_id;
 if p_leverage<1 or p_leverage>v_plan.leverage_ratio then raise exception 'Leverage exceeds plan limit'; end if;
 select coalesce((select sum((metadata->>'margin_usdt')::numeric) from public.trades where account_id=p_account_id and closed_at is null),0)
      +coalesce((select sum(margin) from public.pending_orders where account_id=p_account_id and status='pending'),0) into v_reserved;
 if v_reserved+p_margin>v_account.balance then raise exception 'Insufficient simulated margin'; end if;
 insert into public.pending_orders(account_id,user_id,symbol,side,order_type,margin,leverage,trigger_price,stop_loss,take_profit,metadata)
 values(p_account_id,p_user_id,p_symbol,p_side,p_order_type,p_margin,p_leverage,p_trigger_price,p_stop_loss,p_take_profit,
 jsonb_build_object('created_mark',p_current_mark,'mark_source','validated_multi_provider')) returning id into v_id;
 return v_id;
end;$function$;

create or replace function public.internal_cancel_pending_order(p_user_id uuid,p_account_id uuid,p_order_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
begin
 perform 1 from public.trading_accounts where id=p_account_id and user_id=p_user_id for update;
 if not found then raise exception 'Trading account not found'; end if;
 update public.pending_orders set status='canceled',canceled_at=now(),updated_at=now()
 where id=p_order_id and account_id=p_account_id and user_id=p_user_id and status='pending';
 if not found then raise exception 'Pending order not found'; end if;
end;$function$;

create or replace function public.internal_process_advanced_orders(p_user_id uuid,p_account_id uuid,p_marks jsonb)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_account public.trading_accounts%rowtype;v_order public.pending_orders%rowtype;v_trade public.trades%rowtype;
 v_mark numeric;v_triggered boolean;v_quantity numeric;v_gross numeric;v_fees numeric;v_net numeric;v_today date:=(now() at time zone 'utc')::date;
begin
 select * into v_account from public.trading_accounts where id=p_account_id and user_id=p_user_id for update;
 if not found then raise exception 'Trading account not found'; end if;
 if v_account.status<>'active' then return; end if;
 for v_trade in select * from public.trades where account_id=p_account_id and closed_at is null for update loop
  v_mark:=nullif(p_marks->>v_trade.symbol,'')::numeric;
  v_triggered:=(v_trade.side='long' and ((v_trade.stop_loss is not null and v_mark<=v_trade.stop_loss) or (v_trade.take_profit is not null and v_mark>=v_trade.take_profit)))
    or (v_trade.side='short' and ((v_trade.stop_loss is not null and v_mark>=v_trade.stop_loss) or (v_trade.take_profit is not null and v_mark<=v_trade.take_profit)));
  if v_triggered then
   v_gross:=case when v_trade.side='long' then (v_mark-v_trade.entry_price)*v_trade.quantity else (v_trade.entry_price-v_mark)*v_trade.quantity end;
   v_fees:=((v_trade.entry_price+v_mark)*v_trade.quantity)*0.0004;v_net:=v_gross-v_fees;
   update public.trades set exit_price=v_mark,realized_pnl=v_net,fees=v_fees,closed_at=now(),
    close_reason=case when (v_trade.side='long' and v_mark<=v_trade.stop_loss) or (v_trade.side='short' and v_mark>=v_trade.stop_loss) then 'stop_loss' else 'take_profit' end where id=v_trade.id;
   update public.trading_accounts set balance=greatest(0,balance+v_net),updated_at=now() where id=p_account_id;
   update public.account_daily_metrics set realized_pnl=realized_pnl+v_net,trade_count=trade_count+1
    where account_id=p_account_id and trade_date=v_today;
   if not found then
    insert into public.account_daily_metrics(account_id,user_id,trade_date,start_balance,end_balance,start_equity,end_equity,realized_pnl,trade_count)
    values(p_account_id,p_user_id,v_today,v_account.daily_start_balance,greatest(0,v_account.balance+v_net),v_account.daily_start_equity,greatest(0,v_account.balance+v_net),v_net,1);
   end if;
  end if;
 end loop;
 for v_order in select * from public.pending_orders where account_id=p_account_id and status='pending' order by created_at for update skip locked loop
  v_mark:=nullif(p_marks->>v_order.symbol,'')::numeric;
  v_triggered:=(v_order.order_type='limit' and ((v_order.side='long' and v_mark<=v_order.trigger_price) or (v_order.side='short' and v_mark>=v_order.trigger_price)))
    or (v_order.order_type='stop' and ((v_order.side='long' and v_mark>=v_order.trigger_price) or (v_order.side='short' and v_mark<=v_order.trigger_price)));
  if v_triggered then
   v_quantity:=(v_order.margin*v_order.leverage)/v_mark;
   insert into public.trades(account_id,user_id,provider_trade_id,symbol,side,quantity,leverage,entry_price,stop_loss,take_profit,opened_at,metadata)
   values(p_account_id,p_user_id,'SIM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20)),v_order.symbol,v_order.side,v_quantity,v_order.leverage,v_mark,v_order.stop_loss,v_order.take_profit,now(),
    jsonb_build_object('margin_usdt',v_order.margin,'notional_usdt',v_order.margin*v_order.leverage,'mark_source','validated_multi_provider','fee_rate',0.0004,'pending_order_id',v_order.id));
   update public.pending_orders set status='filled',filled_at=now(),updated_at=now(),metadata=metadata||jsonb_build_object('fill_mark',v_mark) where id=v_order.id;
  end if;
 end loop;
 update public.trading_accounts set trading_days=(select count(*) from public.account_daily_metrics where account_id=p_account_id and trade_count>0) where id=p_account_id;
end;$function$;

create or replace function public.internal_cancel_orders_on_account_lock()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
 if old.status='active' and new.status<>'active' then
  update public.pending_orders set status='canceled',canceled_at=now(),updated_at=now(),metadata=metadata||jsonb_build_object('cancel_reason','account_'||new.status)
  where account_id=new.id and status='pending';
 end if;
 return new;
end;$function$;
drop trigger if exists cancel_pending_orders_on_account_lock on public.trading_accounts;
create trigger cancel_pending_orders_on_account_lock after update of status on public.trading_accounts
for each row execute function public.internal_cancel_orders_on_account_lock();

create or replace function public.internal_advanced_snapshot(p_user_id uuid,p_account_id uuid,p_marks jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_result jsonb;
begin
 perform public.internal_process_advanced_orders(p_user_id,p_account_id,p_marks);
 v_result:=public.internal_sync_sim_account(p_user_id,p_account_id,p_marks);
 return v_result||jsonb_build_object('pendingOrders',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc) from public.pending_orders o where o.account_id=p_account_id and o.user_id=p_user_id and o.status='pending'),'[]'::jsonb));
end;$function$;

revoke all on function public.internal_validate_protection(text,numeric,numeric,numeric) from public,anon,authenticated;
revoke all on function public.internal_open_sim_trade_advanced(uuid,uuid,text,text,numeric,integer,numeric,numeric,numeric,jsonb) from public,anon,authenticated;
revoke all on function public.internal_place_pending_order(uuid,uuid,text,text,text,numeric,integer,numeric,numeric,numeric,numeric) from public,anon,authenticated;
revoke all on function public.internal_cancel_pending_order(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.internal_process_advanced_orders(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.internal_advanced_snapshot(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.internal_cancel_orders_on_account_lock() from public,anon,authenticated;
grant execute on function public.internal_validate_protection(text,numeric,numeric,numeric) to service_role;
grant execute on function public.internal_open_sim_trade_advanced(uuid,uuid,text,text,numeric,integer,numeric,numeric,numeric,jsonb) to service_role;
grant execute on function public.internal_place_pending_order(uuid,uuid,text,text,text,numeric,integer,numeric,numeric,numeric,numeric) to service_role;
grant execute on function public.internal_cancel_pending_order(uuid,uuid,uuid) to service_role;
grant execute on function public.internal_process_advanced_orders(uuid,uuid,jsonb) to service_role;
grant execute on function public.internal_advanced_snapshot(uuid,uuid,jsonb) to service_role;
