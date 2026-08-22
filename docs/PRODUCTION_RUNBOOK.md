# TakeProp production runbook

## Release gate

1. Apply numbered patches in order and run every new Supabase migration.
2. Deploy `sim-trading`, `process-active-orders`, `verify-usdt-payments`, `send-email-outbox`, and `kyc` Edge Functions.
3. Configure every variable listed in `.env.example` in Vercel and the matching worker secrets in Supabase.
4. Run `pnpm install --frozen-lockfile`, `pnpm verify:all`, `pnpm verify:environment`, and `pnpm --filter web build`. CI enforces the same frozen-lockfile release gate.
5. Deploy a preview, complete registration, recovery, payment, KYC, trading, breach, progression, payout and support acceptance tests.
6. Promote only a tested immutable deployment to production, then run `pnpm smoke:production`.

## Daily operations

- Review failed payment verifications, support tickets, risk events, payouts and KYC rejections.
- Confirm the email, payment and order workers have completed recently.
- Check error rate, latency, failed logins and database resource use.
- Never approve a payment without matching network, asset contract, recipient, amount and confirmations.

## Rollback

Use Vercel Instant Rollback to the last verified deployment. Database migrations are forward-only: restore data from a tested backup or ship a compensating migration. Never edit a production migration already applied.

## Emergency controls

Pause checkout with `FEATURE_FLAGS_PAID_CHECKOUT_ENABLED=false`, pause payouts with `FEATURE_FLAGS_PAYOUTS_ENABLED=false`, and suspend affected trading accounts from Operations Center. Rotate exposed credentials immediately and invalidate active sessions when account compromise is suspected.
