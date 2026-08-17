import { NextRequest, NextResponse } from 'next/server'

const accessName='takeprop-access-token',refreshName='takeprop-refresh-token'

export async function middleware(request:NextRequest){
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

export const config={matcher:['/dashboard/:path*','/terminal/:path*','/payouts/:path*','/admin/:path*']}
