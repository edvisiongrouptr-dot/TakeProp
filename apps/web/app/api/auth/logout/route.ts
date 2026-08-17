import { NextResponse } from 'next/server'
import { authCookies, supabaseConfig } from '../../../../lib/supabase-rest'

export async function POST(request: Request) {
  const names = authCookies(); const token = request.headers.get('cookie')?.match(new RegExp(`${names.accessCookie}=([^;]+)`))?.[1]
  if (token) { try { const { url, key } = supabaseConfig(); await fetch(`${url}/auth/v1/logout`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${token}` }, cache: 'no-store' }) } catch {} }
  const response = NextResponse.json({ ok: true })
  response.cookies.set(names.accessCookie, '', { path: '/', maxAge: 0 }); response.cookies.set(names.refreshCookie, '', { path: '/', maxAge: 0 })
  return response
}
