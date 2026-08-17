const requiredPublic=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','NEXT_PUBLIC_SITE_URL']
const requiredSecrets=['HEALTHCHECK_SECRET','CRON_SECRET','EMAIL_WORKER_SECRET','ORDER_WORKER_SECRET','PAYMENT_WORKER_SECRET','LEGAL_ACCEPTANCE_SALT','PAYMENT_VERIFICATION_API_TOKEN','KYC_PROVIDER_API_TOKEN','KYC_WEBHOOK_SECRET','RESEND_API_KEY']
const requiredUrls=['PAYMENT_VERIFICATION_API_URL','KYC_PROVIDER_API_URL']
const failures=[]
for(const name of [...requiredPublic,...requiredSecrets,...requiredUrls]){const value=process.env[name]?.trim();if(!value)failures.push(`${name} is missing`);else if(/replace|example|your-|localhost/i.test(value))failures.push(`${name} still contains a placeholder`)}
for(const name of requiredSecrets){const value=process.env[name]?.trim()||'';if(value&&value.length<32)failures.push(`${name} must contain at least 32 characters`)}
for(const name of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SITE_URL',...requiredUrls]){const value=process.env[name];if(value)try{const url=new URL(value);if(url.protocol!=='https:')failures.push(`${name} must use HTTPS`)}catch{failures.push(`${name} is not a valid URL`)}}
if(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY&&!/^(sb_publishable_|eyJ)/.test(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY))failures.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY has an unexpected format')
if(!/^.+<[^<>\s]+@[^<>\s]+>$/.test(process.env.EMAIL_FROM||''))failures.push('EMAIL_FROM must look like: TakeProp <operations@takeprop.com>')
if(failures.length){console.error(`Production environment is not ready:\n- ${failures.join('\n- ')}`);process.exit(1)}
console.log('Production environment variables passed structural validation. Secret values were not printed.')
