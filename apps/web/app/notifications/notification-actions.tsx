'use client'
import { useRouter } from 'next/navigation'
export default function NotificationActions(){const router=useRouter();return <button onClick={async()=>{await fetch('/api/notifications/read',{method:'POST'});router.refresh()}}>Mark all as read</button>}
