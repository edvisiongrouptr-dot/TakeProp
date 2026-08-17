import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser,getOwnData } from '../../lib/supabase-rest'
import SupportForm from './support-form'
import styles from './support.module.css'
type Ticket={id:string;subject:string;category:string;priority:string;status:string;created_at:string;updated_at:string}
export const dynamic='force-dynamic'
export default async function Support(){const auth=await getAuthenticatedUser();if(!auth)redirect('/auth?next=/support');const tickets=await getOwnData<Ticket[]>(`support_tickets?select=id,subject,category,priority,status,created_at,updated_at&user_id=eq.${auth.user.id}&order=updated_at.desc&limit=50`,auth.accessToken);return <main className={styles.page}><header><div><small>TAKEPROP SUPPORT</small><h1>Support center</h1><p>Create a traceable request for account, payment, trading, risk, payout or identity assistance. Never share a password or recovery code.</p></div><Link href="/dashboard">Dashboard →</Link></header><div className={styles.layout}><section><h2>New request</h2><SupportForm/></section><section><h2>Your tickets</h2>{tickets.length?tickets.map(t=><Link href={`/support/${t.id}`} key={t.id}><article><b>{t.subject}</b><span>{t.category.toUpperCase()} · {t.priority.toUpperCase()}</span><strong>{t.status.replace('_',' ').toUpperCase()}</strong><small>{t.id.slice(0,8).toUpperCase()} · {new Date(t.updated_at).toLocaleString('tr-TR')}</small></article></Link>):<p>No support requests yet.</p>}</section></div></main>}
