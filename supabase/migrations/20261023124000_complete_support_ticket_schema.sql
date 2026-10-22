alter table public.support_tickets
  add column if not exists assigned_to uuid references auth.users(id),
  add column if not exists closed_at timestamptz;
