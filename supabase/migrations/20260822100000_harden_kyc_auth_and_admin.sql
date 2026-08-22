begin;

alter table public.kyc_sessions
  add column if not exists expires_at timestamptz,
  add column if not exists last_webhook_event_id text,
  add column if not exists decision_reason text,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists attempt_number integer not null default 1 check(attempt_number > 0);

update public.kyc_sessions
set expires_at=coalesce(expires_at,created_at+interval '24 hours')
where expires_at is null;

-- Only one provider flow may remain active for a trader.
with active as (
 select id,row_number() over(partition by user_id order by created_at desc,id desc) as rn
 from public.kyc_sessions where status in ('pending','in_review')
)
update public.kyc_sessions s set status='expired',completed_at=coalesce(completed_at,now()),updated_at=now()
from active a where a.id=s.id and a.rn>1;

create unique index if not exists kyc_sessions_one_active_per_user
 on public.kyc_sessions(user_id) where status in ('pending','in_review');
create index if not exists kyc_sessions_expiry_idx
 on public.kyc_sessions(expires_at) where status in ('pending','in_review');

-- Role rows are security data: clients may only discover their own roles.
alter table public.user_roles enable row level security;
drop policy if exists "Users read own roles" on public.user_roles;
create policy "Users read own roles" on public.user_roles for select to authenticated
 using(user_id=(select auth.uid()));
revoke insert,update,delete on public.user_roles from anon,authenticated;
revoke select on public.user_roles from anon;
grant select on public.user_roles to authenticated;

