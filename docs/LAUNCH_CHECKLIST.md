# TakeProp launch checklist

## Automated technical gate

- Install dependencies with `pnpm install --no-frozen-lockfile` and commit the regenerated lockfile.
- Run `pnpm verify:release`, `pnpm verify:environment`, and `pnpm --filter web build`.
- Apply every Supabase migration in timestamp order and deploy all five Edge Functions.
- Verify `/api/health?deep=1` with the health secret and run `pnpm smoke:production` against production.
- Confirm order, payment and email worker heartbeats are current in Operations Center.

## End-to-end acceptance gate

- New registration requires age, Terms, Privacy and Risk acceptance; confirmation and recovery email links return to the production domain.
- Purchase verifies the exact USDT network, contract, recipient, amount, confirmations and unique TXID before account provisioning.
- One-Step and Two-Step accounts progress only after profit target and minimum trading days, and breach daily/static loss using open equity.
- Market, limit and stop orders; stop-loss/take-profit; fees; position close; history and disconnect-safe server execution are tested.
- KYC blocks rewards until approval. Payout wallet format matches the selected chain and Operations records the final payout TXID.
- Admin, finance, support and compliance permissions are tested with separate least-privilege accounts; audit events cannot be edited by operators.

## Operator-owned launch blockers

- Counsel approves entity name, supported/prohibited jurisdictions, Terms, Privacy, Risk, Refund and AML/KYC text.
- KYC, blockchain verification, email and monitoring provider contracts are active with production credentials.
- SPF, DKIM and DMARC pass; custom domain, redirects, TLS, Supabase URL allow-list and authentication email templates use the production domain.
- Supabase point-in-time recovery/backups are enabled and a restore rehearsal is documented.
- A scheduler or dedicated worker runs conditional-order and payment verification jobs at the required cadence.
- Incident contacts, customer support coverage, payout wallet custody/approval policy and credential rotation owners are assigned.

Paid public traffic must remain disabled until every operator-owned blocker is signed off. Code cannot substitute for legal approval, provider contracts, wallet custody or production credentials.
