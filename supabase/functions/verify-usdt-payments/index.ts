const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})
function secret(name:string,fallback:string){const direct=Deno.env.get(name);if(direct)return direct;const raw=Deno.env.get(fallback)||'';try{const parsed=JSON.parse(raw);return String(parsed.default||Object.values(parsed)[0]||'')}catch{return raw}}
const minimums:Record<string,number>={usdt_bep20:12,usdt_erc20:20,usdt_trc20:20,usdt_ton:10}
Deno.serve(async request=>{
 const startedAt=new Date().toISOString()
 if(request.method!=='POST')return json({error:'Method not allowed'},405)
 const workerSecret=Deno.env.get('PAYMENT_WORKER_SECRET')||''
 if(!workerSecret||request.headers.get('authorization')!==`Bearer ${workerSecret}`)return json({error:'Unauthorized'},401)
 const url=Deno.env.get('SUPABASE_URL')||'',serviceKey=secret('SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEYS')
 const verifierUrl=Deno.env.get('PAYMENT_VERIFICATION_API_URL')||'',verifierToken=Deno.env.get('PAYMENT_VERIFICATION_API_TOKEN')||''
 if(!url||!serviceKey||!verifierUrl||!verifierToken)return json({error:'Payment verification is not configured'},503)
 const headers={apikey:serviceKey,authorization:`Bearer ${serviceKey}`,'content-type':'application/json'}
 try{
  const queueResponse=await fetch(`${url}/rest/v1/orders?status=eq.pending&verification_status=in.(pending,failed)&select=id,amount,currency,payment_provider,provider_checkout_id,provider_payment_id,created_at&order=created_at.asc&limit=25`,{headers})
  if(!queueResponse.ok)throw new Error('Unable to load payment queue')
  const queue=await queueResponse.json(),results=[]
  for(const order of queue){
   try{
    await fetch(`${url}/rest/v1/orders?id=eq.${order.id}`,{method:'PATCH',headers,body:JSON.stringify({verification_status:'verifying',verification_error:null})})
    const verifyResponse=await fetch(verifierUrl,{method:'POST',headers:{authorization:`Bearer ${verifierToken}`,'content-type':'application/json'},body:JSON.stringify({network:String(order.payment_provider).replace('usdt_',''),asset:'USDT',transactionHash:order.provider_payment_id,expectedRecipient:order.provider_checkout_id,expectedAmount:Number(order.amount),minimumConfirmations:minimums[order.payment_provider]||20}),signal:AbortSignal.timeout(20_000)})
    const evidence=await verifyResponse.json().catch(()=>({verified:false,reason:'Invalid verification response'}))
    const confirmations=Number(evidence.confirmations||0),amount=Number(evidence.amount||0),recipient=String(evidence.recipient||'')
    const verified=verifyResponse.ok&&evidence.verified===true&&confirmations>=(minimums[order.payment_provider]||20)&&amount>=Number(order.amount)&&recipient.toLowerCase()===String(order.provider_checkout_id).toLowerCase()
    if(verified){
     const finish=await fetch(`${url}/rest/v1/rpc/internal_finalize_verified_usdt_order`,{method:'POST',headers,body:JSON.stringify({p_order_id:order.id,p_confirmations:confirmations,p_amount:amount,p_recipient:recipient,p_evidence:evidence})})
     if(!finish.ok)throw new Error((await finish.json().catch(()=>({}))).message||'Account creation failed')
     results.push({id:order.id,status:'verified'})
    }else{
     const age=Date.now()-new Date(order.created_at).getTime(),manual=age>24*60*60*1000
     await fetch(`${url}/rest/v1/rpc/internal_record_payment_verification_failure`,{method:'POST',headers,body:JSON.stringify({p_order_id:order.id,p_error:String(evidence.reason||'Transaction not yet confirmed'),p_manual:manual})})
     results.push({id:order.id,status:manual?'manual_review':'pending'})
    }
   }catch(error){await fetch(`${url}/rest/v1/rpc/internal_record_payment_verification_failure`,{method:'POST',headers,body:JSON.stringify({p_order_id:order.id,p_error:error instanceof Error?error.message:'Verification failed',p_manual:false})});results.push({id:order.id,status:'retry'})}
  }
  const result={ok:true,processed:results.length,results};await fetch(`${url}/rest/v1/rpc/internal_record_worker_heartbeat`,{method:'POST',headers,body:JSON.stringify({p_worker:'verify-usdt-payments',p_success:true,p_started_at:startedAt,p_result:result,p_error:null})});return json(result)
 }catch(error){const message=error instanceof Error?error.message:'Verification worker failed';if(url&&serviceKey)await fetch(`${url}/rest/v1/rpc/internal_record_worker_heartbeat`,{method:'POST',headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`,'content-type':'application/json'},body:JSON.stringify({p_worker:'verify-usdt-payments',p_success:false,p_started_at:startedAt,p_result:{},p_error:message})}).catch(()=>null);return json({error:message},503)}
})
