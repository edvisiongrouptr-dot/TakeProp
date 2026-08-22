# TakeProp engineering changelog

## 2026-08-22 — Identity and access hardening

- Enforced a 12-character mixed-complexity password policy for registration and recovery.
- Made recovery responses account-enumeration safe and added tighter endpoint request limits.
- Added serialized KYC session creation, per-user active-session uniqueness, expiry and attempt limits.
- Made KYC webhooks idempotent, transition-safe and resistant to timing attacks.
- Minimized retained KYC provider payloads so raw identity documents and provider responses are not copied into application tables.
- Added explicit self-read RLS for application roles while keeping role mutation unavailable to clients.
- Added route-level admin/compliance authorization before privileged RPC calls.
- Added automated identity-security release checks.

### Deployment notes

Apply `supabase/migrations/20260822100000_harden_kyc_auth_and_admin.sql`, deploy the `kyc` Edge Function, and configure both `SITE_URL` and `NEXT_PUBLIC_SITE_URL` with the canonical HTTPS production origin.

## 2026-08-22 — Email and worker reliability

- Added expiring delivery leases so interrupted email jobs return to the retry queue.
- Added provider idempotency keys, strict timeouts, bounded retries and HTML placeholder escaping.
- Added email-worker health heartbeats without exposing provider error details to callers.
- Added constant-time bearer-token verification for cron, health-check and background-worker endpoints.
- Made every risk, payment, identity and operations verifier part of the mandatory frozen-lockfile CI release gate.
- Added a fail-fast single-command source release script and final production acceptance runbook.
