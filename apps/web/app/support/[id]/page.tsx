import Link from 'next/link'
import { notFound,redirect } from 'next/navigation'
import { getAuthenticatedUser,getOwnData } from '../../../lib/supabase-rest'
import ReplyForm from './reply-form'
import styles from '../support.module.css'
type Ticket={id:string;subject:string;category:string;priority:string;status:string;user_id:string;created_at:string}
type Message={id:string;author_user_id:string;body:string;is_staff:boolean;created_at:string}
export const dynamic='force-dynamic'
export default async function TicketPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const auth=await getAuthenticatedUser();if(!auth)redirect(`/auth?next=/support/${id}`);const tickets=await getOwnData<Ticket[]>(`support_tickets?select=id,subject,category,priority,status,user_id,created_at&id=eq.${id}&limit=1`,auth.accessToken),ticket=tickets[0];if(!ticket)notFound();const messages=await getOwnData<Message[]>(`support_messages?select=id,author_user_id,body,is_staff,created_at&ticket_id=eq.${ticket.id}&order=created_at.asc`,auth.accessToken);return <main className={styles.page}><header><div><small>TICKET {ticket.id.slice(0,8).toUpperCase()}</small><h1>{ticket.subject}</h1><p>{ticket.category.toUpperCase()} · {ticket.priority.toUpperCase()} · {ticket.status.replace('_',' ').toUpperCase()}</p></div><Link href="/support">All tickets →</Link></header><section className={styles.thread}>{messages.map(m=><article key={m.id} className={m.is_staff?styles.staff:''}><b>{m.is_staff?'TakeProp support':'You'}</b><p>{m.body}</p><time>{new Date(m.created_at).toLocaleString('tr-TR')}</time></article>)}</section>{ticket.status!=='closed'&&<section className={styles.reply}><h2>Reply</h2><ReplyForm id={ticket.id}/></section>}</main>}
