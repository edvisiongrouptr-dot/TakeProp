-- Launch hardening + administrator user directory.
-- Safe, non-destructive migration.

drop policy if exists "Admins read legal acceptances" on public.legal_acceptances;
drop policy if exists "Users read own legal acceptances" on public.legal_acceptances;
drop policy if exists "Admins read all risk events" on public.risk_events;
drop policy if exists "Users read own support messages" on public.support_messages;
drop policy if exists "Users read own support tickets" on public.support_tickets;
drop policy if exists "Admins read all trading accounts" on public.trading_accounts;

drop policy if exists "Users read own roles" on public.user_roles;
drop policy if exists user_roles_admin_read on public.user_roles;

create policy user_roles_select_own_or_admin
on public.user_roles
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.has_app_role(array['admin'::text]))
);

create or replace function public.admin_list_users()
returns table(
  user_id uuid,
  email text,
  full_name text,
  country_code text,
  phone text,
  kyc_status text,
  is_suspended boolean,
  suspension_reason text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not exists (
       select 1
       from public.user_roles
       where user_id = auth.uid()
         and role = 'admin'
     ) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    u.id,
    u.email::text,
    p.full_name,
    p.country_code,
    p.phone,
    coalesce(p.kyc_status, 'not_started'::text),
    coalesce(p.is_suspended, false),
    p.suspension_reason,
    coalesce(p.created_at, u.created_at),
    u.last_sign_in_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  order by u.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;

create or replace function public.admin_set_user_suspension(
  p_user_id uuid,
  p_suspended boolean,
  p_reason text
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.profiles%rowtype;
  v_after public.profiles%rowtype;
begin
  if v_actor is null
     or not exists (
       select 1
       from public.user_roles
       where user_id = v_actor
         and role = 'admin'
     ) then
    raise exception 'Not authorized';
  end if;

  if p_user_id = v_actor and p_suspended then
    raise exception 'You cannot suspend your own administrator account';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A detailed suspension reason is required';
  end if;

  select *
  into v_before
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  update public.profiles
  set
    is_suspended = p_suspended,
    suspension_reason =
      case
        when p_suspended then left(trim(p_reason), 1000)
        else null
      end,
    suspended_at =
      case
        when p_suspended then now()
        else null
      end,
    updated_at = now()
  where id = p_user_id
  returning * into v_after;

  if p_suspended then
    update public.trading_accounts
    set status = 'suspended', updated_at = now()
    where user_id = p_user_id
      and status = 'active';
  end if;

  insert into public.admin_audit_log(
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_state,
    after_state,
    reason
  )
  values(
    v_actor,
    case
      when p_suspended then 'user_suspended'
      else 'user_unsuspended'
    end,
    'profile',
    p_user_id,
    to_jsonb(v_before),
    to_jsonb(v_after),
    left(trim(p_reason), 1000)
  );

  return v_after;
end;
$$;

revoke all
on function public.admin_set_user_suspension(uuid, boolean, text)
from public;

grant execute
on function public.admin_set_user_suspension(uuid, boolean, text)
to authenticated;

create index if not exists account_stage_events_user_id_idx
  on public.account_stage_events(user_id);
create index if not exists admin_audit_log_actor_user_id_idx
  on public.admin_audit_log(actor_user_id);
create index if not exists email_outbox_template_key_idx
  on public.email_outbox(template_key);
create index if not exists email_outbox_user_id_idx
  on public.email_outbox(user_id);
create index if not exists kyc_sessions_reviewed_by_idx
  on public.kyc_sessions(reviewed_by);
create index if not exists orders_reviewed_by_idx
  on public.orders(reviewed_by);
create index if not exists pending_orders_user_id_idx
  on public.pending_orders(user_id);
create index if not exists risk_events_resolved_by_idx
  on public.risk_events(resolved_by);
