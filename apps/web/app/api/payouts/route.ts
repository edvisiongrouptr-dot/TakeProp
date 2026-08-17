import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, postOwnData } from '../../../lib/supabase-rest'
export const dynamic='force-dynamic'
export async function POST(request:NextRequest){const auth=await getAuthenticatedUser();if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401});try{const body=await request.json();const result=await postOwnData<unknown>('rpc/request_payout',auth.accessToken,{p_account_id:body.accountId,p_amount:Number(body.amount),p_method:body.method,p_destination_ref:String(body.destination||'').trim()});return NextResponse.json(result)}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Payout request failed'},{status:400})}}
