import { NextResponse } from 'next/server'
import { authCookies, supabaseConfig } from '../../../../lib/supabase-rest'

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()
    if (typeof email !== 'string' || typeof password !== 'string') return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    const { url, key } = supabaseConfig()
    const authResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase(), password }), cache: 'no-store' })
    const result = await authResponse.json()
    if (!authResponse.ok) return NextResponse.json({ error: result.msg || result.error_description || 'Unable to sign in.' }, { status: authResponse.status })
    const response = NextResponse.json({ ok: true })
    const names = authCookies(); const secure = process.env.NODE_ENV === 'production'
    response.cookies.set(names.accessCookie, result.access_token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: result.expires_in || 3600 })
    response.cookies.set(names.refreshCookie, result.refresh_token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
    return response
  } catch { return NextResponse.json({ error: 'Authentication service is not configured.' }, { status: 503 }) }
}
