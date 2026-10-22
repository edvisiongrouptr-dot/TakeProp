do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'takeprop-payments-every-2-minutes'
  ) then
    perform cron.unschedule('takeprop-payments-every-2-minutes');
  end if;
end
$$;

delete from public.worker_heartbeats
where worker_name = 'verify-usdt-payments';
