'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import './auth.css'

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage('')
    const form = new FormData(event.currentTarget)
    const response = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName: form.get('fullName'), email: form.get('email'), password: form.get('password') }) })
    const result = await response.json(); setLoading(false)
    if (!response.ok) return setMessage(result.error || 'Something went wrong.')
    if (result.confirmationRequired) return setMessage('Check your email to confirm your account, then sign in.')
    window.location.href = '/dashboard'
  }
  return <main className="authPage"><section className="authIntro"><Link className="brand" href="/"><b>TP</b><strong>TakeProp</strong></Link><div><span>SIMULATED TRADING · SECURE ACCESS</span><h1>Your trading journey starts here.</h1><p>Create your account, choose a challenge and track every rule from one transparent dashboard.</p></div><small>Protected by encrypted, HTTP-only session cookies.</small></section><section className="authPanel"><div className="authBox"><span>TRADER ACCESS</span><h2>{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h2><p>{mode === 'login' ? 'Sign in to your TakeProp dashboard.' : 'One account for challenges, trading and payouts.'}</p><div className="authTabs"><button className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setMessage('') }}>Log in</button><button className={mode === 'register' ? 'on' : ''} onClick={() => { setMode('register'); setMessage('') }}>Register</button></div><form onSubmit={submit}>{mode === 'register' && <label>FULL NAME<input name="fullName" autoComplete="name" minLength={2} required placeholder="Your full name" /></label>}<label>EMAIL<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label><label>PASSWORD<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required placeholder="At least 8 characters" /></label>{message && <div className="authMessage">{message}</div>}<button className="btn authSubmit" disabled={loading}>{loading ? 'Please wait…' : mode === 'login' ? 'Log in →' : 'Create account →'}</button></form><small>By creating an account, you agree to TakeProp’s Terms and Privacy Policy.</small></div></section></main>
}
