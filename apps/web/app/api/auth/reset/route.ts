import {NextResponse} from 'next/server'
import {supabaseConfig} from '../../../../lib/supabase-rest'

export async function POST(request:Request){
 try{
  const {accessToken,password}=await request.json()
  if(typeof accessToken!=='string'||accessToken.length<20)return NextResponse.json({error:'This recovery link is invalid or expired.'},{status:400})
  if(typeof password!=='string'||password.length<8)return NextResponse.json({error:'Password must contain at least 8 characters.'},{status:400})
  const {url,key}=supabaseConfig()
  const response=await fetch(`${url}/auth/v1/user`,{method:'PUT',headers:{apikey:key,Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({password}),cache:'no-store'})
  if(!response.ok){const result=await response.json().catch(()=>null);return NextResponse.json({error:result?.msg||'Unable to update the password.'},{status:response.status})}
  return NextResponse.json({ok:true})
 }catch{return NextResponse.json({error:'Password reset is temporarily unavailable.'},{status:503})}
}
