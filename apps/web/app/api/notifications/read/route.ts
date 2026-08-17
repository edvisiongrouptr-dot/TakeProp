import { NextResponse } from 'next/server'
import { getAuthenticatedUser,postOwnData } from '../../../../lib/supabase-rest'
export async function POST(){const auth=await getAuthenticatedUser();if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401});try{const count=await postOwnData<number>('rpc/mark_notifications_read',auth.accessToken,{p_notification_id:null});return NextResponse.json({ok:true,count})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to update notifications'},{status:400})}}
