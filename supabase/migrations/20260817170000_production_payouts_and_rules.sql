-- Production rules and server-owned payout workflow.
update public.challenge_plans
set rules=jsonb_set(rules,'{phase_2_profit_target_pct}','8'::jsonb,true),updated_at=now()
where rules->>'challenge_type'='two_step';

alter table public.trading_accounts add column if not exists evaluation_step integer not null default 1;
alter table public.trading_accounts add column if not exists evaluation_steps integer not null default 1;
alter table public.trading_accounts add column if not exists evaluation_target_pct numeric(8,4);
update public.trading_accounts a set
 evaluation_steps=case when coalesce(p.rules->>'challenge_type','')='two_step' then 2 else 1 end,
 evaluation_target_pct=coalesce(a.evaluation_target_pct,p.profit_target_pct)
from public.challenge_plans p where p.id=a.plan_id;

create index if not exists payout_requests_user_status_idx on public.payout_requests(user_id,status,requested_at desc);
create index if not exists payout_requests_account_status_idx on public.payout_requests(account_id,status);

create or replace function public.request_payout(p_account_id uuid,p_amount numeric,p_method text,p_destination_ref text)
returns public.payout_requests
language plpgsql security definer set search_path=''
as $function$
declare
 v_user uuid:=auth.uid(); v_account public.trading_accounts%rowtype; v_plan public.challenge_plans%rowtype;
 v_reserved numeric:=0; v_available numeric; v_result public.payout_requests%rowtype; v_min numeric;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Enter a valid payout amount'; end if;
 if p_method not in ('USDT_BEP20','USDT_ERC20','USDT_TRC20','USDT_TON') then raise exception 'Unsupported payout network'; end if;
 if char_length(trim(coalesce(p_destination_ref,'')))<20 or char_length(trim(p_destination_ref))>128 then raise exception 'Enter a valid destination address'; end if;
 select * into v_account from public.trading_accounts where id=p_account_id and user_id=v_user for update;
 if not found then raise exception 'Funded account not found'; end if;
 if v_account.phase<>'funded' or v_account.status<>'active' then raise exception 'Only an active funded account can request a payout'; end if;
 if exists(select 1 from public.trades where account_id=p_account_id and closed_at is null) then raise exception 'Close all positions before requesting a payout'; end if;
 if not exists(select 1 from public.profiles where id=v_user and kyc_status='approved') then raise exception 'KYC approval is required before a payout'; end if;
 select * into v_plan from public.challenge_plans where id=v_account.plan_id;
 v_min:=coalesce((v_plan.rules->>'minimum_payout_usd')::numeric,50);
 select coalesce(sum(amount),0) into v_reserved from public.payout_requests where account_id=p_account_id and status in ('requested','under_review','approved','processing','paid');
 v_available:=greatest(0,(v_account.balance-v_account.starting_balance)*v_plan.profit_split_pct/100-v_reserved);
 if p_amount<v_min then raise exception 'Minimum payout is % USDT',v_min; end if;
 if p_amount>v_available then raise exception 'Amount exceeds available payout of % USDT',round(v_available,2); end if;
 insert into public.payout_requests(user_id,account_id,amount,currency,profit_split_pct,status,method,destination_ref)
 values(v_user,p_account_id,round(p_amount,2),'USD',v_plan.profit_split_pct,'requested',p_method,trim(p_destination_ref)) returning * into v_result;
 insert into public.notifications(user_id,notification_type,title,body,action_url)
 values(v_user,'payout_requested','Payout request received','Your payout request is waiting for operations review.','/payouts');
 return v_result;
end;$function$;

create or replace function public.admin_review_payout(p_request_id uuid,p_decision text,p_reason text default null,p_provider_payout_id text default null)
returns public.payout_requests
language plpgsql security definer set search_path=''
as $function$
declare v_request public.payout_requests%rowtype; v_status text;
begin
 if not exists(select 1 from public.user_roles where user_id=auth.uid() and role in ('admin','finance')) then raise exception 'Not authorized'; end if;
 if p_decision not in ('approve','reject','mark_processing','mark_paid') then raise exception 'Invalid decision'; end if;
 select * into v_request from public.payout_requests where id=p_request_id for update;
 if not found then raise exception 'Payout request not found'; end if;
 v_status:=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' when 'mark_processing' then 'processing' else 'paid' end;
 if p_decision='reject' and char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'Rejection reason is required'; end if;
 if p_decision='mark_paid' and char_length(trim(coalesce(p_provider_payout_id,'')))<8 then raise exception 'Payout transaction reference is required'; end if;
 update public.payout_requests set status=v_status,rejection_reason=case when p_decision='reject' then trim(p_reason) else null end,
 provider_payout_id=coalesce(nullif(trim(p_provider_payout_id),''),provider_payout_id),reviewed_at=coalesce(reviewed_at,now()),
 paid_at=case when p_decision='mark_paid' then now() else paid_at end,updated_at=now() where id=p_request_id returning * into v_request;
 insert into public.notifications(user_id,notification_type,title,body,action_url) values(v_request.user_id,'payout_'||v_status,
 case when v_status='paid' then 'Payout sent' when v_status='rejected' then 'Payout rejected' else 'Payout updated' end,
 case when v_status='rejected' then coalesce(p_reason,'Request rejected') else 'Your payout status is now '||replace(v_status,'_',' ')||'.' end,'/payouts');
 return v_request;
end;$function$;

revoke all on function public.request_payout(uuid,numeric,text,text) from public,anon;
grant execute on function public.request_payout(uuid,numeric,text,text) to authenticated;
revoke all on function public.admin_review_payout(uuid,text,text,text) from public,anon;
grant execute on function public.admin_review_payout(uuid,text,text,text) to authenticated;
