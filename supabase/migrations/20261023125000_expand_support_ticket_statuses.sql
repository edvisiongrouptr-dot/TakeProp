alter table public.support_tickets drop constraint if exists support_tickets_status_check;
alter table public.support_tickets add constraint support_tickets_status_check
  check (status in ('open','waiting_user','waiting_support','waiting_for_user','in_progress','resolved','closed'));
