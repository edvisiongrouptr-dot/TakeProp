import {readFile} from 'node:fs/promises'

const checks=[]
async function contains(file,needles){const source=await readFile(file,'utf8');for(const needle of needles)checks.push({ok:source.includes(needle),label:`${file}: ${needle}`})}

await contains('supabase/migrations/20260822100000_harden_kyc_auth_and_admin.sql',[
 'kyc_sessions_one_active_per_user','pg_advisory_xact_lock','last_webhook_event_id',
 "v_session.status in ('approved','rejected','expired')",'kyc.manual_review',
 'alter table public.user_roles enable row level security','A KYC session is required before approval'
])
await contains('supabase/functions/kyc/index.ts',[
 'constantTimeEqual','internal_consume_rate_limit','safeSiteUrl','Invalid signature',
 "verification.protocol!=='https:'",'p_payload:{eventId:event.id,status:event.status}'
])
await contains('apps/web/lib/password-policy.ts',['PASSWORD_MIN_LENGTH=12','uppercase, lowercase, number and symbol'])
await contains('apps/web/app/api/admin/operations/route.ts',["roleSet.has('compliance')",'Valid KYC decision details are required'])
await contains('apps/web/app/api/auth/recover/route.ts',['If an account exists'])

const failures=checks.filter(check=>!check.ok)
if(failures.length){console.error(failures.map(item=>`FAIL ${item.label}`).join('\n'));process.exit(1)}
console.log(`Identity and access security verified (${checks.length} checks).`)
