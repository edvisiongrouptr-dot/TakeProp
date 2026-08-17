const symbols=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT'] as const
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})
function secret(name:string,fallback:string){const direct=Deno.env.get(name);if(direct)return direct;const raw=Deno.env.get(fallback)||'';try{const parsed=JSON.parse(raw);return String(parsed.default||Object.values(parsed)[0]||'')}catch{return raw}}
async function fetchJson(url:string){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4500);try{const response=await fetch(url,{signal:controller.signal,headers:{'user-agent':'TakeProp-Order-Worker/1.0'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);return await response.json()}finally{clearTimeout(timer)}}
async function prices(){
 const sources=await Promise.allSettled([
  fetchJson('https://min-api.cryptocompare.com/data/pricemulti?fsyms=BTC,ETH,SOL,BNB&tsyms=USDT').then(x=>({BTCUSDT:+x?.BTC?.USDT,ETHUSDT:+x?.ETH?.USDT,SOLUSDT:+x?.SOL?.USDT,BNBUSDT:+x?.BNB?.USDT})),
  fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin,tether&vs_currencies=usd').then(x=>{const peg=+x?.tether?.usd||1;return{BTCUSDT:+x?.bitcoin?.usd/peg,ETHUSDT:+x?.ethereum?.usd/peg,SOLUSDT:+x?.solana?.usd/peg,BNBUSDT:+x?.binancecoin?.usd/peg}})
 ])
 const valid=sources.flatMap(x=>x.status==='fulfilled'?[x.value]:[]);if(!valid.length)throw new Error('Market data unavailable')
 const marks:Record<string,number>={};for(const symbol of symbols){const values=valid.map(x=>+x[symbol]).filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>a-b);if(!values.length)throw new Error(`Missing ${symbol}`);const mark=values.length>1?(values[0]+values[1])/2:values[0];if(values.length>1&&(values[1]-values[0])/mark>.015)throw new Error(`Divergent ${symbol}`);marks[symbol]=mark}return marks
}
Deno.serve(async request=>{
 const startedAt=new Date().toISOString()
 if(request.method!=='POST')return json({error:'Method not allowed'},405)
 const expected=Deno.env.get('ORDER_WORKER_SECRET')||''
 if(!expected||request.headers.get('authorization')!==`Bearer ${expected}`)return json({error:'Unauthorized'},401)
 const url=Deno.env.get('SUPABASE_URL')||'',serviceKey=secret('SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEYS')
 if(!url||!serviceKey)return json({error:'Worker is not configured'},503)
 try{
  const marks=await prices()
  const accountsResponse=await fetch(`${url}/rest/v1/trading_accounts?status=eq.active&select=id,user_id&limit=1000`,{headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`}})
  if(!accountsResponse.ok)throw new Error('Unable to load active accounts')
  const accounts=await accountsResponse.json(),failures=[] as string[]
  for(const account of accounts){
   const response=await fetch(`${url}/rest/v1/rpc/internal_advanced_snapshot`,{method:'POST',headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`,'content-type':'application/json'},body:JSON.stringify({p_user_id:account.user_id,p_account_id:account.id,p_marks:marks})})
   if(response.ok){await fetch(`${url}/rest/v1/rpc/internal_finalize_sim_account`,{method:'POST',headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`,'content-type':'application/json'},body:JSON.stringify({p_user_id:account.user_id,p_account_id:account.id,p_marks:marks})})}else failures.push(account.id)
  }
  const result={ok:failures.length===0,processed:accounts.length,failed:failures.length,serverTime:new Date().toISOString()}
  await fetch(`${url}/rest/v1/rpc/internal_record_worker_heartbeat`,{method:'POST',headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`,'content-type':'application/json'},body:JSON.stringify({p_worker:'process-active-orders',p_success:result.ok,p_started_at:startedAt,p_result:result,p_error:failures.length?'One or more accounts failed':null})})
  return json(result,failures.length?207:200)
 }catch(error){const message=error instanceof Error?error.message:'Order processing failed';if(url&&serviceKey)await fetch(`${url}/rest/v1/rpc/internal_record_worker_heartbeat`,{method:'POST',headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`,'content-type':'application/json'},body:JSON.stringify({p_worker:'process-active-orders',p_success:false,p_started_at:startedAt,p_result:{},p_error:message})}).catch(()=>null);return json({error:message},503)}
})
