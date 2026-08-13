import React from 'react'

export default function Home() {
  return (
    <html lang="en">
      <head>
        <title>TakeProp — Trade Crypto. Prove Your Edge. Get Funded.</title>
        <meta name="description" content="Simulated crypto prop trading evaluation platform — take the $5K One-Step challenge." />
      </head>
      <body style={{background:'#0b0f1a',color:'#ffffff',fontFamily:'Inter, ui-sans-serif, system-ui'}}>
        <main style={{maxWidth:900,margin:'48px auto',padding:'0 16px'}}>
          <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:32}}>
            <div style={{fontWeight:700,fontSize:20}}>TakeProp</div>
            <nav style={{display:'flex',gap:16}}>
              <a href="#how" style={{color:'#9aa3b2'}}>How It Works</a>
              <a href="#challenge" style={{color:'#9aa3b2'}}>Challenge</a>
              <a href="#rules" style={{color:'#9aa3b2'}}>Rules</a>
              <a href="#login" style={{color:'#9aa3b2'}}>Login</a>
              <a href="#start" style={{background:'#00e676',padding:'8px 12px',borderRadius:6,color:'#031017',fontWeight:600}}>Start $5K Challenge — $39</a>
            </nav>
          </header>

          <section style={{padding:32,background:'#071025',borderRadius:12}}>
            <h1 style={{fontSize:40,margin:0}}>Trade Crypto. Prove Your Edge. Get Funded.</h1>
            <p style={{color:'#9aa3b2'}}>Simulated evaluation accounts. Successful traders may qualify for a funded simulated account and performance rewards. Trading is simulated — no real customer funds are used.</p>
            <div style={{display:'flex',gap:12,marginTop:18}}>
              <a href="#start" style={{background:'#00e676',padding:'10px 14px',borderRadius:8,color:'#031017',fontWeight:700}}>Start $5K Challenge — $39</a>
              <a href="#try" style={{border:'1px solid #263240',padding:'10px 14px',borderRadius:8,color:'#9aa3b2'}}>Try Free</a>
            </div>
          </section>

          <section id="features" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12,marginTop:28}}>
            <div style={{padding:20,background:'#071025',borderRadius:8}}>
              <h3 style={{marginTop:0}}>80–90% Rewards</h3>
              <p style={{color:'#9aa3b2'}}>High reward splits for successful traders.</p>
            </div>
            <div style={{padding:20,background:'#071025',borderRadius:8}}>
              <h3 style={{marginTop:0}}>No Time Limit</h3>
              <p style={{color:'#9aa3b2'}}>Trade until you reach the target or hit risk limits.</p>
            </div>
            <div style={{padding:20,background:'#071025',borderRadius:8}}>
              <h3 style={{marginTop:0}}>Static Drawdown</h3>
              <p style={{color:'#9aa3b2'}}>Absolute account floor protects the challenge rules.</p>
            </div>
          </section>

        </main>
      </body>
    </html>
  )
}
