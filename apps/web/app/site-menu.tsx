import Link from 'next/link'
import styles from './site-menu.module.css'

export default function SiteMenu(){
 return <details className={styles.menu}>
  <summary aria-label="Open TakeProp menu"><span/><span/><span/></summary>
  <nav>
   <header><b>TAKEPROP</b><small>QUICK MENU</small></header>
   <section><small>TRADING</small><Link href="/dashboard">Overview</Link><Link href="/terminal">Trading terminal</Link></section>
   <section><small>FINANCE</small><Link href="/#plans">Challenge plans</Link><Link href="/payouts">Payouts</Link></section>
   <section><small>ACCOUNT</small><Link href="/kyc">Identity verification</Link><Link href="/notifications">Notifications</Link></section>
   <section><small>HELP</small><Link href="/support">Support center</Link><Link href="/terms">Rules &amp; legal</Link></section>
   <section><small>OPERATIONS</small><Link href="/admin">Admin center</Link></section>
  </nav>
 </details>
}
