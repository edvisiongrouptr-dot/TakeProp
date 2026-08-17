begin;

create table if not exists public.request_rate_limits (
  scope text not null,
  subject_hash text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (scope, subject_hash)
);

alter table public.request_rate_limits enable row level security;
revoke all on public.request_rate_limits from anon, authenticated;

create or replace function public.internal_consume_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.request_rate_limits%rowtype;
begin
  if p_limit < 1 or p_window_seconds < 1 or length(p_scope) > 80 or length(p_subject_hash) > 160 then
    raise exception 'Invalid rate limit configuration';
  end if;
  insert into public.request_rate_limits(scope,subject_hash,window_started_at,request_count)
  values(p_scope,p_subject_hash,now(),1)
  on conflict(scope,subject_hash) do update set
    window_started_at=case when public.request_rate_limits.window_started_at <= now()-make_interval(secs=>p_window_seconds) then now() else public.request_rate_limits.window_started_at end,
    request_count=case when public.request_rate_limits.window_started_at <= now()-make_interval(secs=>p_window_seconds) then 1 else public.request_rate_limits.request_count+1 end
  returning * into v_row;
  return v_row.request_count <= p_limit;
end;
$$;

revoke all on function public.internal_consume_rate_limit(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.internal_consume_rate_limit(text,text,integer,integer) to service_role;

commit;
