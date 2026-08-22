# TakeProp final deployment

## Single source release

After the completed release bundle has been copied into the repository, run this once from the repository root:

```bash
bash APPLY_TAKEPROP_FINAL.sh
```

The script synchronizes and commits the lockfile, runs all internal verifiers, requires a successful production build, commits the completed source and pushes `main`. It stops immediately on the first failure.

## Supabase production activation

In the linked production Supabase project, apply every migration in timestamp order and deploy these functions: `sim-trading`, `process-active-orders`, `verify-usdt-payments`, `send-email-outbox`, and `kyc`. Set the server-side secrets listed in `.env.example`; never expose worker, provider or service-role secrets through `NEXT_PUBLIC_*` variables.

## Production acceptance

1. Confirm the Vercel deployment for the new `main` commit is **Ready**.
2. Run `TAKEPROP_PRODUCTION_URL=https://your-domain.example pnpm smoke:production`.
3. Call `/api/health?deep=1` with `Authorization: Bearer $HEALTHCHECK_SECRET` and require HTTP 200.
4. Complete one test registration, confirmed USDT order, simulated trade, limit breach, KYC approval and payout review using non-production funds/test provider records.
5. Confirm fresh successful heartbeats for email, orders and payments in Operations Center.

Paid public traffic remains disabled until every operator-owned item in `docs/LAUNCH_CHECKLIST.md` is signed off.
