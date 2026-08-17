alter table public.orders add column if not exists reviewed_by uuid references auth.users(id), add column if not exists reviewed_at timestamptz, add column if not exists review_note text;
create or replace function private.review_usdt_order(p_order_id uuid,p_decision text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; p public.challenge_plans%rowtype; a uuid; reviewer uuid := (select auth.uid());
begin
 if reviewer is null or not private.has_app_role(array['admin','finance']) then raise exception 'Not authorized'; end if;
 if p_decision not in ('approve','reject') then raise exception 'Invalid decision'; end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if o.status<>'pending' then raise exception 'Order has already been reviewed'; end if;
 if o.payment_provider not in ('usdt_bep20','usdt_erc20','usdt_trc20','usdt_ton') then raise exception 'Unsupported payment provider'; end if;
 if p_decision='reject' then
  update public.orders set status='failed',reviewed_by=reviewer,reviewed_at=now(),review_note=nullif(trim(p_note),'') where id=p_order_id;
  return jsonb_build_object('ok',true,'status','failed');
 end if;
 select * into p from public.challenge_plans where id=o.plan_id;
 if not found then raise exception 'Plan not found'; end if;
 insert into public.trading_accounts(user_id,plan_id,order_id,provider,provider_account_id,display_account_id,phase,status,starting_balance,balance,equity,high_water_mark,daily_start_equity,daily_start_balance,total_pnl,daily_pnl,started_at)
 values(o.user_id,o.plan_id,o.id,'takeprop_simulated','order-'||o.id,'TP-'||upper(substr(replace(o.id::text,'-',''),1,10)),'challenge','active',p.account_size,p.account_size,p.account_size,p.account_size,p.account_size,p.account_size,0,0,now()) returning id into a;
 update public.orders set status='paid',paid_at=now(),reviewed_by=reviewer,reviewed_at=now(),review_note=nullif(trim(p_note),'') where id=p_order_id;
 return jsonb_build_object('ok',true,'status','paid','account_id',a);
end $$;
revoke all on function private.review_usdt_order(uuid,text,text) from public,anon,authenticated;
grant execute on function private.review_usdt_order(uuid,text,text) to authenticated;
create or replace function public.admin_review_usdt_order(p_order_id uuid,p_decision text,p_note text default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.review_usdt_order(p_order_id,p_decision,p_note); $$;
revoke all on function public.admin_review_usdt_order(uuid,text,text) from public,anon;
grant execute on function public.admin_review_usdt_order(uuid,text,text) to authenticated;
grant select on public.user_roles to authenticated;
