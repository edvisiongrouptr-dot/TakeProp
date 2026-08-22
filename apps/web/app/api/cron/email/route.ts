import { NextRequest,NextResponse } from 'next/server'
import {bearerMatches} from '../../../../lib/server-secret'

export const dynamic='force-dynamic'

export async function GET(request:NextRequest){
 const cronSecret=process.env.CRON_SECRET
 if(!bearerMatches(request.headers.get('authorization'),cronSecret))return NextResponse.json({error:'Unauthorized'},{status:401})
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'')
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
 const workerSecret=process.env.EMAIL_WORKER_SECRET
 if(!url||!key||!workerSecret)return NextResponse.json({error:'Email worker is not configured.'},{status:503})
 try{
  const response=await fetch(`${url}/functions/v1/send-email-outbox`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${workerSecret}`,'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:AbortSignal.timeout(25_000)})
  const result=await response.json().catch(()=>({error:'Invalid worker response'}))
  return NextResponse.json(result,{status:response.status})
 }catch{return NextResponse.json({error:'Email worker unavailable.'},{status:503})}
}
