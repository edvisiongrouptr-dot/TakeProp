import { NextRequest,NextResponse } from 'next/server'
export const dynamic='force-dynamic'
export async function GET(request:NextRequest){
 const deep=request.nextUrl.searchParams.get('deep')==='1'
 if(!deep)return NextResponse.json({ok:true,service:'takeprop-web',time:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})
 if(!process.env.HEALTHCHECK_SECRET||request.headers.get('authorization')!==`Bearer ${process.env.HEALTHCHECK_SECRET}`)return NextResponse.json({error:'Unauthorized'},{status:401})
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'')
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
 if(!url||!key)return NextResponse.json({ok:false,service:'takeprop-web',database:'not-configured'},{status:503})
 try{
  const started=Date.now(),response=await fetch(`${url}/rest/v1/`,{headers:{apikey:key},cache:'no-store',signal:AbortSignal.timeout(5000)})
  return NextResponse.json({ok:response.ok,service:'takeprop-web',database:response.ok?'reachable':'unavailable',latencyMs:Date.now()-started},{status:response.ok?200:503,headers:{'Cache-Control':'no-store'}})
 }catch{return NextResponse.json({ok:false,service:'takeprop-web',database:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
