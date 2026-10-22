'use client'

import Link from 'next/link'
import {useEffect,useState} from 'react'
import {usePathname} from 'next/navigation'
import styles from './site-menu.module.css'

export default function SiteMenu(){
 const [open,setOpen]=useState(false)
 const pathname=usePathname()

 useEffect(()=>setOpen(false),[pathname])
 useEffect(()=>{
  if(!open)return
  const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)}
  window.addEventListener('keydown',close)
  return()=>window.removeEventListener('keydown',close)
 },[open])

 return <div className={styles.menu}>
  <button className={styles.trigger} type="button" aria-label={open?'Close TakeProp menu':'Open TakeProp menu'} aria-expanded={open} onClick={()=>setOpen(value=>!value)}>
   <span/><span/><span/>
  </button>
  {open&&<button className={styles.backdrop} type="button" aria-label="Close menu" onClick={()=>setOpen(false)}/>}
  <aside className={`${styles.drawer} ${open?styles.open:''}`} aria-hidden={!open}>
   <header><div><b>TAKEPROP</b><small>QUICK MENU</small></div><button type="button" aria-label="Close menu" onClick={()=>setOpen(false)}>×</button></header>
   <nav onClick={()=>setOpen(false)}>
    <section><small>TRADING</small><Link href="/dashboard">Overview</Link><Link href="/terminal">Trading terminal</Link></section>
    <section><small>FINANCE</small><Link href="/#plans">Challenge plans</Link><Link href="/payouts">Payouts</Link></section>
    <section><small>ACCOUNT</small><Link href="/kyc">Identity verification</Link><Link href="/notifications">Notifications</Link></section>
    <section><small>HELP</small><Link href="/support">Support center</Link><Link href="/terms">Rules &amp; legal</Link></section>
    <section><small>OPERATIONS</small><Link href="/admin">Profile</Link></section>
   </nav>
  </aside>
 </div>
}
