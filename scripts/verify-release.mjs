import {access,readFile} from 'node:fs/promises'

const required=[
 'apps/web/app/page.tsx','apps/web/app/auth/page.tsx','apps/web/app/dashboard/page.tsx',
 'apps/web/app/terminal/page.tsx','apps/web/app/admin/page.tsx','apps/web/app/support/page.tsx','apps/web/app/kyc/page.tsx',
 'apps/web/app/terms/page.tsx','apps/web/app/privacy/page.tsx','apps/web/app/risk-disclosure/page.tsx',
 'apps/web/proxy.ts','apps/web/vercel.json','supabase/functions/sim-trading/index.ts',
 'supabase/functions/send-email-outbox/index.ts','supabase/functions/process-active-orders/index.ts','supabase/functions/verify-usdt-payments/index.ts','supabase/functions/kyc/index.ts',
 'supabase/migrations/20260818000000_security_rate_limits.sql','supabase/migrations/20260818010000_automatic_payment_verification.sql','supabase/migrations/20260818020000_kyc_provider_integration.sql','supabase/migrations/20260818030000_worker_health_monitoring.sql','supabase/migrations/20260818040000_legal_acceptance_and_wallet_validation.sql'
]
const failures=[]
for(const file of required)try{await access(file)}catch{failures.push(`Missing ${file}`)}
const env=await readFile('.env.example','utf8')
const webPackage=JSON.parse(await readFile('apps/web/package.json','utf8'))
if(!String(webPackage.dependencies?.next||'').startsWith('16.2.'))failures.push('Next.js must remain on the reviewed 16.2 LTS line')
for(const name of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','HEALTHCHECK_SECRET','CRON_SECRET','EMAIL_WORKER_SECRET','ORDER_WORKER_SECRET','PAYMENT_WORKER_SECRET','LEGAL_ACCEPTANCE_SALT','PAYMENT_VERIFICATION_API_URL','PAYMENT_VERIFICATION_API_TOKEN','KYC_PROVIDER_API_URL','KYC_PROVIDER_API_TOKEN','KYC_WEBHOOK_SECRET','RESEND_API_KEY'])if(!env.includes(`${name}=`))failures.push(`Missing env template ${name}`)
for(const file of ['apps/web/app/api/admin/operations/route.ts','apps/web/app/api/trading/route.ts']){
 const source=await readFile(file,'utf8')
 if(source.includes('SUPABASE_SERVICE_ROLE')||source.includes('service_role'))failures.push(`Service role reference in web route ${file}`)
}
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log(`Release structure verified (${required.length} required files).`)
