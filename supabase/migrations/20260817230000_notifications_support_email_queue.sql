alter table public.notifications add column if not exists read_at timestamptz;
create index if not exists notifications_unread_idx on public.notifications(user_id,created_at desc) where read_at is null;

create table if not exists public.support_tickets(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 subject text not null check(char_length(subject) between 5 and 120),category text not null check(category in ('account','payment','trading','risk','payout','kyc','technical','other')),
 priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
 status text not null default 'open' check(status in ('open','waiting_for_user','in_progress','resolved','closed')),
 assigned_to uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),closed_at timestamptz
);
create table if not exists public.support_messages(
 id uuid primary key default gen_random_uuid(),ticket_id uuid not null references public.support_tickets(id) on delete cascade,
 author_user_id uuid not null references auth.users(id),body text not null check(char_length(body) between 3 and 5000),
 is_staff boolean not null default false,created_at timestamptz not null default now()
);
create index if not exists support_tickets_user_idx on public.support_tickets(user_id,updated_at desc);
create index if not exists support_messages_ticket_idx on public.support_messages(ticket_id,created_at);
alter table public.support_tickets enable row level security;alter table public.support_messages enable row level security;
create policy "Users read own support tickets" on public.support_tickets for select to authenticated using((select auth.uid())=user_id or exists(select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role in ('admin','support')));
create policy "Users read own support messages" on public.support_messages for select to authenticated using(exists(select 1 from public.support_tickets t where t.id=ticket_id and (t.user_id=(select auth.uid()) or exists(select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role in ('admin','support')))));
revoke all on public.support_tickets,public.support_messages from anon;
revoke insert,update,delete on public.support_tickets,public.support_messages from authenticated;
grant select on public.support_tickets,public.support_messages to authenticated;

create table if not exists public.email_templates(
 template_key text primary key,subject text not null,html_body text not null,text_body text not null,updated_at timestamptz not null default now()
);
create table if not exists public.email_outbox(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 recipient_email text not null,template_key text not null references public.email_templates(template_key),payload jsonb not null default '{}'::jsonb,
 status text not null default 'queued' check(status in ('queued','sending','sent','failed','canceled')),attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),provider_message_id text,last_error text,created_at timestamptz not null default now(),sent_at timestamptz
);
create index if not exists email_outbox_delivery_idx on public.email_outbox(status,next_attempt_at) where status in ('queued','failed');
alter table public.email_templates enable row level security;alter table public.email_outbox enable row level security;
revoke all on public.email_templates,public.email_outbox from anon,authenticated;

insert into public.email_templates(template_key,subject,html_body,text_body) values
('notification','{{title}} · TakeProp','<h1>{{title}}</h1><p>{{body}}</p><p><a href="{{action_url}}">Open TakeProp</a></p>','{{title}}\n\n{{body}}\n\n{{action_url}}'),
('support_received','Support request received · TakeProp','<h1>We received your request</h1><p>Ticket {{ticket_id}}: {{subject}}</p>','We received ticket {{ticket_id}}: {{subject}}'),
('support_reply','New support reply · TakeProp','<h1>Your support request has an update</h1><p>{{subject}}</p><p><a href="{{action_url}}">Read reply</a></p>','Your support request has an update: {{subject}}\n{{action_url}}')
on conflict(template_key) do update set subject=excluded.subject,html_body=excluded.html_body,text_body=excluded.text_body,updated_at=now();

create or replace function public.create_support_ticket(p_subject text,p_category text,p_message text)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid();v_id uuid;v_email text;
begin
 if v_user is null then raise exception 'Authentication required';end if;
 insert into public.support_tickets(user_id,subject,category,priority) values(v_user,trim(p_subject),p_category,case when p_category in ('payment','risk','payout') then 'high' else 'normal' end) returning id into v_id;
 insert into public.support_messages(ticket_id,author_user_id,body) values(v_id,v_user,trim(p_message));
 select email into v_email from auth.users where id=v_user;
 insert into public.email_outbox(user_id,recipient_email,template_key,payload) values(v_user,v_email,'support_received',jsonb_build_object('ticket_id',v_id,'subject',trim(p_subject)));
 insert into public.notifications(user_id,notification_type,title,body,action_url) values(v_user,'support_received','Support request received','Ticket '||upper(substr(v_id::text,1,8))||' was created.','/support');
 return v_id;
end;$function$;

