const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})
function secret(name:string,fallback:string){const direct=Deno.env.get(name);if(direct)return direct;const raw=Deno.env.get(fallback)||'';try{const parsed=JSON.parse(raw);return String(parsed.default||Object.values(parsed)[0]||'')}catch{return raw}}
const hex=(bytes:ArrayBuffer)=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')
async function signature(secretValue:string,body:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secretValue),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)))}
function constantTimeEqual(left:string,right:string){if(left.length!==right.length)return false;let difference=0;for(let i=0;i<left.length;i++)difference|=left.charCodeAt(i)^right.charCodeAt(i);return difference===0}
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));return value}
function normalizeStatus(value:string){const status=value.trim().toLowerCase().replace(/[._-]+/g,' ');if(['approved','verified','session verified'].includes(status))return'approved';if(['declined','rejected','session declined'].includes(status))return'rejected';if(['in review','review started','session review started'].includes(status))return'in_review';if(['expired','kyc expired'].includes(status))return'expired';return'pending'}
async function serviceRpc(url:string,service:string,name:string,body:unknown){return fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:service,authorization:`Bearer ${service}`,'content-type':'application/json'},body:JSON.stringify(body)})}

Deno.serve(async request=>{
 const url=Deno.env.get('SUPABASE_URL')||'',anon=secret('SUPABASE_ANON_KEY','SUPABASE_PUBLISHABLE_KEYS'),service=secret('SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEYS')
 if(!url||!anon||!service)return json({error:'KYC service is not configured'},503)
 if(request.method!=='POST')return json({error:'Method not allowed'},405)

 if(new URL(request.url).pathname.endsWith('/webhook')){
  const raw=await request.text(),webhookSecret=Deno.env.get('DIDIT_WEBHOOK_SECRET')||'',received=(request.headers.get('x-signature-v2')||'').toLowerCase()
  let event:Record<string,unknown>;try{event=JSON.parse(raw)}catch{return json({error:'Invalid payload'},400)}
  const expected=webhookSecret?await signature(webhookSecret,JSON.stringify(canonical(event))):''
  const rawExpected=webhookSecret?await signature(webhookSecret,raw):''
  if(!webhookSecret||(!constantTimeEqual(received,expected)&&!constantTimeEqual(received,rawExpected)))return json({error:'Invalid signature'},401)
  const nested=(event.session&&typeof event.session==='object'?event.session:{}) as Record<string,unknown>
  const decision=(event.decision&&typeof event.decision==='object'?event.decision:{}) as Record<string,unknown>
  const reference=String(event.session_id||nested.id||event.id||'')
  const rawStatus=String(event.status||decision.status||nested.status||event.event_type||event.type||'')
  const status=normalizeStatus(rawStatus),eventId=String(event.event_id||`${reference}:${status}`)
  if(!reference||!rawStatus)return json({error:'Invalid payload'},400)
  const response=await serviceRpc(url,service,'internal_process_kyc_webhook',{p_event_id:eventId,p_provider:'didit',p_reference:reference,p_status:status,p_payload:{eventId,status}})
  return json(response.ok?{ok:true}:{error:'Webhook processing failed'},response.ok?200:400)
 }

 const authorization=request.headers.get('authorization')||'',apiKey=Deno.env.get('DIDIT_API_KEY')||'',workflowId=Deno.env.get('DIDIT_WORKFLOW_ID')||''
 if(!authorization.startsWith('Bearer '))return json({error:'Unauthorized'},401)
 if(!apiKey||!workflowId)return json({error:'Identity verification setup is incomplete.'},503)
 const userResponse=await fetch(`${url}/auth/v1/user`,{headers:{apikey:anon,authorization}});if(!userResponse.ok)return json({error:'Unauthorized'},401)
 const user=await userResponse.json()
 const limit=await serviceRpc(url,service,'internal_consume_rate_limit',{p_scope:'kyc_session',p_subject_hash:String(user.id),p_limit:3,p_window_seconds:3600})
 if(!limit.ok||await limit.json()!==true)return json({error:'Too many verification attempts. Try again later.'},429)
 const providerResponse=await fetch('https://verification.didit.me/v3/session/',{method:'POST',headers:{'x-api-key':apiKey,'content-type':'application/json'},body:JSON.stringify({workflow_id:workflowId,vendor_data:user.id}),signal:AbortSignal.timeout(20_000)})
 const provider=await providerResponse.json().catch(()=>({})),reference=String(provider.session_id||provider.id||provider.session?.id||'')
 if(!providerResponse.ok||!reference||!provider.url)return json({error:'Unable to start verification'},502)
 let verification:URL;try{verification=new URL(String(provider.url));if(verification.protocol!=='https:'||!(verification.hostname==='didit.me'||verification.hostname.endsWith('.didit.me')))throw new Error('invalid host')}catch{return json({error:'Provider returned an invalid verification URL'},502)}
 const rpc=await serviceRpc(url,service,'internal_create_kyc_session',{p_user_id:user.id,p_provider:'didit',p_reference:reference,p_url:verification.toString(),p_payload:{sessionCreated:true}})
 if(!rpc.ok)return json({error:'Unable to save verification session'},500)
 return json({ok:true,url:verification.toString()})
})