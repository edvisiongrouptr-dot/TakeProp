begin;

alter table public.email_outbox add column if not exists claimed_at timestamptz;
create index if not exists email_outbox_stuck_idx on public.email_outbox(claimed_at) where status='sending';

create or replace function public.internal_claim_email_batch(p_limit integer default 20)
returns setof public.email_outbox language plpgsql security definer set search_path='' as $$
begin
 update public.email_outbox set status='failed',last_error='Delivery lease expired',next_attempt_at=now(),claimed_at=null
 where status='sending' and claimed_at<now()-interval '15 minutes';
 return query update public.email_outbox e set status='sending',attempts=e.attempts+1,claimed_at=now()
 where e.id in(
  select id from public.email_outbox
  where status in('queued','failed') and next_attempt_at<=now() and attempts<5
  order by created_at for update skip locked limit least(greatest(p_limit,1),100)
 ) returning e.*;
end$$;

create or replace function public.internal_finish_email(p_id uuid,p_sent boolean,p_provider_message_id text,p_error text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_sent and char_length(trim(coalesce(p_provider_message_id,'')))<3 then raise exception 'Provider message id is required';end if;
 update public.email_outbox set
  status=case when p_sent then 'sent' when attempts>=5 then 'canceled' else 'failed' end,
  provider_message_id=case when p_sent then left(trim(p_provider_message_id),300) else provider_message_id end,
  last_error=case when p_sent then null else left(coalesce(p_error,'Delivery failed'),1000) end,
  sent_at=case when p_sent then now() else sent_at end,
  next_attempt_at=case when p_sent then next_attempt_at else now()+make_interval(mins=>least(60,power(2,attempts)::integer)) end,
  claimed_at=null
 where id=p_id and status='sending';
 if not found then raise exception 'Email job is not in a deliverable state';end if;
end$$;

revoke all on function public.internal_claim_email_batch(integer) from public,anon,authenticated;
revoke all on function public.internal_finish_email(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.internal_claim_email_batch(integer) to service_role;
grant execute on function public.internal_finish_email(uuid,boolean,text,text) to service_role;

commit;
