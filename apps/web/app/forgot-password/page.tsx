'use client'
import Link from 'next/link'
import {FormEvent,useState} from 'react'
import BrandLogo from '../brand-logo'
import '../auth/auth.css'

export default function ForgotPassword(){
 const [message,setMessage]=useState(''),[loading,setLoading]=useState(false)
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setLoading(true);const email=new FormData(event.currentTarget).get('email');const response=await fetch('/api/auth/recover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});const result=await response.json();setLoading(false);setMessage(result.message||result.error||'Unable to continue.')}
 return <main className="authPage"><section className="authIntro"><BrandLogo priority/><div><span>ACCOUNT SECURITY</span><h1>Recover access.</h1><p>We will send a time-limited password reset link to your registered email address.</p></div></section><section className="authPanel"><div className="authBox"><span>SECURE RECOVERY</span><h2>Forgot your password?</h2><p>Enter the email used for your TakeProp account.</p><form onSubmit={submit}><label>EMAIL<input name="email" type="email" autoComplete="email" required placeholder="you@example.com"/></label>{message&&<div className="authMessage">{message}</div>}<button className="btn authSubmit" disabled={loading}>{loading?'Please wait…':'Send recovery link →'}</button></form><Link href="/auth">← Back to sign in</Link></div></section></main>
}
