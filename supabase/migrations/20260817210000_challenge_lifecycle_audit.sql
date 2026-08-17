-- Make evaluation lifecycle deterministic for both existing and future accounts.
create table if not exists public.account_stage_events (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references public.trading_accounts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 event_type text not null check(event_type in ('created','started','passed','breached','funded','suspended','closed')),
 from_status text,
 to_status text,
 evaluation_step integer not null,
 evaluation_steps integer not null,
 balance numeric(28,8),
 equity numeric(28,8),
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists account_stage_events_account_idx on public.account_stage_events(account_id,created_at desc);
alter table public.account_stage_events enable row level security;
drop policy if exists "Users read own stage events" on public.account_stage_events;
create policy "Users read own stage events" on public.account_stage_events for select to authenticated using((select auth.uid())=user_id);
revoke all on public.account_stage_events from anon;
revoke insert,update,delete on public.account_stage_events from authenticated;
grant select on public.account_stage_events to authenticated;

create or replace function public.internal_initialize_evaluation_account()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_plan public.challenge_plans%rowtype;
begin
 select * into v_plan from public.challenge_plans where id=new.plan_id;
 if not found then raise exception 'Challenge plan not found'; end if;
 if new.phase='challenge' then
  new.evaluation_steps:=case when coalesce(v_plan.rules->>'challenge_type','')='two_step' then 2 else 1 end;
  new.evaluation_step:=greatest(1,coalesce(new.evaluation_step,1));
  new.evaluation_target_pct:=coalesce(new.evaluation_target_pct,case when new.evaluation_step=2 then coalesce((v_plan.rules->>'phase_2_profit_target_pct')::numeric,v_plan.profit_target_pct) else v_plan.profit_target_pct end);
 elsif new.phase='funded' then
  new.evaluation_steps:=case when coalesce(v_plan.rules->>'challenge_type','')='two_step' then 2 else 1 end;
  new.evaluation_target_pct:=null;
 end if;
 return new;
end;$function$;
drop trigger if exists initialize_evaluation_account on public.trading_accounts;
create trigger initialize_evaluation_account before insert on public.trading_accounts
for each row execute function public.internal_initialize_evaluation_account();

update public.trading_accounts a set
 evaluation_steps=case when coalesce(p.rules->>'challenge_type','')='two_step' then 2 else 1 end,
 evaluation_target_pct=case when a.phase='funded' then null when a.evaluation_step=2 then coalesce((p.rules->>'phase_2_profit_target_pct')::numeric,p.profit_target_pct) else p.profit_target_pct end
from public.challenge_plans p where p.id=a.plan_id;

create or replace function public.internal_record_account_stage_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_type text;
begin
 if tg_op='INSERT' then
  v_type:=case when new.phase='funded' then 'funded' else 'created' end;
 elsif new.status is not distinct from old.status and new.phase is not distinct from old.phase then return new;
 else
  v_type:=case when new.status in ('passed','breached','suspended','closed') then new.status when new.phase='funded' then 'funded' else 'started' end;
 end if;
 insert into public.account_stage_events(account_id,user_id,event_type,from_status,to_status,evaluation_step,evaluation_steps,balance,equity,details)
 values(new.id,new.user_id,v_type,case when tg_op='UPDATE' then old.status else null end,new.status,new.evaluation_step,new.evaluation_steps,new.balance,new.equity,
 jsonb_build_object('phase',new.phase,'target_pct',new.evaluation_target_pct,'source_account_id',new.source_account_id));
 return new;
end;$function$;
drop trigger if exists record_account_stage_event on public.trading_accounts;
create trigger record_account_stage_event after insert or update of status,phase on public.trading_accounts
for each row execute function public.internal_record_account_stage_event();

insert into public.account_stage_events(account_id,user_id,event_type,to_status,evaluation_step,evaluation_steps,balance,equity,details,created_at)
select a.id,a.user_id,case when a.phase='funded' then 'funded' when a.status='passed' then 'passed' when a.status='breached' then 'breached' else 'created' end,
 a.status,a.evaluation_step,a.evaluation_steps,a.balance,a.equity,jsonb_build_object('phase',a.phase,'target_pct',a.evaluation_target_pct,'backfilled',true),coalesce(a.created_at,now())
from public.trading_accounts a where not exists(select 1 from public.account_stage_events e where e.account_id=a.id);

revoke all on function public.internal_initialize_evaluation_account() from public,anon,authenticated;
revoke all on function public.internal_record_account_stage_event() from public,anon,authenticated;
