# TakeProp production readiness

## Implemented in the application

- Email/password authentication, email confirmation and password recovery.
- HTTP-only authenticated sessions with refresh-token renewal.
- Supabase row-level security and role-based payment/payout administration.
- USDT checkout submission on BEP20, ERC20, TRC20 and TON with duplicate TXID protection.
- Manual payment review and automatic creation of simulated challenge accounts after approval.
- Server-authoritative simulated market orders, live reference marks, fees, P&L, position closing and immutable trade history.
- Real-time 3% daily-loss and 6%/8% static-loss enforcement, account locking and phase progression.
- Payout requests and finance review workflow.
- Legal baseline pages, support page, health endpoint, sitemap, robots and production security headers.

## Required operator integrations before taking public customers

These items require real vendor, legal or company accounts and cannot be completed safely with placeholder credentials:

1. Replace `support@takeprop.com` only after the domain mailbox is operational and configure Supabase Auth SMTP.
2. Select and contract a KYC/AML provider; connect its hosted verification flow and webhook before enabling rewards.
3. Obtain legal review for Terms, Privacy, Refund, Risk and AML/KYC pages in the company jurisdiction. Add the legal entity name, registered address and governing law.
4. Add a blockchain data/analytics provider and confirmation policy for automated USDT verification. Keep manual review enabled until the provider is tested on every supported network.
5. Use an operational multisig/controlled treasury wallet. Never keep private keys in Vercel, GitHub or the browser.
6. Configure transactional email, error monitoring, uptime alerts and an incident contact rotation.
7. Enable Supabase leaked-password protection and MFA for every administrator.
8. Complete an independent security review and documented restore/disaster-recovery test.

## Release gate

Do not market the service as a broker, exchange or live funded-trading product. All accounts and trades in this repository are simulated. Do not approve a performance reward until identity, sanctions, wallet ownership and trading-integrity checks are complete.
