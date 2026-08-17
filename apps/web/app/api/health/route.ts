import { NextResponse } from 'next/server'
export const dynamic='force-dynamic'
export async function GET(){return NextResponse.json({ok:true,service:'takeprop-web',time:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})}
