const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})
function secret(name:string,fallback:string){const direct=Deno.env.get(name);if(direct)return direct;const raw=Deno.env.get(fallback)||'';try{const parsed=JSON.parse(raw);return String(parsed.default||Object.values(parsed)[0]||'')}catch{return raw}}
const hex=(bytes:ArrayBuffer)=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')
async function signature(secretValue:string,body:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secretValue),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)))}
function constantTimeEqual(left:string,right:string){if(left.length!==right.length)return false;let difference=0;for(let i=0;i<left.length;i++)difference|=left.charCodeAt(i)^right.charCodeAt(i);return difference===0}
function safeSiteUrl(){const configured=(Deno.env.get('SITE_URL')||Deno.env.get('NEXT_PUBLIC_SITE_URL')||'https://takeprop.vercel.app').replace(/\/$/,'');try{const parsed=new URL(configured);if(parsed.protocol!=='https:')throw new Error('https required');return parsed.origin}catch{return'https://takeprop.vercel.app'}}
async function serviceRpc(url:string,service:string,name:string,body:unknown){return fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:service,authorization:`Bearer ${service}`,'content-type':'application/json'},body:JSON.stringify(body)})}

Deno.serve(async request=>{
 const url=Deno.env.get('SUPABASE_URL')||'',anon=secret('SUPABASE_ANON_KEY','SUPABASE_PUBLISHABLE_KEYS'),service=secret('SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEYS')
 const providerUrl=(Deno.env.get('KYC_PROVIDER_API_URL')||'').replace(/\/$/,''),providerToken=Deno.env.get('KYC_PROVIDER_API_TOKEN')||''
 if(!url||!anon||!service)return json({error:'KYC service is not configured'},503)
 if(request.method!=='POST')return json({error:'Method not allowed'},405)
 if(new URL(request.url).pathname.endsWith('/webhook')){
  const raw=await request.text(),webhookSecret=Deno.env.get('KYC_WEBHOOK_SECRET')||'',received=(request.headers.get('x-takeprop-signature')||'').toLowerCase()
  const expected=webhookSecret?await signature(webhookSecret,raw):''
  if(!webhookSecret||!constantTimeEqual(received,expected))return json({error:'Invalid signature'},401)
  let event:Record<string,unknown>;try{event=JSON.parse(raw)}catch{return json({error:'Invalid payload'},400)}
  if(!event.id||!event.reference||!event.status)return json({error:'Invalid payload'},400)
  const response=await serviceRpc(url,service,'internal_process_kyc_webhook',{p_event_id:String(event.id),p_provider:String(event.provider||'configured_provider'),p_reference:String(event.reference),p_status:String(event.status),p_payload:{eventId:event.id,status:event.status}})
  return json(response.ok?{ok:true}:{error:'Webhook processing failed'},response.ok?200:400)
 }
 const authorization=request.headers.get('authorization')||''
 if(!authorization.startsWith('Bearer ')||!providerUrl||!providerToken)return json({error:'Unauthorized or provider unavailable'},401)
 const userResponse=await fetch(`${url}/auth/v1/user`,{headers:{apikey:anon,authorization}});if(!userResponse.ok)return json({error:'Unauthorized'},401)
 const user=await userResponse.json()
 const limit=await serviceRpc(url,service,'internal_consume_rate_limit',{p_scope:'kyc_session',p_subject_hash:String(user.id),p_limit:3,p_window_seconds:3600})
 if(!limit.ok||await limit.json()!==true)return json({error:'Too many verification attempts. Try again later.'},429)
 let parsedProviderUrl:URL;try{parsedProviderUrl=new URL(providerUrl);if(parsedProviderUrl.protocol!=='https:')throw new Error('https required')}catch{return json({error:'KYC provider is not configured safely'},503)}
 const site=safeSiteUrl()
 const providerResponse=await fetch(`${parsedProviderUrl.origin}${parsedProviderUrl.pathname}/sessions`,{method:'POST',headers:{authorization:`Bearer ${providerToken}`,'content-type':'application/json'},body:JSON.stringify({externalUserId:user.id,email:user.email,successUrl:`${site}/kyc?status=completed`,cancelUrl:`${site}/kyc?status=canceled`,webhookUrl:`${url}/functions/v1/kyc/webhook`}),signal:AbortSignal.timeout(20_000)})
 const provider=await providerResponse.json().catch(()=>({}));if(!providerResponse.ok||!provider.id||!provider.url)return json({error:'Unable to start verification'},502)
 let verification:URL;try{verification=new URL(String(provider.url));if(verification.protocol!=='https:')throw new Error('https required')}catch{return json({error:'Provider returned an invalid verification URL'},502)}
 const rpc=await serviceRpc(url,service,'internal_create_kyc_session',{p_user_id:user.id,p_provider:String(provider.provider||'configured_provider'),p_reference:String(provider.id),p_url:verification.toString(),p_payload:{sessionCreated:true}})
 if(!rpc.ok)return json({error:'Unable to save verification session'},500)
 return json({ok:true,url:verification.toString()})
})
