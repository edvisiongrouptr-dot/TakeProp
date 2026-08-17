import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser, getOwnData } from '../../lib/supabase-rest'
import PaymentActions from './payment-actions'
import PayoutActions from './payout-actions'
import styles from './admin.module.css'
type Role={role:string}
type Profile={id:string;full_name:string|null}
type Order={id:string;user_id:string;amount:number;currency:string;status:string;payment_provider:string|null;provider_payment_id:string|null;created_at:string;challenge_plans:{name:string;account_size:number}|null}
type Payout={id:string;user_id:string;amount:number;currency:string;status:string;method:string;destination_ref:string|null;provider_payout_id:string|null;requested_at:string}
export const dynamic='force-dynamic'
export default async function AdminPage(){
 const auth=await getAuthenticatedUser(); if(!auth) redirect('/auth?next=/admin')
 const roles=await getOwnData<Role[]>(`user_roles?select=role&user_id=eq.${auth.user.id}`,auth.accessToken)
 if(!roles.some(r=>r.role==='admin'||r.role==='finance')) redirect('/dashboard')
 const [orders,profiles,payouts]=await Promise.all([
  getOwnData<Order[]>('orders?select=id,user_id,amount,currency,status,payment_provider,provider_payment_id,created_at,challenge_plans(name,account_size)&payment_provider=like.usdt_*&order=created_at.desc&limit=100',auth.accessToken),
  getOwnData<Profile[]>('profiles?select=id,full_name',auth.accessToken),
  getOwnData<Payout[]>('payout_requests?select=id,user_id,amount,currency,status,method,destination_ref,provider_payout_id,requested_at&order=requested_at.desc&limit=100',auth.accessToken)
 ])
 const names=new Map(profiles.map(p=>[p.id,p.full_name||p.id.slice(0,8)])),pending=orders.filter(o=>o.status==='pending'),reviewed=orders.filter(o=>o.status!=='pending')
 return <main className={styles.page}><header className={styles.header}><div><small>TAKEPROP OPERATIONS</small><h1>Payment review</h1><p>Verify the transaction on the correct blockchain before approving it.</p></div><Link href="/dashboard">Trader dashboard →</Link></header>
 <section><div className={styles.title}><h2>Pending payments</h2><b>{pending.length}</b></div>{pending.length===0?<div className={styles.empty}>No payments are waiting for review.</div>:<div className={styles.grid}>{pending.map(o=><Card key={o.id} order={o} name={names.get(o.user_id)||o.user_id.slice(0,8)} pending/>)}</div>}</section>
 <section><div className={styles.title}><h2>Review history</h2><b>{reviewed.length}</b></div><div className={styles.grid}>{reviewed.map(o=><Card key={o.id} order={o} name={names.get(o.user_id)||o.user_id.slice(0,8)}/>)}</div></section>
 <section><div className={styles.title}><h2>Payout operations</h2><b>{payouts.length}</b></div><div className={styles.grid}>{payouts.map(p=><article key={p.id} className={styles.card}><div className={styles.head}><span>{p.status.toUpperCase()}</span><time>{new Date(p.requested_at).toLocaleString('tr-TR')}</time></div><h3>{Number(p.amount).toFixed(2)} {p.currency}</h3><dl><div><dt>Trader</dt><dd>{names.get(p.user_id)||p.user_id.slice(0,8)}</dd></div><div><dt>Network</dt><dd>{p.method}</dd></div></dl><label>Destination</label><code>{p.destination_ref||'—'}</code>{p.provider_payout_id&&<><label>Payout transaction</label><code>{p.provider_payout_id}</code></>}<PayoutActions id={p.id} status={p.status}/></article>)}</div></section></main>
}
function Card({order,name,pending=false}:{order:Order;name:string;pending?:boolean}){const network=(order.payment_provider||'').replace('usdt_','').toUpperCase();return <article className={styles.card}><div className={styles.head}><span>{order.status.toUpperCase()}</span><time>{new Date(order.created_at).toLocaleString('tr-TR')}</time></div><h3>{order.challenge_plans?.name||'Challenge plan'}</h3><strong>{Number(order.amount).toFixed(2)} {order.currency}</strong><dl><div><dt>Trader</dt><dd>{name}</dd></div><div><dt>Account</dt><dd>USD {Number(order.challenge_plans?.account_size||0).toLocaleString('en-US')}</dd></div><div><dt>Network</dt><dd>{network}</dd></div><div><dt>Order</dt><dd>{order.id.slice(0,8).toUpperCase()}</dd></div></dl><label>Transaction hash</label><code>{order.provider_payment_id||'—'}</code>{order.provider_payment_id&&<a target="_blank" rel="noreferrer" href={explorer(network,order.provider_payment_id)}>Open blockchain explorer ↗</a>}{pending&&<PaymentActions orderId={order.id}/>}</article>}
function explorer(n:string,t:string){if(n==='BEP20')return 'https://bscscan.com/tx/'+t;if(n==='ERC20')return 'https://etherscan.io/tx/'+t;if(n==='TRC20')return 'https://tronscan.org/#/transaction/'+t;return 'https://tonviewer.com/transaction/'+t}
