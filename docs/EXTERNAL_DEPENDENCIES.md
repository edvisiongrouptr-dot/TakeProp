# External production dependencies

Code is prepared for these integrations, but launch requires contracts/accounts and credentials owned by the operator.

| Capability | Required external item | Failure behavior |
|---|---|---|
| Authentication/database | Supabase production project, backups and SMTP | Registration/data operations stop |
| Transaction verification | USDT verification provider supporting BEP20/ERC20/TRC20/TON | Orders remain pending/manual review |
| KYC/AML | Contracted KYC provider and signed webhook | Payout remains blocked |
| Transactional email | Resend domain, API key and SPF/DKIM/DMARC | Messages retry then enter failed queue |
| Always-on orders | Scheduler capable of one-minute calls or dedicated stream worker | Conditional orders are not continuously evaluated |
| Monitoring | External uptime check and alert webhook | Failures are visible only in platform logs |
| Domain | Registered domain and DNS control | Vercel domain remains in use |
| Legal/compliance | Counsel-approved entity, jurisdiction, terms, privacy, refunds and AML program | Public paid launch must not proceed |

Do not store service-role keys, worker secrets or provider tokens in `NEXT_PUBLIC_*` variables or in Git.
