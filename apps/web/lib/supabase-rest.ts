import { cookies } from 'next/headers'

const accessCookie = 'takeprop-access-token'
const refreshCookie = 'takeprop-refresh-token'

export type AuthUser = { id: string; email?: string; user_metadata?: { full_name?: string } }

export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase environment variables are missing.')
  return { url: url.replace(/\/$/, ''), key }
}

export function authCookies() { return { accessCookie, refreshCookie } }

export async function getAuthenticatedUser(): Promise<{ user: AuthUser; accessToken: string } | null> {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(accessCookie)?.value
  if (!accessToken) return null
  const { url, key } = supabaseConfig()
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
  if (!response.ok) return null
  return { user: (await response.json()) as AuthUser, accessToken }
}

export async function getOwnData<T>(path: string, accessToken: string): Promise<T> {
  const { url, key } = supabaseConfig()
  const response = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
  if (!response.ok) throw new Error(`Supabase query failed (${response.status}).`)
  return response.json() as Promise<T>
}

export async function postOwnData<T>(path: string, accessToken: string, body: unknown): Promise<T> {
  const { url, key } = supabaseConfig()
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
    cache: 'no-store'
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.message || `Supabase mutation failed (${response.status}).`)
  return result as T
}
