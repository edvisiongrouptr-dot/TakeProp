import { NextRequest, NextResponse } from 'next/server'

const accessName='takeprop-access-token',refreshName='takeprop-refresh-token'
const windows=new Map<string,{count:number;resetAt:number}>()

function requestKey(request:NextRequest){
 const forwarded=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
 return `${forwarded||request.headers.get('x-real-ip')||'unknown'}:${request.nextUrl.pathname}`
}

function requestLimit(pathname:string){
 if(pathname==='/api/auth/recover'||pathname==='/api/auth/register'||pathname==='/api/auth/reset')return 5
 if(pathname==='/api/auth/login'||pathname.startsWith('/api/kyc'))return 10
 if(pathname.startsWith('/api/admin/'))return 30
 return 60
}

function enforceRequestSecurity(request:NextRequest){
 if(!request.nextUrl.pathname.startsWith('/api/'))return null
 const mutation=!['GET','HEAD','OPTIONS'].includes(request.method)
 if(mutation&&!request.nextUrl.pathname.startsWith('/api/cron/')){
  const origin=request.headers.get('origin')
  if(origin&&origin!==request.nextUrl.origin)return NextResponse.json({error:'Invalid request origin.'},{status:403})
 }
 const now=Date.now(),key=requestKey(request),current=windows.get(key),limit=requestLimit(request.nextUrl.pathname)
 if(!current||current.resetAt<=now)windows.set(key,{count:1,resetAt:now+60_000})
 else{
  current.count+=1
  if(current.count>limit)return NextResponse.json({error:'Too many requests. Please try again shortly.'},{status:429,headers:{'Retry-After':String(Math.ceil((current.resetAt-now)/1000))}})
 }
 return null
}

export async function proxy(request:NextRequest){
 const securityResponse=enforceRequestSecurity(request)
 if(securityResponse)return securityResponse
 if(request.nextUrl.pathname.startsWith('/api/'))return NextResponse.next()
 const access=request.cookies.get(accessName)?.value,refresh=request.cookies.get(refreshName)?.value
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'')
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
 if(!url||!key)return NextResponse.redirect(new URL('/auth?error=config',request.url))
 if(access){
  const check=await fetch(`${url}/auth/v1/user`,{headers:{apikey:key,Authorization:`Bearer ${access}`},cache:'no-store'})
  if(check.ok)return NextResponse.next()
 }
 if(refresh){
  const renewed=await fetch(`${url}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:refresh}),cache:'no-store'})
  if(renewed.ok){
   const tokens=await renewed.json(),response=NextResponse.redirect(request.nextUrl),secure=process.env.NODE_ENV==='production'
   response.cookies.set(accessName,tokens.access_token,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:tokens.expires_in||3600})
   response.cookies.set(refreshName,tokens.refresh_token,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:60*60*24*30})
   return response
  }
 }
 const response=NextResponse.redirect(new URL('/auth',request.url));response.cookies.delete(accessName);response.cookies.delete(refreshName);return response
}

export const config={matcher:['/dashboard/:path*','/terminal/:path*','/payouts/:path*','/kyc/:path*','/admin/:path*','/support/:path*','/notifications/:path*','/api/:path*']}