create or replace function public.internal_create_kyc_session(
 p_user_id uuid,p_provider text,p_reference text,p_url text,p_payload jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_attempt integer;v_uri text:=trim(coalesce(p_url,''));
begin
 if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then raise exception 'User not found';end if;
 if trim(coalesce(p_provider,''))!~ '^[A-Za-z0-9._-]{2,60}$' then raise exception 'Invalid KYC provider';end if;
 if char_length(trim(coalesce(p_reference,''))) not between 3 and 180 then raise exception 'Invalid KYC reference';end if;
 if v_uri!~ '^https://[^[:space:]]+$' or char_length(v_uri)>1000 then raise exception 'Invalid verification URL';end if;

 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select coalesce(max(attempt_number),0)+1 into v_attempt from public.kyc_sessions where user_id=p_user_id;
 if v_attempt>8 and exists(select 1 from public.kyc_sessions where user_id=p_user_id and created_at>now()-interval '24 hours') then
  raise exception 'Identity verification attempt limit reached';
 end if;
 update public.kyc_sessions set status='expired',completed_at=coalesce(completed_at,now()),updated_at=now()
 where user_id=p_user_id and status in ('pending','in_review');
 insert into public.kyc_sessions(user_id,provider,provider_reference,verification_url,provider_payload,expires_at,attempt_number)
 values(p_user_id,lower(trim(p_provider)),trim(p_reference),v_uri,
  jsonb_build_object('sessionCreated',true,'provider',lower(trim(p_provider))),now()+interval '24 hours',v_attempt)
 returning id into v_id;
 update public.profiles set kyc_status='pending',updated_at=now() where id=p_user_id;
 return v_id;
end$$;

create or replace function public.internal_process_kyc_webhook(
 p_event_id text,p_provider text,p_reference text,p_status text,p_payload jsonb
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.kyc_sessions%rowtype;v_profile_status text;v_inserted text;
begin
 if char_length(trim(coalesce(p_event_id,''))) not between 3 and 200 then raise exception 'Invalid webhook event';end if;
 if p_status not in ('pending','in_review','approved','rejected','expired') then raise exception 'Invalid KYC status';end if;
 insert into public.kyc_webhook_events(id,provider,payload)
 values(trim(p_event_id),lower(trim(p_provider)),jsonb_build_object('reference',trim(p_reference),'status',p_status))
 on conflict(id) do nothing returning id into v_inserted;
 if v_inserted is null then return true;end if;

 select * into v_session from public.kyc_sessions
 where provider=lower(trim(p_provider)) and provider_reference=trim(p_reference) for update;
 if not found then raise exception 'KYC session not found';end if;
 if v_session.status in ('approved','rejected','expired') then
  update public.kyc_webhook_events set processed_at=now() where id=v_inserted;return true;
 end if;
 if (v_session.status='in_review' and p_status='pending') then raise exception 'Invalid KYC status transition';end if;
 if v_session.expires_at is not null and v_session.expires_at<now() and p_status not in ('approved','rejected','expired') then
  p_status:='expired';
 end if;
 update public.kyc_sessions set status=p_status,last_webhook_event_id=v_inserted,
  provider_payload=jsonb_build_object('lastEventId',v_inserted,'lastStatus',p_status,'provider',lower(trim(p_provider))),
  updated_at=now(),completed_at=case when p_status in ('approved','rejected','expired') then coalesce(completed_at,now()) else null end
 where id=v_session.id;
 v_profile_status=case when p_status='approved' then 'approved' when p_status='rejected' then 'rejected' when p_status in ('pending','in_review') then 'pending' else 'not_started' end;
 update public.profiles set kyc_status=v_profile_status,updated_at=now() where id=v_session.user_id;
 insert into public.notifications(user_id,notification_type,title,body,action_url)
 values(v_session.user_id,'kyc_'||v_profile_status,'Identity verification updated',
  case when v_profile_status='approved' then 'Your identity verification is approved.' when v_profile_status='rejected' then 'Your identity verification was not approved. Contact support if you need help.' else 'Your identity verification is being reviewed.' end,'/kyc');
 update public.kyc_webhook_events set processed_at=now() where id=v_inserted;
 return true;
exception when others then
 update public.kyc_webhook_events set processed_at=null where id=v_inserted;
 raise;
end$$;

create or replace function public.admin_set_kyc_status(p_user_id uuid,p_status text,p_reason text)
returns public.profiles language plpgsql security definer set search_path='' as $$
declare v_before public.profiles%rowtype;v_after public.profiles%rowtype;v_actor uuid:=auth.uid();v_session public.kyc_sessions%rowtype;
begin
 if v_actor is null or not exists(select 1 from public.user_roles where user_id=v_actor and role in('admin','compliance')) then raise exception 'Not authorized';end if;
 if p_status not in ('not_started','pending','approved','rejected') then raise exception 'Invalid KYC status';end if;
 if char_length(trim(coalesce(p_reason,'')))<8 then raise exception 'A detailed review reason is required';end if;
 select * into v_before from public.profiles where id=p_user_id for update;
 if not found then raise exception 'Profile not found';end if;
 select * into v_session from public.kyc_sessions where user_id=p_user_id order by created_at desc limit 1 for update;
 if p_status='approved' and not found then raise exception 'A KYC session is required before approval';end if;
 update public.profiles set kyc_status=p_status,updated_at=now() where id=p_user_id returning * into v_after;
 if v_session.id is not null then
  update public.kyc_sessions set status=case when p_status='not_started' then 'expired' when p_status='pending' then 'in_review' else p_status end,
   decision_reason=left(trim(p_reason),1000),reviewed_by=v_actor,updated_at=now(),
   completed_at=case when p_status in('approved','rejected','not_started') then coalesce(completed_at,now()) else null end
  where id=v_session.id;
 end if;
 insert into public.admin_audit_log(actor_user_id,action,entity_type,entity_id,before_state,after_state,reason)
 values(v_actor,'kyc.manual_review','profile',p_user_id,to_jsonb(v_before),to_jsonb(v_after),left(trim(p_reason),1000));
 insert into public.notifications(user_id,notification_type,title,body,action_url)
 values(p_user_id,'kyc_'||p_status,'Identity verification updated',case when p_status='approved' then 'Your identity verification is approved.' when p_status='rejected' then 'Your identity verification needs attention. Open KYC or contact support.' else 'Your identity verification status is now '||replace(p_status,'_',' ')||'.' end,'/kyc');
 return v_after;
end$$;

revoke all on function public.internal_create_kyc_session(uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.internal_process_kyc_webhook(text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.admin_set_kyc_status(uuid,text,text) from public,anon;
grant execute on function public.internal_create_kyc_session(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.internal_process_kyc_webhook(text,text,text,text,jsonb) to service_role;
grant execute on function public.admin_set_kyc_status(uuid,text,text) to authenticated;

commit;
