import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, supabaseConfig } from '../../../lib/supabase-rest'

export const dynamic='force-dynamic'

export async function POST(request:NextRequest){
  const auth=await getAuthenticatedUser()
  if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401})
  try{
    const body=await request.json()
    const {url,key}=supabaseConfig()
    const response=await fetch(`${url}/functions/v1/sim-trading`,{
      method:'POST',headers:{apikey:key,Authorization:`Bearer ${auth.accessToken}`,'Content-Type':'application/json'},
      body:JSON.stringify(body),cache:'no-store'
    })
    const result=await response.json().catch(()=>({error:'Trading service returned an invalid response'}))
    return NextResponse.json(result,{status:response.status})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Trading request failed'},{status:500})}
}
