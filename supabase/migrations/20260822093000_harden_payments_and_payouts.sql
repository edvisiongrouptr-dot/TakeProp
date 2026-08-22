begin;

alter table public.payout_requests
  add column if not exists rule_snapshot jsonb not null default '{}'::jsonb;

update public.payout_requests r set rule_snapshot=jsonb_build_object(
  'version',1,
  'profitSplitPct',r.profit_split_pct,
  'minimumPayoutUsd',coalesce(nullif(a.rule_snapshot->>'minimumPayoutUsd','')::numeric,50),
  'capturedAt',coalesce(r.requested_at,now())
)
from public.trading_accounts a
where a.id=r.account_id and r.rule_snapshot='{}'::jsonb;

create unique index if not exists payout_provider_reference_unique
  on public.payout_requests(method,lower(provider_payout_id))
  where provider_payout_id is not null;

create or replace function private.order_rule_snapshot(p_order public.orders,p_plan public.challenge_plans)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'version',1,
  'challengeType',coalesce(p_order.plan_snapshot->>'challenge_type',p_order.plan_snapshot->'rules'->>'challenge_type',p_plan.rules->>'challenge_type','one_step'),
  'dailyLossPct',coalesce(nullif(p_order.plan_snapshot->>'daily_loss_limit_pct','')::numeric,p_plan.daily_loss_limit_pct),
  'maxLossPct',coalesce(nullif(p_order.plan_snapshot->>'max_loss_limit_pct','')::numeric,p_plan.max_loss_limit_pct),
  'profitTargetPct',coalesce(nullif(p_order.plan_snapshot->>'profit_target_pct','')::numeric,p_plan.profit_target_pct),
  'phase2ProfitTargetPct',coalesce(nullif(p_order.plan_snapshot->>'phase_2_profit_target_pct','')::numeric,nullif(p_order.plan_snapshot->'rules'->>'phase_2_profit_target_pct','')::numeric,nullif(p_plan.rules->>'phase_2_profit_target_pct','')::numeric,8),
  'minTradingDays',coalesce(nullif(p_order.plan_snapshot->>'min_trading_days','')::integer,p_plan.min_trading_days),
  'maxLeverage',coalesce(nullif(p_order.plan_snapshot->>'leverage_ratio','')::integer,p_plan.leverage_ratio),
  'profitSplitPct',coalesce(nullif(p_order.plan_snapshot->>'profit_split_pct','')::numeric,p_plan.profit_split_pct),
  'minimumPayoutUsd',coalesce(nullif(p_order.plan_snapshot->>'minimum_payout_usd','')::numeric,nullif(p_order.plan_snapshot->'rules'->>'minimum_payout_usd','')::numeric,nullif(p_plan.rules->>'minimum_payout_usd','')::numeric,50),
  'capturedAt',now()
 );
$$;

