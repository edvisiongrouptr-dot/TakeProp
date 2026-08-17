# Incident response

## Severity

- **SEV-1:** unauthorized payout/payment approval, credential leak, cross-user data exposure, wrong risk liquidation or platform-wide outage.
- **SEV-2:** delayed conditional orders, email/KYC/payment verifier outage, elevated errors.
- **SEV-3:** isolated UI or support issue with a safe workaround.

## Response

1. Record UTC start time, reporter, affected users/accounts and evidence.
2. Contain: pause checkout/payouts, suspend accounts, revoke tokens and rotate keys as appropriate.
3. Preserve Vercel/Supabase/provider logs and admin audit records. Do not delete or rewrite evidence.
4. Correct with a reviewed patch and migration; test in preview before production.
5. Notify affected users and authorities where counsel determines it is required.
6. Publish an internal post-incident review with root cause, impact, timeline and prevention owners.

Payment and trading disputes must retain the submitted TXID, verification evidence, server mark prices, orders, trades, risk events and administrator audit trail.
