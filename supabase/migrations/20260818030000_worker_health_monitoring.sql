begin;

create table if not exists public.worker_heartbeats(
 worker_name text primary key,last_started_at timestamptz,last_succeeded_at timestamptz,last_failed_at timestamptz,
 last_duration_ms integer,last_error text,last_result jsonb not null default '{}'::jsonb,updated_at timestamptz not null default now()
);
alter table public.worker_heartbeats enable row level security;
drop policy if exists "Administrators read worker health" on public.worker_heartbeats;
create policy "Administrators read worker health" on public.worker_heartbeats for select to authenticated using(exists(select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role='admin'));
revoke all on public.worker_heartbeats from anon;revoke insert,update,delete on public.worker_heartbeats from authenticated;grant select on public.worker_heartbeats to authenticated;

create or replace function public.internal_record_worker_heartbeat(p_worker text,p_success boolean,p_started_at timestamptz,p_result jsonb,p_error text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.worker_heartbeats(worker_name,last_started_at,last_succeeded_at,last_failed_at,last_duration_ms,last_error,last_result)
 values(p_worker,p_started_at,case when p_success then now() end,case when not p_success then now() end,greatest(0,(extract(epoch from(now()-p_started_at))*1000)::integer),case when p_success then null else left(p_error,1000) end,coalesce(p_result,'{}'::jsonb))
 on conflict(worker_name) do update set last_started_at=excluded.last_started_at,last_succeeded_at=coalesce(excluded.last_succeeded_at,public.worker_heartbeats.last_succeeded_at),last_failed_at=coalesce(excluded.last_failed_at,public.worker_heartbeats.last_failed_at),last_duration_ms=excluded.last_duration_ms,last_error=excluded.last_error,last_result=excluded.last_result,updated_at=now();
end$$;
revoke all on function public.internal_record_worker_heartbeat(text,boolean,timestamptz,jsonb,text) from public,anon,authenticated;
grant execute on function public.internal_record_worker_heartbeat(text,boolean,timestamptz,jsonb,text) to service_role;

commit;