create or replace function public.internal_finalize_verified_usdt_order(
 p_order_id uuid,p_confirmations integer,p_amount numeric,p_recipient text,p_evidence jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype;v_plan public.challenge_plans%rowtype;v_account_id uuid;v_required integer;
begin
 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found';end if;
 select id into v_account_id from public.trading_accounts where order_id=v_order.id limit 1;
 if v_order.status='paid' and v_account_id is not null then return v_account_id;end if;
 if v_order.status<>'pending' then raise exception 'Pending order not found';end if;
 v_required:=case v_order.payment_provider when 'usdt_bep20' then 15 when 'usdt_erc20' then 12 when 'usdt_trc20' then 20 when 'usdt_ton' then 1 else null end;
 if v_required is null then raise exception 'Unsupported payment provider';end if;
 if coalesce(p_confirmations,0)<v_required then raise exception 'Insufficient confirmations';end if;
 if lower(trim(p_recipient))<>lower(trim(v_order.provider_checkout_id)) then raise exception 'Recipient mismatch';end if;
 if p_amount<v_order.amount then raise exception 'Payment amount is insufficient';end if;
 select * into v_plan from public.challenge_plans where id=v_order.plan_id;
 if not found then raise exception 'Plan is unavailable';end if;
 if v_account_id is null then
  insert into public.trading_accounts(user_id,plan_id,order_id,provider,provider_account_id,display_account_id,phase,status,starting_balance,balance,equity,high_water_mark,daily_start_equity,daily_start_balance,total_pnl,daily_pnl,started_at,rule_snapshot)
  values(v_order.user_id,v_order.plan_id,v_order.id,'takeprop_simulated','order-'||v_order.id,'TP-'||upper(substr(replace(v_order.id::text,'-',''),1,10)),'challenge','active',v_plan.account_size,v_plan.account_size,v_plan.account_size,v_plan.account_size,v_plan.account_size,v_plan.account_size,0,0,now(),private.order_rule_snapshot(v_order,v_plan))
  returning id into v_account_id;
 end if;
 update public.orders set status='paid',paid_at=coalesce(paid_at,now()),verification_status='verified',verification_confirmations=p_confirmations,
  verification_amount=p_amount,verification_recipient=trim(p_recipient),verification_error=null,verification_evidence=coalesce(p_evidence,'{}'::jsonb),verified_at=now(),review_note='Automatically verified on-chain'
 where id=p_order_id;
 insert into public.notifications(user_id,notification_type,title,body,action_url)
 values(v_order.user_id,'payment_verified','Payment verified','Your USDT payment was verified and your simulated challenge account is ready.','/dashboard');
 return v_account_id;
end$$;

create or replace function private.review_usdt_order(p_order_id uuid,p_decision text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;p public.challenge_plans%rowtype;a uuid;reviewer uuid:=auth.uid();before_row jsonb;
begin
 if reviewer is null or not private.has_app_role(array['admin','finance']) then raise exception 'Not authorized';end if;
 if p_decision not in ('approve','reject') then raise exception 'Invalid decision';end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found';end if;
 if o.status<>'pending' then raise exception 'Order has already been reviewed';end if;
 if o.payment_provider not in ('usdt_bep20','usdt_erc20','usdt_trc20','usdt_ton') then raise exception 'Unsupported payment provider';end if;
 before_row:=to_jsonb(o);
 if p_decision='reject' then
  if char_length(trim(coalesce(p_note,'')))<3 then raise exception 'Rejection reason is required';end if;
  update public.orders set status='failed',verification_status='failed',verification_error=left(trim(p_note),500),reviewed_by=reviewer,reviewed_at=now(),review_note=trim(p_note) where id=p_order_id;
  insert into public.admin_audit_log(actor_user_id,action,entity_type,entity_id,before_state,after_state,reason)
  values(reviewer,'payment.reject','order',p_order_id,before_row,jsonb_build_object('status','failed'),trim(p_note));
  return jsonb_build_object('ok',true,'status','failed');
 end if;
 select * into p from public.challenge_plans where id=o.plan_id;
 if not found then raise exception 'Plan not found';end if;
 select id into a from public.trading_accounts where order_id=o.id limit 1;
 if a is null then
  insert into public.trading_accounts(user_id,plan_id,order_id,provider,provider_account_id,display_account_id,phase,status,starting_balance,balance,equity,high_water_mark,daily_start_equity,daily_start_balance,total_pnl,daily_pnl,started_at,rule_snapshot)
  values(o.user_id,o.plan_id,o.id,'takeprop_simulated','order-'||o.id,'TP-'||upper(substr(replace(o.id::text,'-',''),1,10)),'challenge','active',p.account_size,p.account_size,p.account_size,p.account_size,p.account_size,p.account_size,0,0,now(),private.order_rule_snapshot(o,p)) returning id into a;
 end if;
 update public.orders set status='paid',paid_at=coalesce(paid_at,now()),verification_status='verified',verification_evidence=verification_evidence||jsonb_build_object('manualReview',true,'reviewer',reviewer),reviewed_by=reviewer,reviewed_at=now(),review_note=nullif(trim(p_note),'') where id=p_order_id;
 insert into public.admin_audit_log(actor_user_id,action,entity_type,entity_id,before_state,after_state,reason)
 values(reviewer,'payment.approve','order',p_order_id,before_row,jsonb_build_object('status','paid','accountId',a),nullif(trim(p_note),''));
 return jsonb_build_object('ok',true,'status','paid','account_id',a);
end$$;

create or replace function public.request_payout(p_account_id uuid,p_amount numeric,p_method text,p_destination_ref text)
returns public.payout_requests language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_account public.trading_accounts%rowtype;v_reserved numeric:=0;v_available numeric;v_result public.payout_requests%rowtype;v_min numeric;v_split numeric;
begin
 if v_user is null then raise exception 'Authentication required';end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Enter a valid amount with at most two decimals';end if;
 if p_method not in ('USDT_BEP20','USDT_ERC20','USDT_TRC20','USDT_TON') then raise exception 'Unsupported payout network';end if;
 select * into v_account from public.trading_accounts where id=p_account_id and user_id=v_user for update;
 if not found or v_account.phase<>'funded' or v_account.status<>'active' then raise exception 'Only an active funded account can request a payout';end if;
 if exists(select 1 from public.trades where account_id=p_account_id and closed_at is null) or exists(select 1 from public.pending_orders where account_id=p_account_id and status='pending') then raise exception 'Close positions and cancel pending orders first';end if;
 if not exists(select 1 from public.profiles where id=v_user and kyc_status='approved') then raise exception 'KYC approval is required before a payout';end if;
 v_split:=coalesce(nullif(v_account.rule_snapshot->>'profitSplitPct','')::numeric,0);
 v_min:=coalesce(nullif(v_account.rule_snapshot->>'minimumPayoutUsd','')::numeric,50);
 if v_split<=0 then raise exception 'Frozen payout rules are missing; contact support';end if;
 select coalesce(sum(amount),0) into v_reserved from public.payout_requests where account_id=p_account_id and status in ('requested','under_review','approved','processing','paid');
 v_available:=greatest(0,(v_account.balance-v_account.starting_balance)*v_split/100-v_reserved);
 if p_amount<v_min then raise exception 'Minimum payout is % USDT',v_min;end if;
 if p_amount>round(v_available,2) then raise exception 'Amount exceeds available payout of % USDT',round(v_available,2);end if;
 insert into public.payout_requests(user_id,account_id,amount,currency,profit_split_pct,status,method,destination_ref,rule_snapshot)
 values(v_user,p_account_id,p_amount,'USD',v_split,'requested',p_method,trim(p_destination_ref),jsonb_build_object('version',1,'profitSplitPct',v_split,'minimumPayoutUsd',v_min,'capturedAt',now())) returning * into v_result;
 insert into public.notifications(user_id,notification_type,title,body,action_url) values(v_user,'payout_requested','Payout request received','Your payout request is waiting for operations review.','/payouts');
 return v_result;
end$$;

create or replace function public.admin_review_payout(p_request_id uuid,p_decision text,p_reason text default null,p_provider_payout_id text default null)
returns public.payout_requests language plpgsql security definer set search_path='' as $$
declare v_request public.payout_requests%rowtype;v_status text;v_actor uuid:=auth.uid();v_before jsonb;v_ref text:=nullif(trim(p_provider_payout_id),'');
begin
 if v_actor is null or not exists(select 1 from public.user_roles where user_id=v_actor and role in ('admin','finance')) then raise exception 'Not authorized';end if;
 if p_decision not in ('approve','reject','mark_processing','mark_paid') then raise exception 'Invalid decision';end if;
 select * into v_request from public.payout_requests where id=p_request_id for update;
 if not found then raise exception 'Payout request not found';end if;
 v_before:=to_jsonb(v_request);
 v_status:=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' when 'mark_processing' then 'processing' else 'paid' end;
 if v_request.status=v_status and (v_status<>'paid' or lower(coalesce(v_request.provider_payout_id,''))=lower(coalesce(v_ref,''))) then return v_request;end if;
 if (p_decision in ('approve','reject') and v_request.status<>'requested') or (p_decision='mark_processing' and v_request.status<>'approved') or (p_decision='mark_paid' and v_request.status<>'processing') then raise exception 'Invalid payout status transition';end if;
 if p_decision='reject' and char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'Rejection reason is required';end if;
 if p_decision='mark_paid' then
  if v_ref is null then raise exception 'Payout transaction reference is required';end if;
  if v_request.method in ('USDT_BEP20','USDT_ERC20') and v_ref!~'^0x[0-9A-Fa-f]{64}$' then raise exception 'Invalid EVM transaction hash';end if;
  if v_request.method='USDT_TRC20' and v_ref!~'^[0-9A-Fa-f]{64}$' then raise exception 'Invalid TRON transaction hash';end if;
  if v_request.method='USDT_TON' and v_ref!~'^[A-Za-z0-9_-]{43,44}$' then raise exception 'Invalid TON transaction hash';end if;
 end if;
 update public.payout_requests set status=v_status,rejection_reason=case when p_decision='reject' then trim(p_reason) else null end,provider_payout_id=coalesce(v_ref,provider_payout_id),reviewed_at=coalesce(reviewed_at,now()),paid_at=case when p_decision='mark_paid' then now() else paid_at end,updated_at=now() where id=p_request_id returning * into v_request;
 insert into public.admin_audit_log(actor_user_id,action,entity_type,entity_id,before_state,after_state,reason)
 values(v_actor,'payout.'||p_decision,'payout_request',p_request_id,v_before,to_jsonb(v_request),nullif(trim(p_reason),''));
 insert into public.notifications(user_id,notification_type,title,body,action_url) values(v_request.user_id,'payout_'||v_status,case when v_status='paid' then 'Payout sent' when v_status='rejected' then 'Payout rejected' else 'Payout updated' end,case when v_status='rejected' then trim(p_reason) else 'Your payout status is now '||replace(v_status,'_',' ')||'.' end,'/payouts');
 return v_request;
end$$;

revoke all on function private.order_rule_snapshot(public.orders,public.challenge_plans) from public,anon,authenticated;
revoke all on function public.internal_finalize_verified_usdt_order(uuid,integer,numeric,text,jsonb) from public,anon,authenticated;
grant execute on function public.internal_finalize_verified_usdt_order(uuid,integer,numeric,text,jsonb) to service_role;
revoke all on function public.request_payout(uuid,numeric,text,text) from public,anon;
grant execute on function public.request_payout(uuid,numeric,text,text) to authenticated;
revoke all on function public.admin_review_payout(uuid,text,text,text) from public,anon;
grant execute on function public.admin_review_payout(uuid,text,text,text) to authenticated;

commit;
