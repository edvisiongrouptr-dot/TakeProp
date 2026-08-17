import {NextResponse} from 'next/server'
import {getAuthenticatedUser,supabaseConfig} from '../../../lib/supabase-rest'
export async function POST(request:Request){
 const auth=await getAuthenticatedUser();if(!auth)return NextResponse.json({error:'Sign in required.'},{status:401})
 try{const {url,key}=supabaseConfig(),response=await fetch(`${url}/functions/v1/kyc`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${auth.accessToken}`,Origin:new URL(request.url).origin},cache:'no-store'}),result=await response.json().catch(()=>({error:'Invalid KYC response'}));return NextResponse.json(result,{status:response.status})}catch{return NextResponse.json({error:'Identity verification is unavailable.'},{status:503})}
}
