import {NextResponse} from 'next/server'
import {supabaseConfig} from '../../../../lib/supabase-rest'

export async function POST(request:Request){
 try{
  const {email}=await request.json()
  if(typeof email!=='string'||!email.includes('@'))return NextResponse.json({error:'Enter a valid email address.'},{status:400})
  const {url,key}=supabaseConfig(),origin=new URL(request.url).origin
  const response=await fetch(`${url}/auth/v1/recover?redirect_to=${encodeURIComponent(`${origin}/reset-password`)}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:email.trim().toLowerCase()}),cache:'no-store'})
  if(!response.ok){const result=await response.json().catch(()=>null);return NextResponse.json({error:result?.msg||'Unable to send the recovery email.'},{status:response.status})}
  return NextResponse.json({ok:true,message:'If an account exists, a secure recovery link has been sent.'})
 }catch{return NextResponse.json({error:'Password recovery is temporarily unavailable.'},{status:503})}
}
