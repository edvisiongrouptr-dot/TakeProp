begin;

insert into public.email_templates(template_key,subject,html_body,text_body) values
(
  'challenge_account_activated',
  'Welcome to the TakeProp family — your account is active',
  '<div style="background:#061014;padding:36px 18px;font-family:Arial,sans-serif;color:#edf7f2"><div style="max-width:600px;margin:0 auto;background:#0b171b;border:1px solid #214137;padding:36px"><p style="margin:0 0 16px;color:#42e39a;font-size:12px;font-weight:700;letter-spacing:1.5px">TAKEPROP · ACCOUNT ACTIVATED</p><h1 style="margin:0 0 18px;font-size:30px;line-height:1.2;color:#ffffff">Welcome to the TakeProp family, {{full_name}}!</h1><p style="margin:0 0 14px;color:#b8c9c2;line-height:1.7">Your payment has been approved and your <strong style="color:#ffffff">{{plan_name}}</strong> simulated trading account is now active.</p><p style="margin:0 0 26px;color:#b8c9c2;line-height:1.7">You can start trading right away. Review your account rules, manage positions and follow your progress from the TakeProp terminal.</p><p style="margin:0 0 28px"><a href="{{action_url}}" style="display:inline-block;background:#42e39a;color:#04100b;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:4px">Open trading terminal →</a></p><div style="border-top:1px solid #214137;padding-top:18px;color:#789088;font-size:12px;line-height:1.6"><strong style="color:#dbe8e2">Account:</strong> {{account_number}}<br><strong style="color:#dbe8e2">Plan:</strong> {{plan_name}}</div><p style="margin:24px 0 0;color:#789088;font-size:12px;line-height:1.6">We are glad to have you with us. Trade responsibly and remember that all TakeProp trading activity is simulated.</p></div></div>',
  'Welcome to the TakeProp family, {{full_name}}!\n\nYour payment has been approved and your {{plan_name}} simulated trading account is now active. You can start trading right away.\n\nAccount: {{account_number}}\nPlan: {{plan_name}}\n\nOpen your trading terminal: {{action_url}}\n\nWe are glad to have you with us. Trade responsibly and remember that all TakeProp trading activity is simulated.'
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
 if new.notification_type in ('support_received','challenge_account_activated') then return new;end if;
 select email into v_email from auth.users where id=new.user_id;
 if v_email is not null then
  insert into public.email_outbox(user_id,recipient_email,template_key,payload)
  values(new.user_id,v_email,'notification',jsonb_build_object('title',new.title,'body',new.body,'action_url',coalesce(new.action_url,'/dashboard')));
 end if;
 return new;
end;$function$;

create or replace function public.internal_notify_challenge_activation()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare
 v_email text;
 v_name text;
 v_plan_name text;
 v_account_number text;
begin
 if new.status <> 'paid' or old.status = 'paid' then return new;end if;

 select u.email,coalesce(nullif(trim(p.full_name),''),split_part(u.email,'@',1),'Trader')
 into v_email,v_name
 from auth.users u
 left join public.profiles p on p.id=u.id
 where u.id=new.user_id;

 select cp.name,coalesce(a.display_account_id,'TakeProp account')
 into v_plan_name,v_account_number
 from public.challenge_plans cp
 left join public.trading_accounts a on a.order_id=new.id
 where cp.id=new.plan_id
 order by a.created_at desc nulls last
 limit 1;

 insert into public.notifications(user_id,notification_type,title,body,action_url)
 values(new.user_id,'challenge_account_activated','Your trading account is active','Welcome to the TakeProp family. Your account is ready and you can start trading now.','/terminal');

 if v_email is not null then
  insert into public.email_outbox(user_id,recipient_email,template_key,payload)
  values(new.user_id,v_email,'challenge_account_activated',jsonb_build_object(
   'full_name',v_name,
   'plan_name',coalesce(v_plan_name,'TakeProp Challenge'),
   'account_number',coalesce(v_account_number,'TakeProp account'),
   'action_url','https://takeprop.trade/terminal'
  ));
 end if;
 return new;
end;$function$;

drop trigger if exists notify_challenge_activation on public.orders;
create trigger notify_challenge_activation
after update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function public.internal_notify_challenge_activation();

revoke all on function public.internal_notify_challenge_activation() from public,anon,authenticated;

commit;
