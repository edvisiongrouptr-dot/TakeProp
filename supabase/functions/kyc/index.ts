const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})
function secret(name:string,fallback:string){const direct=Deno.env.get(name);if(direct)return direct;const raw=Deno.env.get(fallback)||'';try{const parsed=JSON.parse(raw);return String(parsed.default||Object.values(parsed)[0]||'')}catch{return raw}}
const hex=(bytes:ArrayBuffer)=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')
async function signature(secretValue:string,body:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secretValue),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)))}
Deno.serve(async request=>{
 const url=Deno.env.get('SUPABASE_URL')||'',anon=secret('SUPABASE_ANON_KEY','SUPABASE_PUBLISHABLE_KEYS'),service=secret('SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEYS')
 const providerUrl=(Deno.env.get('KYC_PROVIDER_API_URL')||'').replace(/\/$/,''),providerToken=Deno.env.get('KYC_PROVIDER_API_TOKEN')||''
 if(!url||!anon||!service)return json({error:'KYC service is not configured'},503)
 if(request.method!=='POST')return json({error:'Method not allowed'},405)
 if(new URL(request.url).pathname.endsWith('/webhook')){
  const raw=await request.text(),webhookSecret=Deno.env.get('KYC_WEBHOOK_SECRET')||'',received=request.headers.get('x-takeprop-signature')||''
  if(!webhookSecret||received!==await signature(webhookSecret,raw))return json({error:'Invalid signature'},401)
  const event=JSON.parse(raw),headers={apikey:service,authorization:`Bearer ${service}`,'content-type':'application/json'}
  const response=await fetch(`${url}/rest/v1/rpc/internal_process_kyc_webhook`,{method:'POST',headers,body:JSON.stringify({p_event_id:String(event.id),p_provider:String(event.provider||'configured_provider'),p_reference:String(event.reference),p_status:String(event.status),p_payload:event})})
  return json(response.ok?{ok:true}:{error:(await response.json().catch(()=>({}))).message||'Webhook failed'},response.ok?200:400)
 }
 const authorization=request.headers.get('authorization')||''
 if(!authorization.startsWith('Bearer ')||!providerUrl||!providerToken)return json({error:'Unauthorized or provider unavailable'},401)
 const userResponse=await fetch(`${url}/auth/v1/user`,{headers:{apikey:anon,authorization}});if(!userResponse.ok)return json({error:'Unauthorized'},401)
 const user=await userResponse.json(),origin=request.headers.get('origin')||'https://takeprop.vercel.app'
 const providerResponse=await fetch(`${providerUrl}/sessions`,{method:'POST',headers:{authorization:`Bearer ${providerToken}`,'content-type':'application/json'},body:JSON.stringify({externalUserId:user.id,email:user.email,successUrl:`${origin}/kyc?status=completed`,cancelUrl:`${origin}/kyc?status=canceled`,webhookUrl:`${url}/functions/v1/kyc/webhook`}),signal:AbortSignal.timeout(20_000)})
 const provider=await providerResponse.json().catch(()=>({}));if(!providerResponse.ok||!provider.id||!provider.url)return json({error:provider.message||'Unable to start verification'},502)
 const rpc=await fetch(`${url}/rest/v1/rpc/internal_create_kyc_session`,{method:'POST',headers:{apikey:service,authorization:`Bearer ${service}`,'content-type':'application/json'},body:JSON.stringify({p_user_id:user.id,p_provider:String(provider.provider||'configured_provider'),p_reference:String(provider.id),p_url:String(provider.url),p_payload:provider})})
 if(!rpc.ok)return json({error:'Unable to save verification session'},500)
 return json({ok:true,url:provider.url})
})
