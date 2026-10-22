import { NextRequest, NextResponse } from 'next/server'
import { MARKET_SYMBOLS } from '../../../terminal/markets'

const intervals = new Set(['1m', '5m', '15m', '1h', '4h', '1d'])

export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get('symbol') || '').toUpperCase()
  const interval = request.nextUrl.searchParams.get('interval') || '5m'
  if (!MARKET_SYMBOLS.has(symbol) || !intervals.has(interval)) {
    return NextResponse.json({ error: 'Unsupported market or interval' }, { status: 400 })
  }
  try {
    let raw: unknown = null
    for (const origin of ['https://data-api.binance.vision', 'https://api.binance.com']) {
      try {
        const url = new URL('/api/v3/klines', origin)
        url.searchParams.set('symbol', symbol); url.searchParams.set('interval', interval); url.searchParams.set('limit', '120')
        const response = await fetch(url, { headers: { 'user-agent': 'TakeProp-Market-Chart/1.0' }, next: { revalidate: interval === '1m' ? 10 : 30 }, signal: AbortSignal.timeout(7000) })
        if (response.ok) { raw = await response.json(); break }
      } catch { /* Try the next Binance public-data origin. */ }
    }
    if (!Array.isArray(raw)) throw new Error('Invalid candle response')
    const candles = raw.map((row: unknown[]) => ({ time: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) }))
      .filter(candle => Object.values(candle).every(Number.isFinite) && candle.time > 0 && candle.low > 0 && candle.high >= candle.low)
    if (candles.length < 2) throw new Error('Insufficient candle data')
    return NextResponse.json({ candles, source: 'Binance public market data' })
  } catch {
    return NextResponse.json({ error: 'Chart market data is temporarily unavailable' }, { status: 503 })
  }
}
