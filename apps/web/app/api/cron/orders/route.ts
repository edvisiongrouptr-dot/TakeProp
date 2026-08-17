import {NextRequest,NextResponse} from 'next/server'
export const dynamic='force-dynamic'
export async function GET(request:NextRequest){
 if(!process.env.CRON_SECRET||request.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:'Unauthorized'},{status:401})
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'')
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
 const secret=process.env.ORDER_WORKER_SECRET
 if(!url||!key||!secret)return NextResponse.json({error:'Order worker is not configured.'},{status:503})
 try{
  const response=await fetch(`${url}/functions/v1/process-active-orders`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${secret}`},cache:'no-store',signal:AbortSignal.timeout(50_000)})
  const result=await response.json().catch(()=>({error:'Invalid worker response'}))
  return NextResponse.json(result,{status:response.status})
 }catch{return NextResponse.json({error:'Order worker unavailable.'},{status:503})}
}
