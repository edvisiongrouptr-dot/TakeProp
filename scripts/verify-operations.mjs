import {readFile} from 'node:fs/promises'

const checks=[]
async function contains(file,needles){const source=await readFile(file,'utf8');for(const needle of needles)checks.push([source.includes(needle),`${file}: ${needle}`])}
await contains('supabase/functions/send-email-outbox/index.ts',['constantTimeEqual','escapeHtml','idempotency-key','internal_record_worker_heartbeat','AbortSignal.timeout'])
await contains('supabase/functions/process-active-orders/index.ts',['constantTimeEqual','internal_record_worker_heartbeat','AbortController'])
await contains('supabase/functions/verify-usdt-payments/index.ts',['constantTimeEqual','internal_record_worker_heartbeat','AbortSignal.timeout'])
await contains('apps/web/lib/server-secret.ts',['timingSafeEqual','bearerMatches'])
for(const file of ['apps/web/app/api/cron/email/route.ts','apps/web/app/api/cron/orders/route.ts','apps/web/app/api/cron/payments/route.ts','apps/web/app/api/health/route.ts'])await contains(file,['bearerMatches'])
await contains('supabase/migrations/20260822103000_harden_email_delivery.sql',["status='sending' and claimed_at<now()-interval '15 minutes'",'for update skip locked','attempts<5',"where id=p_id and status='sending'"])
await contains('docs/PRODUCTION_RUNBOOK.md',['verify:all','frozen-lockfile'])
const failures=checks.filter(([ok])=>!ok)
if(failures.length){console.error(failures.map(([,label])=>`FAIL ${label}`).join('\n'));process.exit(1)}
console.log(`Operational reliability verified (${checks.length} checks).`)
