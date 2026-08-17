import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser,getOwnData } from '../../lib/supabase-rest'
import NotificationActions from './notification-actions'
import styles from './notifications.module.css'
type Notification={id:string;notification_type:string;title:string;body:string;action_url:string|null;read_at:string|null;created_at:string}
export const dynamic='force-dynamic'
export default async function Notifications(){const auth=await getAuthenticatedUser();if(!auth)redirect('/auth?next=/notifications');const items=await getOwnData<Notification[]>(`notifications?select=id,notification_type,title,body,action_url,read_at,created_at&user_id=eq.${auth.user.id}&order=created_at.desc&limit=100`,auth.accessToken);return <main className={styles.page}><header><div><small>TAKEPROP NOTIFICATIONS</small><h1>Account activity</h1></div><div><NotificationActions/><Link href="/dashboard">Dashboard →</Link></div></header><section>{items.length?items.map(n=><article key={n.id} className={n.read_at?styles.read:styles.unread}><div><small>{n.notification_type.replaceAll('_',' ').toUpperCase()}</small><h2>{n.title}</h2><p>{n.body}</p><time>{new Date(n.created_at).toLocaleString('tr-TR')}</time></div>{n.action_url&&<Link href={n.action_url}>Open →</Link>}</article>):<p>No notifications yet.</p>}</section></main>}
