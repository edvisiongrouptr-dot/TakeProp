import { redirect } from 'next/navigation'
import { getAuthenticatedUser, getOwnData } from '../../lib/supabase-rest'
import TerminalClient from './terminal-client'

type Account = { id:string; display_account_id:string|null; status:string }

export default async function TerminalPage(){
  const auth=await getAuthenticatedUser()
  if(!auth) redirect('/auth')
  const accounts=await getOwnData<Account[]>(`trading_accounts?select=id,display_account_id,status&user_id=eq.${auth.user.id}&order=created_at.desc&limit=1`,auth.accessToken)
  const account=accounts[0]
  if(!account) redirect('/dashboard')
  return <TerminalClient accountId={account.id} accountLabel={account.display_account_id||'TAKEPROP ACCOUNT'}/>
}