create or replace function public.mark_notifications_read(p_notification_id uuid default null)
returns integer language plpgsql security definer set search_path=''
as $function$
declare v_count integer;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 update public.notifications set read_at=coalesce(read_at,now()) where user_id=auth.uid() and (p_notification_id is null or id=p_notification_id);
 get diagnostics v_count=row_count;return v_count;
end;$function$;

create or replace function public.internal_enqueue_notification_email()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_email text;
begin
 if new.notification_type='support_received' then return new;end if;
 select email into v_email from auth.users where id=new.user_id;
 if v_email is not null then insert into public.email_outbox(user_id,recipient_email,template_key,payload) values(new.user_id,v_email,'notification',jsonb_build_object('title',new.title,'body',new.body,'action_url',coalesce(new.action_url,'/dashboard')));end if;
 return new;
end;$function$;
drop trigger if exists enqueue_notification_email on public.notifications;
create trigger enqueue_notification_email after insert on public.notifications for each row execute function public.internal_enqueue_notification_email();

revoke all on function public.create_support_ticket(text,text,text) from public,anon;
revoke all on function public.mark_notifications_read(uuid) from public,anon;
revoke all on function public.internal_enqueue_notification_email() from public,anon,authenticated;
grant execute on function public.create_support_ticket(text,text,text) to authenticated;
grant execute on function public.mark_notifications_read(uuid) to authenticated;

create or replace function public.add_support_message(p_ticket_id uuid,p_message text)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid();v_ticket public.support_tickets%rowtype;v_staff boolean;v_id uuid;v_email text;
begin
 if v_user is null then raise exception 'Authentication required';end if;
 select * into v_ticket from public.support_tickets where id=p_ticket_id for update;
 if not found then raise exception 'Ticket not found';end if;
 v_staff:=exists(select 1 from public.user_roles where user_id=v_user and role in('admin','support'));
 if v_ticket.user_id<>v_user and not v_staff then raise exception 'Not authorized';end if;
 if v_ticket.status='closed' then raise exception 'This ticket is closed';end if;
 insert into public.support_messages(ticket_id,author_user_id,body,is_staff) values(p_ticket_id,v_user,trim(p_message),v_staff) returning id into v_id;
 update public.support_tickets set status=case when v_staff then 'waiting_for_user' else 'in_progress' end,assigned_to=case when v_staff then coalesce(assigned_to,v_user) else assigned_to end,updated_at=now() where id=p_ticket_id;
 if v_staff then
  select email into v_email from auth.users where id=v_ticket.user_id;
  insert into public.email_outbox(user_id,recipient_email,template_key,payload) values(v_ticket.user_id,v_email,'support_reply',jsonb_build_object('subject',v_ticket.subject,'action_url','/support/'||p_ticket_id));
  insert into public.notifications(user_id,notification_type,title,body,action_url) values(v_ticket.user_id,'support_reply','New support reply',v_ticket.subject,'/support/'||p_ticket_id);
 end if;
 return v_id;
end;$function$;
revoke all on function public.add_support_message(uuid,text) from public,anon;
grant execute on function public.add_support_message(uuid,text) to authenticated;

create or replace function public.internal_claim_email_batch(p_limit integer default 20)
returns setof public.email_outbox language plpgsql security definer set search_path=''
as $function$
begin
 return query update public.email_outbox e set status='sending',attempts=e.attempts+1
 where e.id in(select id from public.email_outbox where status in('queued','failed') and next_attempt_at<=now() order by created_at for update skip locked limit least(greatest(p_limit,1),100))
 returning e.*;
end;$function$;
create or replace function public.internal_finish_email(p_id uuid,p_sent boolean,p_provider_message_id text,p_error text)
returns void language plpgsql security definer set search_path=''
as $function$
begin
 update public.email_outbox set status=case when p_sent then 'sent' when attempts>=5 then 'canceled' else 'failed' end,
 provider_message_id=case when p_sent then p_provider_message_id else provider_message_id end,last_error=case when p_sent then null else left(p_error,1000) end,
 sent_at=case when p_sent then now() else sent_at end,next_attempt_at=case when p_sent then next_attempt_at else now()+make_interval(mins=>least(60,power(2,attempts)::integer)) end where id=p_id;
end;$function$;
revoke all on function public.internal_claim_email_batch(integer) from public,anon,authenticated;
revoke all on function public.internal_finish_email(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.internal_claim_email_batch(integer) to service_role;
grant execute on function public.internal_finish_email(uuid,boolean,text,text) to service_role;
