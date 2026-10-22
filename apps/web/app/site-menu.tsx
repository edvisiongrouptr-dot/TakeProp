'use client'

import Link from 'next/link'
import {useRef} from 'react'
import styles from './site-menu.module.css'

export default function SiteMenu(){
 const menuRef=useRef<HTMLDetailsElement>(null)
 const closeMenu=()=>menuRef.current?.removeAttribute('open')
 return <details ref={menuRef} className={styles.menu}>
  <summary aria-label="Open TakeProp menu"><span/><span/><span/></summary>
  <nav onClick={closeMenu}>
   <header><b>TAKEPROP</b><small>QUICK MENU</small></header>
   <section><small>TRADING</small><Link href="/dashboard">Overview</Link><Link href="/terminal">Trading terminal</Link></section>
   <section><small>FINANCE</small><Link href="/#plans">Challenge plans</Link><Link href="/payouts">Payouts</Link></section>
   <section><small>ACCOUNT</small><Link href="/kyc">Identity verification</Link><Link href="/notifications">Notifications</Link></section>
   <section><small>HELP</small><Link href="/support">Support center</Link><Link href="/terms">Rules &amp; legal</Link></section>
   <section><small>OPERATIONS</small><Link href="/admin">Profile</Link></section>
  </nav>
 </details>
}
