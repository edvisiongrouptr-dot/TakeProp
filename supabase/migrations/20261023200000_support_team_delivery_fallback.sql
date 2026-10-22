begin;

insert into public.email_templates(template_key,subject,html_body,text_body) values
(
  'support_team_message',
  'New support request · TakeProp',
  '<div style="background:#061014;padding:32px 16px;font-family:Arial,sans-serif;color:#edf7f2"><div style="max-width:600px;margin:0 auto;background:#0b171b;border:1px solid #214137;padding:32px"><p style="margin:0 0 14px;color:#42e39a;font-size:12px;font-weight:700;letter-spacing:1.4px">TAKEPROP · SUPPORT</p><h1 style="margin:0 0 18px;font-size:26px;color:#ffffff">{{event}}</h1><p style="margin:0 0 8px;color:#b8c9c2"><strong style="color:#ffffff">Subject:</strong> {{subject}}</p><p style="margin:0 0 20px;color:#b8c9c2"><strong style="color:#ffffff">Category:</strong> {{category}}</p><div style="white-space:pre-wrap;background:#071014;border:1px solid #1c332b;padding:18px;color:#d7e4de;line-height:1.6">{{message}}</div><p style="margin:24px 0 0"><a href="{{action_url}}" style="display:inline-block;background:#42e39a;color:#04100b;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:4px">Open support queue →</a></p><p style="margin:18px 0 0;color:#71867d;font-size:11px">Ticket {{ticket_id}}</p></div></div>',
  '{{event}}\n\nSubject: {{subject}}\nCategory: {{category}}\n\n{{message}}\n\nOpen support queue: {{action_url}}\nTicket: {{ticket_id}}'
)
on conflict(template_key) do update set
 subject=excluded.subject,
 html_body=excluded.html_body,
 text_body=excluded.text_body,
 updated_at=now();

create or replace function public.internal_enqueue_notification_email()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_email text;
begin
 if new.notification_type in ('support_received','challenge_account_activated','support_team_alert') then return new;end if;
 select email into v_email from auth.users where id=new.user_id;
 if v_email is not null then
  insert into public.email_outbox(user_id,recipient_email,template_key,payload)
  values(new.user_id,v_email,'notification',jsonb_build_object('title',new.title,'body',new.body,'action_url',coalesce(new.action_url,'/dashboard')));
 end if;
 return new;
end;$function$;

create or replace function public.internal_notify_support_team()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare
 v_ticket public.support_tickets%rowtype;
 v_recipient record;
begin
 if new.is_staff then return new;end if;
 select * into v_ticket from public.support_tickets where id=new.ticket_id;
 if not found then return new;end if;

 for v_recipient in
  select distinct r.user_id
  from public.user_roles r
  where r.role in ('admin','support') and r.user_id<>v_ticket.user_id
 loop
  insert into public.notifications(user_id,notification_type,title,body,action_url)
  values(
   v_recipient.user_id,
   'support_team_alert',
   'New support message',
   left(v_ticket.subject,120),
   '/admin'
  );
 end loop;
 return new;
end;$function$;

drop trigger if exists notify_support_team on public.support_messages;
create trigger notify_support_team
after insert on public.support_messages
for each row execute function public.internal_notify_support_team();

revoke all on function public.internal_notify_support_team() from public,anon,authenticated;

commit;
