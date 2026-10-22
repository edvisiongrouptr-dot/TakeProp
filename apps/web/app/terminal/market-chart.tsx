'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import styles from './terminal.module.css'

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number }
const intervals = ['1m', '5m', '15m', '1h', '4h', '1d'] as const
const chartWidth = 1000, chartHeight = 390, priceHeight = 292, volumeTop = 312, volumeHeight = 54, plotRight = 918
const format = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: value < 1 ? 6 : value < 10 ? 4 : 2 }).format(value)

export default function MarketChart({ symbol, label, mark }: { symbol: string; label: string; mark: number }) {
  const [interval, setIntervalValue] = useState<(typeof intervals)[number]>('5m')
  const [candles, setCandles] = useState<Candle[]>([])
  const [error, setError] = useState('')
  const [active, setActive] = useState<number | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    let disposed = false
    async function load() {
      const id = ++requestId.current
      try {
        const response = await fetch(`/api/market/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}`)
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Chart unavailable')
        if (!disposed && id === requestId.current) { setCandles(payload.candles); setError('') }
      } catch (reason) {
        if (!disposed && id === requestId.current) setError(reason instanceof Error ? reason.message : 'Chart unavailable')
      }
    }
    setCandles([]); setActive(null); load()
    const timer = window.setInterval(load, 15_000)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [symbol, interval])

  const model = useMemo(() => {
    if (candles.length < 2) return null
    let low = Number.POSITIVE_INFINITY, high = 0, maxVolume = 0
    for (const candle of candles) { low = Math.min(low, candle.low); high = Math.max(high, candle.high); maxVolume = Math.max(maxVolume, candle.volume) }
    const padding = Math.max((high - low) * .08, high * .001)
    low -= padding; high += padding
    const range = high - low || 1, step = plotRight / candles.length, body = Math.max(2, Math.min(7, step * .62))
    return { low, high, maxVolume, step, body, y: (value: number) => 12 + (high - value) / range * (priceHeight - 24) }
  }, [candles])

  const current = active === null ? candles.at(-1) : candles[active]
  const change = current ? current.close - current.open : 0
  function move(event: React.MouseEvent<SVGSVGElement>) {
    if (!model) return
    const bounds = event.currentTarget.getBoundingClientRect(), x = (event.clientX - bounds.left) / bounds.width * chartWidth
    setActive(Math.max(0, Math.min(candles.length - 1, Math.floor(x / model.step))))
  }

  return <section className={styles.chart}>
    <header className={styles.chartHeader}><div><small>MARKET CHART</small><h2>{label}</h2></div><div className={styles.chartQuote}><b className={change >= 0 ? styles.green : styles.red}>{format(current?.close || mark)} USDT</b><small>Binance candles · TakeProp execution uses validated mark</small></div></header>
    <nav className={styles.intervals} aria-label="Chart timeframe">{intervals.map(value => <button key={value} className={interval === value ? styles.activeInterval : ''} onClick={() => setIntervalValue(value)}>{value}</button>)}</nav>
    {error && candles.length === 0 ? <p className={styles.chartMessage}>{error}</p> : !model ? <p className={styles.chartMessage}>Loading market candles…</p> : <div className={styles.chartCanvas}>
      {current ? <div className={styles.ohlc}><span>O <b>{format(current.open)}</b></span><span>H <b>{format(current.high)}</b></span><span>L <b>{format(current.low)}</b></span><span>C <b className={change >= 0 ? styles.green : styles.red}>{format(current.close)}</b></span><span>Vol <b>{format(current.volume)}</b></span></div> : null}
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`${label} ${interval} candlestick chart`} onMouseMove={move} onMouseLeave={() => setActive(null)}>
        {[0, .25, .5, .75, 1].map(fraction => { const y = 12 + fraction * (priceHeight - 24), value = model.high - fraction * (model.high - model.low); return <g key={fraction}><line className={styles.chartGrid} x1="0" x2={plotRight} y1={y} y2={y}/><text className={styles.axisText} x="930" y={y + 4}>{format(value)}</text></g> })}
        {candles.map((candle, index) => { const x = index * model.step + model.step / 2, openY = model.y(candle.open), closeY = model.y(candle.close), up = candle.close >= candle.open, colorClass = up ? styles.candleUp : styles.candleDown, volumeY = volumeTop + volumeHeight - candle.volume / (model.maxVolume || 1) * volumeHeight; return <g key={candle.time} className={colorClass}><line x1={x} x2={x} y1={model.y(candle.high)} y2={model.y(candle.low)}/><rect x={x - model.body / 2} y={Math.min(openY, closeY)} width={model.body} height={Math.max(1.5, Math.abs(closeY - openY))}/><rect className={styles.volumeBar} x={x - model.body / 2} y={volumeY} width={model.body} height={volumeTop + volumeHeight - volumeY}/></g> })}
        {[0, .25, .5, .75, 1].map(fraction => { const index = Math.min(candles.length - 1, Math.round((candles.length - 1) * fraction)), candle = candles[index], x = index * model.step + model.step / 2; return <text className={styles.axisText} key={fraction} x={x} y="386" textAnchor={fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'}>{new Intl.DateTimeFormat('en-GB', interval === '1d' ? { month: 'short', day: '2-digit' } : { hour: '2-digit', minute: '2-digit', hour12: false }).format(candle.time)}</text> })}
        {active !== null ? <g className={styles.crosshair}><line x1={active * model.step + model.step / 2} x2={active * model.step + model.step / 2} y1="0" y2={volumeTop + volumeHeight}/><line x1="0" x2={plotRight} y1={model.y(candles[active].close)} y2={model.y(candles[active].close)}/></g> : null}
      </svg>
    </div>}
  </section>
}
