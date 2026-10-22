begin;

-- The email worker reads templates with the service role through PostgREST.
-- RLS remains enabled and no browser-facing role receives access.
grant select on table public.email_templates to service_role;

commit;
