drop index if exists public.orders_usdt_tx_unique;
create unique index orders_usdt_tx_unique
on public.orders (payment_provider, lower(provider_payment_id))
where payment_provider in ('usdt_bep20','usdt_erc20','usdt_trc20','usdt_ton') and provider_payment_id is not null;

drop policy if exists orders_insert_own_usdt_pending on public.orders;
create policy orders_insert_own_usdt_pending
on public.orders for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and currency = 'USDT'
  and provider_payment_id ~ '^[A-Za-z0-9+/_=-]{20,100}$'
  and (
    (payment_provider = 'usdt_bep20' and provider_checkout_id = '0x30127dee8f4bfeaec586c32d580a8b6066eac11b')
    or (payment_provider = 'usdt_erc20' and provider_checkout_id = '0x30127dee8f4bfeaec586c32d580a8b6066eac11b')
    or (payment_provider = 'usdt_trc20' and provider_checkout_id = 'TLTKYRdtpaaYXoSHMgUgEJ3BGARbQkcx3g')
    or (payment_provider = 'usdt_ton' and provider_checkout_id = 'UQCuT9QECsZp-iBmSM1v8c8Gdga3JWww1sENWn6sywc4cjKc')
  )
  and exists (
    select 1 from public.challenge_plans p
    where p.id = plan_id and p.is_active = true and p.price = amount and p.version = plan_version
  )
);

grant insert (user_id, plan_id, amount, currency, status, payment_provider, provider_checkout_id, provider_payment_id, plan_version, plan_snapshot)
on public.orders to authenticated;
