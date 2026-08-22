import {access,readFile} from 'node:fs/promises'

const required=[
 'apps/web/app/page.tsx','apps/web/app/auth/page.tsx','apps/web/app/dashboard/page.tsx',
 'apps/web/app/terminal/page.tsx','apps/web/app/admin/page.tsx','apps/web/app/support/page.tsx','apps/web/app/kyc/page.tsx',
 'apps/web/app/terms/page.tsx','apps/web/app/privacy/page.tsx','apps/web/app/risk-disclosure/page.tsx',
 'apps/web/proxy.ts','apps/web/vercel.json','supabase/functions/sim-trading/index.ts',
 'supabase/functions/send-email-outbox/index.ts','supabase/functions/process-active-orders/index.ts','supabase/functions/verify-usdt-payments/index.ts','supabase/functions/kyc/index.ts',
 'supabase/migrations/20260818000000_security_rate_limits.sql','supabase/migrations/20260818010000_automatic_payment_verification.sql','supabase/migrations/20260818020000_kyc_provider_integration.sql','supabase/migrations/20260818030000_worker_health_monitoring.sql','supabase/migrations/20260818040000_legal_acceptance_and_wallet_validation.sql',
 'supabase/migrations/20260822090000_harden_risk_and_stage_engine.sql','supabase/migrations/20260822093000_harden_payments_and_payouts.sql','supabase/migrations/20260822100000_harden_kyc_auth_and_admin.sql','supabase/migrations/20260822103000_harden_email_delivery.sql','apps/web/lib/password-policy.ts','apps/web/lib/server-secret.ts','docs/CHANGELOG.md','docs/FINAL_DEPLOYMENT.md','APPLY_TAKEPROP_FINAL.sh'
]
const failures=[]
for(const file of required)try{await access(file)}catch{failures.push(`Missing ${file}`)}
const env=await readFile('.env.example','utf8')
const webPackage=JSON.parse(await readFile('apps/web/package.json','utf8'))
const rootPackage=JSON.parse(await readFile('package.json','utf8'))
if(!String(webPackage.dependencies?.next||'').startsWith('16.2.'))failures.push('Next.js must remain on the reviewed 16.2 LTS line')
if(!String(rootPackage.scripts?.['verify:all']||'').includes('verify:operations'))failures.push('Combined release verification gate is missing')
const workflow=await readFile('.github/workflows/ci.yml','utf8')
if(!workflow.includes('pnpm install --frozen-lockfile')||!workflow.includes('pnpm verify:all'))failures.push('CI must enforce the frozen-lockfile release gate')
for(const name of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','NEXT_PUBLIC_SITE_URL','SITE_URL','HEALTHCHECK_SECRET','CRON_SECRET','EMAIL_WORKER_SECRET','ORDER_WORKER_SECRET','PAYMENT_WORKER_SECRET','LEGAL_ACCEPTANCE_SALT','PAYMENT_VERIFICATION_API_URL','PAYMENT_VERIFICATION_API_TOKEN','KYC_PROVIDER_API_URL','KYC_PROVIDER_API_TOKEN','KYC_WEBHOOK_SECRET','RESEND_API_KEY'])if(!env.includes(`${name}=`))failures.push(`Missing env template ${name}`)
for(const file of ['apps/web/app/api/admin/operations/route.ts','apps/web/app/api/trading/route.ts']){
 const source=await readFile(file,'utf8')
 if(source.includes('SUPABASE_SERVICE_ROLE')||source.includes('service_role'))failures.push(`Service role reference in web route ${file}`)
}
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log(`Release structure verified (${required.length} required files).`)
