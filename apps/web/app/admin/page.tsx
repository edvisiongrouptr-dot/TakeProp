import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser,getOwnData } from '../../lib/supabase-rest'
import PaymentActions from './payment-actions'
import PayoutActions from './payout-actions'
import AccountActions from './account-actions'
import styles from './admin.module.css'
type Role={role:string}
type Profile={id:string;full_name:string|null;kyc_status:string;created_at:string}
type Order={id:string;user_id:string;amount:number;currency:string;status:string;payment_provider:string|null;provider_payment_id:string|null;created_at:string;challenge_plans:{name:string;account_size:number}|null}
type Payout={id:string;user_id:string;amount:number;currency:string;status:string;method:string;destination_ref:string|null;provider_payout_id:string|null;requested_at:string}
type Account={id:string;user_id:string;display_account_id:string;phase:string;status:string;balance:number;equity:number;evaluation_step:number;evaluation_steps:number;created_at:string}
type Risk={id:string;user_id:string;account_id:string;event_type:string;severity:string;status:string;measured_value:number;limit_value:number;created_at:string}
type Audit={id:string;actor_user_id:string;action:string;entity_type:string;reason:string|null;created_at:string}
export const dynamic='force-dynamic'

export default async function AdminPage(){
 const auth=await getAuthenticatedUser();if(!auth)redirect('/auth?next=/admin')
 const roles=await getOwnData<Role[]>(`user_roles?select=role&user_id=eq.${auth.user.id}`,auth.accessToken)
 if(!roles.some(r=>r.role==='admin'||r.role==='finance'))redirect('/dashboard')
 const isAdmin=roles.some(r=>r.role==='admin')
 const [orders,profiles,payouts,accounts,risks,audit]=await Promise.all([
  getOwnData<Order[]>('orders?select=id,user_id,amount,currency,status,payment_provider,provider_payment_id,created_at,challenge_plans(name,account_size)&payment_provider=like.usdt_*&order=created_at.desc&limit=100',auth.accessToken),
  getOwnData<Profile[]>('profiles?select=id,full_name,kyc_status,created_at&order=created_at.desc&limit=200',auth.accessToken),
  getOwnData<Payout[]>('payout_requests?select=id,user_id,amount,currency,status,method,destination_ref,provider_payout_id,requested_at&order=requested_at.desc&limit=100',auth.accessToken),
  isAdmin?getOwnData<Account[]>('trading_accounts?select=id,user_id,display_account_id,phase,status,balance,equity,evaluation_step,evaluation_steps,created_at&order=created_at.desc&limit=200',auth.accessToken):Promise.resolve([]),
  isAdmin?getOwnData<Risk[]>('risk_events?select=id,user_id,account_id,event_type,severity,status,measured_value,limit_value,created_at&order=created_at.desc&limit=100',auth.accessToken):Promise.resolve([]),
  isAdmin?getOwnData<Audit[]>('admin_audit_log?select=id,actor_user_id,action,entity_type,reason,created_at&order=created_at.desc&limit=100',auth.accessToken):Promise.resolve([])
 ])
 const names=new Map(profiles.map(p=>[p.id,p.full_name||p.id.slice(0,8)])),pending=orders.filter(o=>o.status==='pending'),reviewed=orders.filter(o=>o.status!=='pending')
 return <main className={styles.page}>
  <header className={styles.header}><div><small>TAKEPROP OPERATIONS</small><h1>Operations center</h1><p>Payments, payouts, traders, risk and audit controls.</p></div><Link href="/dashboard">Trader dashboard →</Link></header>
  <section><Title label="Pending payments" count={pending.length}/>{pending.length===0?<div className={styles.empty}>No payments are waiting for review.</div>:<div className={styles.grid}>{pending.map(o=><PaymentCard key={o.id} order={o} name={names.get(o.user_id)||o.user_id.slice(0,8)} pending/>)}</div>}</section>
  <section><Title label="Review history" count={reviewed.length}/><div className={styles.grid}>{reviewed.map(o=><PaymentCard key={o.id} order={o} name={names.get(o.user_id)||o.user_id.slice(0,8)}/>)}</div></section>
  <section><Title label="Payout operations" count={payouts.length}/><div className={styles.grid}>{payouts.map(p=><article key={p.id} className={styles.card}><Head status={p.status} date={p.requested_at}/><h3>{Number(p.amount).toFixed(2)} {p.currency}</h3><dl><Info label="Trader" value={names.get(p.user_id)||p.user_id.slice(0,8)}/><Info label="Network" value={p.method}/></dl><label>Destination</label><code>{p.destination_ref||'—'}</code>{p.provider_payout_id&&<><label>Payout transaction</label><code>{p.provider_payout_id}</code></>}<PayoutActions id={p.id} status={p.status}/></article>)}</div></section>
  {isAdmin&&<><section><Title label="Trader identity review" count={profiles.length}/><div className={styles.table}>{profiles.map(p=><article key={p.id}><div><b>{p.full_name||'Unnamed trader'}</b><small>{p.id}</small></div><strong>{p.kyc_status.replace('_',' ').toUpperCase()}</strong><time>{new Date(p.created_at).toLocaleDateString('tr-TR')}</time><AccountActions kind="kyc" id={p.id} current={p.kyc_status}/></article>)}</div></section>
  <section><Title label="Trading accounts" count={accounts.length}/><div className={styles.table}>{accounts.map(a=><article key={a.id}><div><b>{a.display_account_id}</b><small>{names.get(a.user_id)||a.user_id.slice(0,8)} · {a.phase} · step {a.evaluation_step}/{a.evaluation_steps}</small></div><strong>{a.status.toUpperCase()}</strong><span>{Number(a.equity).toFixed(2)} / {Number(a.balance).toFixed(2)}</span><AccountActions kind="account" id={a.id} current={a.status}/></article>)}</div></section>
  <section><Title label="Risk events" count={risks.length}/><div className={styles.table}>{risks.map(r=><article key={r.id}><div><b>{r.event_type.replaceAll('_',' ')}</b><small>{names.get(r.user_id)||r.user_id.slice(0,8)} · {r.severity}</small></div><strong>{r.status.toUpperCase()}</strong><span>{Number(r.measured_value).toFixed(2)} / {Number(r.limit_value).toFixed(2)}</span>{r.status!=='resolved'?<AccountActions kind="risk" id={r.id}/>:<i>Resolved</i>}</article>)}</div></section>
  <section><Title label="Audit log" count={audit.length}/><div className={styles.audit}>{audit.map(a=><article key={a.id}><b>{a.action.replaceAll('_',' ')}</b><span>{a.entity_type}</span><p>{a.reason||'No note'}</p><time>{new Date(a.created_at).toLocaleString('tr-TR')}</time></article>)}</div></section></>}
 </main>
}
function Title({label,count}:{label:string;count:number}){return <div className={styles.title}><h2>{label}</h2><b>{count}</b></div>}
function Head({status,date}:{status:string;date:string}){return <div className={styles.head}><span>{status.toUpperCase()}</span><time>{new Date(date).toLocaleString('tr-TR')}</time></div>}
function Info({label,value}:{label:string;value:string}){return <div><dt>{label}</dt><dd>{value}</dd></div>}
function PaymentCard({order,name,pending=false}:{order:Order;name:string;pending?:boolean}){const network=(order.payment_provider||'').replace('usdt_','').toUpperCase();return <article className={styles.card}><Head status={order.status} date={order.created_at}/><h3>{order.challenge_plans?.name||'Challenge plan'}</h3><strong>{Number(order.amount).toFixed(2)} {order.currency}</strong><dl><Info label="Trader" value={name}/><Info label="Account" value={`USD ${Number(order.challenge_plans?.account_size||0).toLocaleString('en-US')}`}/><Info label="Network" value={network}/><Info label="Order" value={order.id.slice(0,8).toUpperCase()}/></dl><label>Transaction hash</label><code>{order.provider_payment_id||'—'}</code>{order.provider_payment_id&&<a target="_blank" rel="noreferrer" href={explorer(network,order.provider_payment_id)}>Open blockchain explorer ↗</a>}{pending&&<PaymentActions orderId={order.id}/>}</article>}
function explorer(n:string,t:string){if(n==='BEP20')return'https://bscscan.com/tx/'+t;if(n==='ERC20')return'https://etherscan.io/tx/'+t;if(n==='TRC20')return'https://tronscan.org/#/transaction/'+t;return'https://tonviewer.com/transaction/'+t}
