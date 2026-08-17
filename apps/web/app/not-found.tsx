import Link from 'next/link'
export default function NotFound(){return <main style={{minHeight:'100vh',display:'grid',placeContent:'center',background:'#050b0e',color:'#f4f6f4',fontFamily:'Arial',textAlign:'center',padding:24}}><small style={{color:'#52da99'}}>404 · TAKEPROP</small><h1>Page not found.</h1><Link href="/" style={{color:'#52da99'}}>Return home →</Link></main>}
