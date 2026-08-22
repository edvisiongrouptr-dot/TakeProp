import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { authCookies, supabaseConfig } from '../../../../lib/supabase-rest'
import {passwordPolicyError} from '../../../../lib/password-policy'

const LEGAL_VERSION = '2026-08-17'

export async function POST(request: Request) {
  try {
    const { fullName, email, password, acceptedTerms, acceptedPrivacy, acceptedRisk, ageConfirmed } = await request.json()
    if (typeof fullName !== 'string' || fullName.trim().length < 2) return NextResponse.json({ error: 'Enter your full name.' }, { status: 400 })
    if (typeof email !== 'string' || !email.includes('@')) return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 })
    const passwordError=passwordPolicyError(password);if(passwordError)return NextResponse.json({error:passwordError},{status:400})
    if (!acceptedTerms || !acceptedPrivacy || !acceptedRisk || !ageConfirmed) return NextResponse.json({ error: 'Confirm your eligibility and accept all required legal documents.' }, { status: 400 })
    const { url, key } = supabaseConfig(); const origin = new URL(request.url).origin
    const evidence=createHash('sha256').update([request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown',request.headers.get('user-agent')||'unknown',process.env.LEGAL_ACCEPTANCE_SALT||'takeprop'].join('|')).digest('hex')
    const redirectTo=encodeURIComponent(`${origin}/auth?verified=1`)
    const authResponse = await fetch(`${url}/auth/v1/signup?redirect_to=${redirectTo}`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase(), password, data: { full_name: fullName.trim(),legal_version:LEGAL_VERSION,accepted_terms:true,accepted_privacy:true,accepted_risk:true,age_confirmed:true,legal_accepted_at:new Date().toISOString(),legal_evidence_hash:evidence } }), cache: 'no-store' })
    const result = await authResponse.json()
    if (!authResponse.ok) return NextResponse.json({ error: result.msg || result.error_description || 'Unable to create account.' }, { status: authResponse.status })
    if (!result.access_token) return NextResponse.json({ ok: true, confirmationRequired: true })
    const response = NextResponse.json({ ok: true }); const names = authCookies(); const secure = process.env.NODE_ENV === 'production'
    response.cookies.set(names.accessCookie, result.access_token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: result.expires_in || 3600 })
    response.cookies.set(names.refreshCookie, result.refresh_token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
    return response
  } catch { return NextResponse.json({ error: 'Authentication service is not configured.' }, { status: 503 }) }
}
