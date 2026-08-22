const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})
const escapeHtml=(value:string)=>value.replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]||char))
const render=(template:string,payload:Record<string,unknown>,html=false)=>template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g,(_,key)=>{const value=String(payload[key]??'');return html?escapeHtml(value):value})
function constantTimeEqual(left:string,right:string){if(left.length!==right.length)return false;let difference=0;for(let i=0;i<left.length;i++)difference|=left.charCodeAt(i)^right.charCodeAt(i);return difference===0}
async function rpc(url:string,key:string,name:string,body:unknown){const result=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15_000)});const json=await result.json().catch(()=>null);if(!result.ok)throw new Error(`${name} failed`);return json}

Deno.serve(async request=>{
 const startedAt=new Date().toISOString()
 if(request.method!=='POST')return response({error:'Method not allowed'},405)
 const secret=Deno.env.get('EMAIL_WORKER_SECRET')||'',provided=request.headers.get('authorization')?.replace(/^Bearer\s+/,'')||''
 if(!secret||!constantTimeEqual(provided,secret))return response({error:'Unauthorized'},401)
 const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',resend=Deno.env.get('RESEND_API_KEY')||'',from=Deno.env.get('EMAIL_FROM')||'TakeProp <notifications@takeprop.com>'
 if(!url||!key||!resend)return response({error:'Email worker is not configured'},503)
 try{
  const jobs=await rpc(url,key,'internal_claim_email_batch',{p_limit:20}),results=[] as Array<{id:string,status:string}>
  for(const job of jobs){
   try{
    const templateResponse=await fetch(`${url}/rest/v1/email_templates?template_key=eq.${encodeURIComponent(job.template_key)}&select=subject,html_body,text_body&limit=1`,{headers:{apikey:key,authorization:`Bearer ${key}`},signal:AbortSignal.timeout(10_000)})
    if(!templateResponse.ok)throw new Error('Template lookup failed')
    const templates=await templateResponse.json(),template=templates[0]
    if(!template)throw new Error('Template not found')
    const mail=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${resend}`,'content-type':'application/json','idempotency-key':`takeprop-email-${job.id}`},body:JSON.stringify({from,to:[job.recipient_email],subject:render(template.subject,job.payload),html:render(template.html_body,job.payload,true),text:render(template.text_body,job.payload)}),signal:AbortSignal.timeout(20_000)})
    const result=await mail.json().catch(()=>({}))
    if(!mail.ok||!result.id)throw new Error('Email provider rejected delivery')
    await rpc(url,key,'internal_finish_email',{p_id:job.id,p_sent:true,p_provider_message_id:String(result.id),p_error:null})
    results.push({id:job.id,status:'sent'})
   }catch(error){
    await rpc(url,key,'internal_finish_email',{p_id:job.id,p_sent:false,p_provider_message_id:null,p_error:error instanceof Error?error.message:'Delivery failed'}).catch(()=>null)
    results.push({id:job.id,status:'failed'})
   }
  }
  const summary={ok:results.every(item=>item.status==='sent'),claimed:jobs.length,sent:results.filter(item=>item.status==='sent').length,failed:results.filter(item=>item.status==='failed').length}
  await rpc(url,key,'internal_record_worker_heartbeat',{p_worker:'send-email-outbox',p_success:summary.ok,p_started_at:startedAt,p_result:summary,p_error:summary.ok?null:'One or more emails failed'})
  return response(summary,summary.ok?200:207)
 }catch(error){
  const message=error instanceof Error?error.message:'Email worker failed'
  await rpc(url,key,'internal_record_worker_heartbeat',{p_worker:'send-email-outbox',p_success:false,p_started_at:startedAt,p_result:{},p_error:message}).catch(()=>null)
  return response({error:'Email worker failed'},503)
 }
})
