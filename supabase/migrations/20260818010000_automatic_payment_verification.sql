begin;

alter table public.orders
 add column if not exists verification_status text not null default 'pending' check(verification_status in ('pending','verifying','verified','failed','manual_review')),
 add column if not exists verification_confirmations integer not null default 0,
 add column if not exists verification_amount numeric(28,8),
 add column if not exists verification_recipient text,
 add column if not exists verification_error text,
 add column if not exists verification_evidence jsonb not null default '{}'::jsonb,
 add column if not exists verified_at timestamptz;

create index if not exists orders_verification_queue_idx on public.orders(status,verification_status,created_at)
 where status='pending';

create or replace function public.internal_finalize_verified_usdt_order(
 p_order_id uuid,p_confirmations integer,p_amount numeric,p_recipient text,p_evidence jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order public.orders%rowtype;v_plan public.challenge_plans%rowtype;v_account_id uuid;
begin
 select * into v_order from public.orders where id=p_order_id for update;
 if not found or v_order.status<>'pending' then raise exception 'Pending order not found';end if;
 if v_order.payment_provider not in ('usdt_bep20','usdt_erc20','usdt_trc20','usdt_ton') then raise exception 'Unsupported payment provider';end if;
 if lower(p_recipient)<>lower(v_order.provider_checkout_id) then raise exception 'Recipient mismatch';end if;
 if p_amount<v_order.amount then raise exception 'Payment amount is insufficient';end if;
 select * into v_plan from public.challenge_plans where id=v_order.plan_id and is_active=true;
 if not found then raise exception 'Plan is unavailable';end if;
 select id into v_account_id from public.trading_accounts where order_id=v_order.id limit 1;
 if v_account_id is null then
  insert into public.trading_accounts(user_id,plan_id,order_id,provider,provider_account_id,display_account_id,phase,status,starting_balance,balance,equity,high_water_mark,daily_start_equity,daily_start_balance,total_pnl,daily_pnl,started_at)
  values(v_order.user_id,v_order.plan_id,v_order.id,'takeprop_simulated','order-'||v_order.id,'TP-'||upper(substr(replace(v_order.id::text,'-',''),1,10)),'challenge','active',v_plan.account_size,v_plan.account_size,v_plan.account_size,v_plan.account_size,v_plan.account_size,v_plan.account_size,0,0,now()) returning id into v_account_id;
 end if;
 update public.orders set status='paid',paid_at=now(),verification_status='verified',verification_confirmations=p_confirmations,
  verification_amount=p_amount,verification_recipient=p_recipient,verification_error=null,verification_evidence=p_evidence,verified_at=now(),review_note='Automatically verified on-chain'
 where id=p_order_id;
 insert into public.notifications(user_id,notification_type,title,body,action_url)
 values(v_order.user_id,'payment_verified','Payment verified','Your USDT payment was verified and your simulated challenge account is ready.','/dashboard');
 return v_account_id;
end$$;

create or replace function public.internal_record_payment_verification_failure(p_order_id uuid,p_error text,p_manual boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.orders set verification_status=case when p_manual then 'manual_review' else 'failed' end,verification_error=left(p_error,500)
 where id=p_order_id and status='pending';
end$$;

revoke all on function public.internal_finalize_verified_usdt_order(uuid,integer,numeric,text,jsonb) from public,anon,authenticated;
revoke all on function public.internal_record_payment_verification_failure(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.internal_finalize_verified_usdt_order(uuid,integer,numeric,text,jsonb) to service_role;
grant execute on function public.internal_record_payment_verification_failure(uuid,text,boolean) to service_role;

commit;
