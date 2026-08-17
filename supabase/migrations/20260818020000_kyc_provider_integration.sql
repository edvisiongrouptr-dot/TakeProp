begin;

create table if not exists public.kyc_sessions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null,provider_reference text not null unique,status text not null default 'pending' check(status in ('pending','in_review','approved','rejected','expired')),
 verification_url text,provider_payload jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),completed_at timestamptz
);
create index if not exists kyc_sessions_user_created_idx on public.kyc_sessions(user_id,created_at desc);
alter table public.kyc_sessions enable row level security;
drop policy if exists "Users read own KYC sessions" on public.kyc_sessions;
create policy "Users read own KYC sessions" on public.kyc_sessions for select to authenticated using((select auth.uid())=user_id);
revoke all on public.kyc_sessions from anon;revoke insert,update,delete on public.kyc_sessions from authenticated;grant select on public.kyc_sessions to authenticated;

create table if not exists public.kyc_webhook_events(
 id text primary key,provider text not null,payload jsonb not null,received_at timestamptz not null default now(),processed_at timestamptz
);
alter table public.kyc_webhook_events enable row level security;
revoke all on public.kyc_webhook_events from anon,authenticated;

create or replace function public.internal_create_kyc_session(p_user_id uuid,p_provider text,p_reference text,p_url text,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
 update public.kyc_sessions set status='expired',updated_at=now() where user_id=p_user_id and status in ('pending','in_review');
 insert into public.kyc_sessions(user_id,provider,provider_reference,verification_url,provider_payload) values(p_user_id,p_provider,p_reference,p_url,coalesce(p_payload,'{}'::jsonb)) returning id into v_id;
 update public.profiles set kyc_status='pending',updated_at=now() where id=p_user_id;
 return v_id;
end$$;

create or replace function public.internal_process_kyc_webhook(p_event_id text,p_provider text,p_reference text,p_status text,p_payload jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.kyc_sessions%rowtype;v_profile_status text;
begin
 if p_status not in ('pending','in_review','approved','rejected','expired') then raise exception 'Invalid KYC status';end if;
 insert into public.kyc_webhook_events(id,provider,payload) values(p_event_id,p_provider,p_payload) on conflict(id) do nothing;
 if not found then return false;end if;
 select * into v_session from public.kyc_sessions where provider=p_provider and provider_reference=p_reference for update;
 if not found then raise exception 'KYC session not found';end if;
 update public.kyc_sessions set status=p_status,provider_payload=provider_payload||p_payload,updated_at=now(),completed_at=case when p_status in ('approved','rejected','expired') then now() else null end where id=v_session.id;
 v_profile_status=case when p_status='approved' then 'approved' when p_status='rejected' then 'rejected' when p_status in ('pending','in_review') then 'pending' else 'not_started' end;
 update public.profiles set kyc_status=v_profile_status,updated_at=now() where id=v_session.user_id;
 insert into public.notifications(user_id,notification_type,title,body,action_url) values(v_session.user_id,'kyc_'||v_profile_status,'Identity verification updated',case when v_profile_status='approved' then 'Your identity verification is approved.' when v_profile_status='rejected' then 'Your identity verification was not approved. Contact support if you need help.' else 'Your identity verification is being reviewed.' end,'/kyc');
 update public.kyc_webhook_events set processed_at=now() where id=p_event_id;return true;
end$$;

revoke all on function public.internal_create_kyc_session(uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.internal_process_kyc_webhook(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.internal_create_kyc_session(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.internal_process_kyc_webhook(text,text,text,text,jsonb) to service_role;

commit;
