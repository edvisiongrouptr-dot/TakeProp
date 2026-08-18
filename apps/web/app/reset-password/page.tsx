'use client'
import Link from 'next/link'
import {FormEvent,useEffect,useState} from 'react'
import BrandLogo from '../brand-logo'
import '../auth/auth.css'

export default function ResetPassword(){
 const [token,setToken]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(false),[done,setDone]=useState(false)
 useEffect(()=>{const hash=new URLSearchParams(window.location.hash.slice(1));setToken(hash.get('access_token')||'');if(hash.get('error_description'))setMessage(decodeURIComponent(hash.get('error_description')||''))},[])
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setLoading(true);const form=new FormData(event.currentTarget),password=String(form.get('password')||''),confirm=String(form.get('confirm')||'');if(password!==confirm){setLoading(false);return setMessage('Passwords do not match.')}const response=await fetch('/api/auth/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accessToken:token,password})});const result=await response.json();setLoading(false);if(!response.ok)return setMessage(result.error||'Unable to reset the password.');setDone(true);setMessage('Your password has been updated. You can now sign in.')}
 return <main className="authPage"><section className="authIntro"><BrandLogo priority/><div><span>ACCOUNT SECURITY</span><h1>Choose a new password.</h1><p>Use a unique password that you do not use on another service.</p></div></section><section className="authPanel"><div className="authBox"><span>SECURE RECOVERY</span><h2>Reset password.</h2>{done?<><div className="authMessage">{message}</div><Link className="btn authSubmit" href="/auth">Sign in →</Link></>:<form onSubmit={submit}><label>NEW PASSWORD<input name="password" type="password" autoComplete="new-password" minLength={8} required/></label><label>CONFIRM PASSWORD<input name="confirm" type="password" autoComplete="new-password" minLength={8} required/></label>{message&&<div className="authMessage">{message}</div>}<button className="btn authSubmit" disabled={loading||!token}>{loading?'Please wait…':'Update password →'}</button></form>}</div></section></main>
}
