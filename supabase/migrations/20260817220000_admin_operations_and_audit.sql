create table if not exists public.admin_audit_log (
 id uuid primary key default gen_random_uuid(),
 actor_user_id uuid not null references auth.users(id),
 action text not null,
 entity_type text not null,
 entity_id uuid,
 before_state jsonb,
 after_state jsonb,
 reason text,
 request_id text,
 created_at timestamptz not null default now()
);
alter table public.risk_events add column if not exists resolved_at timestamptz;
alter table public.risk_events add column if not exists resolved_by uuid references auth.users(id);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log(created_at desc);
create index if not exists admin_audit_log_entity_idx on public.admin_audit_log(entity_type,entity_id,created_at desc);
alter table public.admin_audit_log enable row level security;
drop policy if exists "Admins read audit log" on public.admin_audit_log;
create policy "Admins read audit log" on public.admin_audit_log for select to authenticated using(
 exists(select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role='admin')
);
revoke all on public.admin_audit_log from anon;
revoke insert,update,delete on public.admin_audit_log from authenticated;
grant select on public.admin_audit_log to authenticated;

drop policy if exists "Admins read all trading accounts" on public.trading_accounts;
create policy "Admins read all trading accounts" on public.trading_accounts for select to authenticated using(
 exists(select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role='admin')
);
drop policy if exists "Admins read all risk events" on public.risk_events;
create policy "Admins read all risk events" on public.risk_events for select to authenticated using(
 exists(select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role='admin')
);

create or replace function public.admin_set_kyc_status(p_user_id uuid,p_status text,p_reason text)
returns public.profiles language plpgsql security definer set search_path=''
as $function$
declare v_before public.profiles%rowtype;v_after public.profiles%rowtype;v_actor uuid:=auth.uid();
begin
 if not exists(select 1 from public.user_roles where user_id=v_actor and role='admin') then raise exception 'Not authorized'; end if;
 if p_status not in ('not_started','pending','approved','rejected') then raise exception 'Invalid KYC status'; end if;
 if p_status in ('approved','rejected') and char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'A review reason is required'; end if;
 select * into v_before from public.profiles where id=p_user_id for update;
 if not found then raise exception 'Profile not found'; end if;
 update public.profiles set kyc_status=p_status,updated_at=now() where id=p_user_id returning * into v_after;
 insert into public.admin_audit_log(actor_user_id,action,entity_type,entity_id,before_state,after_state,reason)
 values(v_actor,'kyc_status_changed','profile',p_user_id,to_jsonb(v_before),to_jsonb(v_after),trim(p_reason));
 insert into public.notifications(user_id,notification_type,title,body,action_url)
 values(p_user_id,'kyc_'||p_status,'Identity verification updated',case when p_status='approved' then 'Your identity verification is approved.' when p_status='rejected' then 'Your identity verification needs attention: '||trim(p_reason) else 'Your identity verification status is now '||replace(p_status,'_',' ')||'.' end,'/dashboard');
 return v_after;
end;$function$;

create or replace function public.admin_set_trading_account_status(p_account_id uuid,p_status text,p_reason text)
returns public.trading_accounts language plpgsql security definer set search_path=''
as $function$
declare v_before public.trading_accounts%rowtype;v_after public.trading_accounts%rowtype;v_actor uuid:=auth.uid();
begin
 if not exists(select 1 from public.user_roles where user_id=v_actor and role='admin') then raise exception 'Not authorized'; end if;
 if p_status not in ('active','suspended','closed') then raise exception 'Invalid account status'; end if;
 if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'A reason is required'; end if;
 select * into v_before from public.trading_accounts where id=p_account_id for update;
 if not found then raise exception 'Trading account not found'; end if;
 if v_before.status in ('passed','breached') and p_status='active' then raise exception 'Completed or breached evaluations cannot be reactivated'; end if;
 update public.trading_accounts set status=p_status,ended_at=case when p_status='closed' then coalesce(ended_at,now()) when p_status='active' then null else ended_at end,updated_at=now()
 where id=p_account_id returning * into v_after;
 insert into public.admin_audit_log(actor_user_id,action,entity_type,entity_id,before_state,after_state,reason)
 values(v_actor,'trading_account_status_changed','trading_account',p_account_id,to_jsonb(v_before),to_jsonb(v_after),trim(p_reason));
 insert into public.notifications(user_id,notification_type,title,body,action_url)
 values(v_after.user_id,'account_'||p_status,'Trading account updated','Your account is now '||p_status||'. Reason: '||trim(p_reason),'/dashboard');
 return v_after;
end;$function$;

create or replace function public.admin_resolve_risk_event(p_event_id uuid,p_resolution text)
returns public.risk_events language plpgsql security definer set search_path=''
as $function$
declare v_before public.risk_events%rowtype;v_after public.risk_events%rowtype;v_actor uuid:=auth.uid();
begin
 if not exists(select 1 from public.user_roles where user_id=v_actor and role='admin') then raise exception 'Not authorized'; end if;
 if char_length(trim(coalesce(p_resolution,'')))<3 then raise exception 'Resolution note is required'; end if;
 select * into v_before from public.risk_events where id=p_event_id for update;
 if not found then raise exception 'Risk event not found'; end if;
 update public.risk_events set status='resolved',resolved_at=now(),resolved_by=v_actor,details=details||jsonb_build_object('resolution',trim(p_resolution)) where id=p_event_id returning * into v_after;
 insert into public.admin_audit_log(actor_user_id,action,entity_type,entity_id,before_state,after_state,reason)
 values(v_actor,'risk_event_resolved','risk_event',p_event_id,to_jsonb(v_before),to_jsonb(v_after),trim(p_resolution));
 return v_after;
end;$function$;

revoke all on function public.admin_set_kyc_status(uuid,text,text) from public,anon;
revoke all on function public.admin_set_trading_account_status(uuid,text,text) from public,anon;
revoke all on function public.admin_resolve_risk_event(uuid,text) from public,anon;
grant execute on function public.admin_set_kyc_status(uuid,text,text) to authenticated;
grant execute on function public.admin_set_trading_account_status(uuid,text,text) to authenticated;
grant execute on function public.admin_resolve_risk_event(uuid,text) to authenticated;
