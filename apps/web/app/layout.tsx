import './styles.css'
import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'TakeProp — Trade Crypto. Prove Your Edge. Get Funded.', description: 'Transparent simulated crypto trading evaluations with static risk rules and 90% rewards.' }
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
