import './styles.css'
import './brand.css'
import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'TakeProp — Trade Crypto. Prove Your Edge. Get Funded.', description: 'Transparent simulated crypto trading evaluations with static risk rules and up to 90% rewards.', applicationName:'TakeProp', icons:{icon:'/icon.png',apple:'/icon.png'}, openGraph:{title:'TakeProp — Take the Challenge. Take the Capital. Take the Profit.',description:'Transparent simulated crypto trading evaluations with static risk rules.',siteName:'TakeProp',type:'website',url:'https://takeprop.vercel.app'} }
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
