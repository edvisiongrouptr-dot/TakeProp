import { NextRequest,NextResponse } from 'next/server'
import { getAuthenticatedUser,postOwnData } from '../../../../lib/supabase-rest'

export async function POST(request:NextRequest){
 const auth=await getAuthenticatedUser();if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401})
 try{
  const body=await request.json()
  let rpc:string,payload:Record<string,unknown>
  if(body.action==='set_kyc'){
   rpc='admin_set_kyc_status';payload={p_user_id:body.userId,p_status:body.status,p_reason:body.reason}
  }else if(body.action==='set_account_status'){
   rpc='admin_set_trading_account_status';payload={p_account_id:body.accountId,p_status:body.status,p_reason:body.reason}
  }else if(body.action==='resolve_risk'){
   rpc='admin_resolve_risk_event';payload={p_event_id:body.eventId,p_resolution:body.reason}
  }else return NextResponse.json({error:'Unsupported operation'},{status:400})
  const result=await postOwnData(`rpc/${rpc}`,auth.accessToken,payload)
  return NextResponse.json({ok:true,result})
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Operation failed'},{status:400})}
}
