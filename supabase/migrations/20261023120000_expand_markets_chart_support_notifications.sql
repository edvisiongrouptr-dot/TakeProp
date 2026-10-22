alter table public.pending_orders drop constraint if exists pending_orders_symbol_check;
alter table public.pending_orders add constraint pending_orders_symbol_check check (symbol in ('BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','LTCUSDT','TRXUSDT','SUIUSDT','AAVEUSDT'));

create or replace function public.internal_open_sim_trade(
  p_user_id uuid,
  p_account_id uuid,
  p_symbol text,
  p_side text,
  p_margin numeric,
  p_leverage integer,
  p_mark numeric,
  p_marks jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account public.trading_accounts%rowtype;
  v_plan public.challenge_plans%rowtype;
  v_open_margin numeric;
  v_quantity numeric;
begin
  if p_symbol not in ('BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','LTCUSDT','TRXUSDT','SUIUSDT','AAVEUSDT') then raise exception 'Unsupported symbol'; end if;
  if p_side not in ('long','short') then raise exception 'Invalid side'; end if;
  if p_margin < 10 or p_mark <= 0 then raise exception 'Invalid order size or price'; end if;

  select * into v_account from public.trading_accounts where id=p_account_id and user_id=p_user_id for update;
  if not found then raise exception 'Trading account not found'; end if;
  if v_account.status <> 'active' then raise exception 'Trading account is not active'; end if;
  select * into v_plan from public.challenge_plans where id=v_account.plan_id;
  if p_leverage < 1 or p_leverage > v_plan.leverage_ratio then raise exception 'Leverage exceeds plan limit'; end if;

  select coalesce(sum((metadata->>'margin_usdt')::numeric),0) into v_open_margin
    from public.trades where account_id=p_account_id and closed_at is null;
  if v_open_margin + p_margin > v_account.balance then raise exception 'Insufficient simulated margin'; end if;

  v_quantity := (p_margin*p_leverage)/p_mark;
  insert into public.trades(account_id,user_id,provider_trade_id,symbol,side,quantity,leverage,entry_price,opened_at,metadata)
  values(p_account_id,p_user_id,'SIM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20)),p_symbol,p_side,v_quantity,p_leverage,p_mark,now(),
    jsonb_build_object('margin_usdt',p_margin,'notional_usdt',p_margin*p_leverage,'mark_source','binance_usdm','fee_rate',0.0004));

  return public.internal_sync_sim_account(p_user_id,p_account_id,p_marks);
end;
$function$;

create or replace function public.internal_open_sim_trade_advanced(
 p_user_id uuid,p_account_id uuid,p_symbol text,p_side text,p_margin numeric,
 p_leverage integer,p_mark numeric,p_stop_loss numeric,p_take_profit numeric,p_marks jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_account public.trading_accounts%rowtype;v_plan public.challenge_plans%rowtype;
 v_reserved numeric;v_quantity numeric;v_trade_id uuid;
begin
 if p_symbol not in ('BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','LTCUSDT','TRXUSDT','SUIUSDT','AAVEUSDT') then raise exception 'Unsupported symbol'; end if;
 if p_side not in ('long','short') or p_margin<10 or p_mark<=0 then raise exception 'Invalid order'; end if;
 perform public.internal_validate_protection(p_side,p_mark,p_stop_loss,p_take_profit);
 select * into v_account from public.trading_accounts where id=p_account_id and user_id=p_user_id for update;
 if not found then raise exception 'Trading account not found'; end if;
 if v_account.status<>'active' then raise exception 'Trading account is not active'; end if;
 select * into v_plan from public.challenge_plans where id=v_account.plan_id;
 if p_leverage<1 or p_leverage>v_plan.leverage_ratio then raise exception 'Leverage exceeds plan limit'; end if;
 select coalesce((select sum((metadata->>'margin_usdt')::numeric) from public.trades where account_id=p_account_id and closed_at is null),0)
      +coalesce((select sum(margin) from public.pending_orders where account_id=p_account_id and status='pending'),0) into v_reserved;
 if v_reserved+p_margin>v_account.balance then raise exception 'Insufficient simulated margin'; end if;
 v_quantity:=(p_margin*p_leverage)/p_mark;
 insert into public.trades(account_id,user_id,provider_trade_id,symbol,side,quantity,leverage,entry_price,stop_loss,take_profit,opened_at,metadata)
 values(p_account_id,p_user_id,'SIM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20)),p_symbol,p_side,v_quantity,p_leverage,p_mark,p_stop_loss,p_take_profit,now(),
 jsonb_build_object('margin_usdt',p_margin,'notional_usdt',p_margin*p_leverage,'mark_source','validated_multi_provider','fee_rate',0.0004)) returning id into v_trade_id;
 return public.internal_sync_sim_account(p_user_id,p_account_id,p_marks)||jsonb_build_object('openedTradeId',v_trade_id);
end;$function$;

insert into public.email_templates(template_key,subject,html_body,text_body) values
('support_team_message','{{event}} · TakeProp support','<h1>{{event}}</h1><p><strong>Ticket:</strong> {{ticket_id}}</p><p><strong>From:</strong> {{requester_email}}</p><p><strong>Category:</strong> {{category}}</p><p><strong>Subject:</strong> {{subject}}</p><pre style="white-space:pre-wrap;font-family:inherit">{{message}}</pre><p><a href="{{action_url}}">Open operations center</a></p>','{{event}}\n\nTicket: {{ticket_id}}\nFrom: {{requester_email}}\nCategory: {{category}}\nSubject: {{subject}}\n\n{{message}}\n\n{{action_url}}')
on conflict(template_key) do update set subject=excluded.subject,html_body=excluded.html_body,text_body=excluded.text_body,updated_at=now();

create or replace function public.create_support_ticket(p_subject text,p_category text,p_message text)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid();v_id uuid;v_email text;v_recipient record;
begin
 if v_user is null then raise exception 'Authentication required';end if;
 insert into public.support_tickets(user_id,subject,category,priority) values(v_user,trim(p_subject),p_category,case when p_category in ('payment','risk','payout') then 'high' else 'normal' end) returning id into v_id;
 insert into public.support_messages(ticket_id,author_user_id,body) values(v_id,v_user,trim(p_message));
 select email into v_email from auth.users where id=v_user;
 insert into public.email_outbox(user_id,recipient_email,template_key,payload) values(v_user,v_email,'support_received',jsonb_build_object('ticket_id',v_id,'subject',trim(p_subject)));
 for v_recipient in select distinct u.id,u.email from public.user_roles r join auth.users u on u.id=r.user_id where r.role in ('admin','support') and u.email is not null loop
  insert into public.email_outbox(user_id,recipient_email,template_key,payload) values(v_recipient.id,v_recipient.email,'support_team_message',jsonb_build_object('event','New support ticket','ticket_id',v_id,'requester_email',v_email,'category',p_category,'subject',trim(p_subject),'message',trim(p_message),'action_url','https://takeprop.trade/admin'));
 end loop;
 insert into public.notifications(user_id,notification_type,title,body,action_url) values(v_user,'support_received','Support request received','Ticket '||upper(substr(v_id::text,1,8))||' was created.','/support');
 return v_id;
end;$function$;

create or replace function public.add_support_message(p_ticket_id uuid,p_message text)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid();v_ticket public.support_tickets%rowtype;v_staff boolean;v_id uuid;v_email text;v_recipient record;
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
 else
  select email into v_email from auth.users where id=v_ticket.user_id;
  for v_recipient in select distinct u.id,u.email from public.user_roles r join auth.users u on u.id=r.user_id where r.role in ('admin','support') and u.email is not null loop
   insert into public.email_outbox(user_id,recipient_email,template_key,payload) values(v_recipient.id,v_recipient.email,'support_team_message',jsonb_build_object('event','Customer replied to support ticket','ticket_id',p_ticket_id,'requester_email',v_email,'category',v_ticket.category,'subject',v_ticket.subject,'message',trim(p_message),'action_url','https://takeprop.trade/admin'));
  end loop;
 end if;
 return v_id;
end;$function$;

revoke all on function public.create_support_ticket(text,text,text) from public,anon;
revoke all on function public.add_support_message(uuid,text) from public,anon;
grant execute on function public.create_support_ticket(text,text,text) to authenticated;
grant execute on function public.add_support_message(uuid,text) to authenticated;

create or replace function public.internal_place_pending_order(
 p_user_id uuid,p_account_id uuid,p_symbol text,p_side text,p_order_type text,
 p_margin numeric,p_leverage integer,p_trigger_price numeric,p_stop_loss numeric,
 p_take_profit numeric,p_current_mark numeric
) returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_account public.trading_accounts%rowtype;v_plan public.challenge_plans%rowtype;v_reserved numeric;v_id uuid;
begin
 if p_symbol not in ('BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','LTCUSDT','TRXUSDT','SUIUSDT','AAVEUSDT') or p_side not in ('long','short') then raise exception 'Invalid market'; end if;
 if p_order_type not in ('limit','stop') or p_margin<10 or p_trigger_price<=0 or p_current_mark<=0 then raise exception 'Invalid pending order'; end if;
 if (p_order_type='limit' and p_side='long' and p_trigger_price>=p_current_mark)
 or (p_order_type='limit' and p_side='short' and p_trigger_price<=p_current_mark)
 or (p_order_type='stop' and p_side='long' and p_trigger_price<=p_current_mark)
 or (p_order_type='stop' and p_side='short' and p_trigger_price>=p_current_mark) then raise exception 'Trigger price is on the wrong side of the current mark'; end if;
 perform public.internal_validate_protection(p_side,p_trigger_price,p_stop_loss,p_take_profit);
 select * into v_account from public.trading_accounts where id=p_account_id and user_id=p_user_id for update;
 if not found or v_account.status<>'active' then raise exception 'Trading account is not active'; end if;
 select * into v_plan from public.challenge_plans where id=v_account.plan_id;
 if p_leverage<1 or p_leverage>v_plan.leverage_ratio then raise exception 'Leverage exceeds plan limit'; end if;
 select coalesce((select sum((metadata->>'margin_usdt')::numeric) from public.trades where account_id=p_account_id and closed_at is null),0)
      +coalesce((select sum(margin) from public.pending_orders where account_id=p_account_id and status='pending'),0) into v_reserved;
 if v_reserved+p_margin>v_account.balance then raise exception 'Insufficient simulated margin'; end if;
 insert into public.pending_orders(account_id,user_id,symbol,side,order_type,margin,leverage,trigger_price,stop_loss,take_profit,metadata)
 values(p_account_id,p_user_id,p_symbol,p_side,p_order_type,p_margin,p_leverage,p_trigger_price,p_stop_loss,p_take_profit,
 jsonb_build_object('created_mark',p_current_mark,'mark_source','validated_multi_provider')) returning id into v_id;
 return v_id;
end;$function$;

