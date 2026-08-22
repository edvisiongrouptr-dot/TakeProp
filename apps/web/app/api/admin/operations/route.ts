import { NextRequest,NextResponse } from 'next/server'
import { getAuthenticatedUser,getOwnData,postOwnData } from '../../../../lib/supabase-rest'

type Role={role:string}

export async function POST(request:NextRequest){
 const auth=await getAuthenticatedUser();if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401})
 try{
  const body=await request.json()
  const roles=await getOwnData<Role[]>(`user_roles?select=role&user_id=eq.${auth.user.id}`,auth.accessToken)
  const roleSet=new Set(roles.map(item=>item.role))
  let rpc:string,payload:Record<string,unknown>
  if(body.action==='set_kyc'){
   if(!roleSet.has('admin')&&!roleSet.has('compliance'))return NextResponse.json({error:'Forbidden'},{status:403})
   if(typeof body.userId!=='string'||typeof body.status!=='string'||typeof body.reason!=='string'||body.reason.trim().length<8)return NextResponse.json({error:'Valid KYC decision details are required'},{status:400})
   rpc='admin_set_kyc_status';payload={p_user_id:body.userId,p_status:body.status,p_reason:body.reason}
  }else if(body.action==='set_account_status'){
   if(!roleSet.has('admin'))return NextResponse.json({error:'Forbidden'},{status:403})
   rpc='admin_set_trading_account_status';payload={p_account_id:body.accountId,p_status:body.status,p_reason:body.reason}
  }else if(body.action==='resolve_risk'){
   if(!roleSet.has('admin'))return NextResponse.json({error:'Forbidden'},{status:403})
   rpc='admin_resolve_risk_event';payload={p_event_id:body.eventId,p_resolution:body.reason}
  }else return NextResponse.json({error:'Unsupported operation'},{status:400})
  const result=await postOwnData(`rpc/${rpc}`,auth.accessToken,payload)
  return NextResponse.json({ok:true,result})
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Operation failed'},{status:400})}
}
