import { readFile } from 'node:fs/promises'

const expected = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','LTCUSDT','TRXUSDT','SUIUSDT','AAVEUSDT']
const files = {
  ui: await readFile('apps/web/app/terminal/markets.ts', 'utf8'),
  trading: await readFile('supabase/functions/sim-trading/index.ts', 'utf8'),
  worker: await readFile('supabase/functions/process-active-orders/index.ts', 'utf8'),
  migration: await readFile('supabase/migrations/20261023120000_expand_markets_chart_support_notifications.sql', 'utf8'),
  supportSchema: await readFile('supabase/migrations/20261023123000_normalize_support_message_author.sql', 'utf8'),
  supportTicketSchema: await readFile('supabase/migrations/20261023124000_complete_support_ticket_schema.sql', 'utf8'),
  supportStatuses: await readFile('supabase/migrations/20261023125000_expand_support_ticket_statuses.sql', 'utf8'),
  chart: await readFile('apps/web/app/terminal/market-chart.tsx', 'utf8'),
  candles: await readFile('apps/web/app/api/market/candles/route.ts', 'utf8'),
}

const failures = []
for (const symbol of expected) for (const [area, source] of Object.entries(files).slice(0, 4)) if (!source.includes(symbol)) failures.push(`${area} is missing ${symbol}`)
for (const interval of ['1m','5m','15m','1h','4h','1d']) if (!files.chart.includes(`'${interval}'`)) failures.push(`chart is missing ${interval}`)
for (const needle of ['api.binance.com/api/v3/klines','MARKET_SYMBOLS','AbortSignal.timeout']) if (!files.candles.includes(needle)) failures.push(`candle route is missing ${needle}`)
for (const needle of ['support_team_message',"r.role in ('admin','support')",'Customer replied to support ticket']) if (!files.migration.includes(needle)) failures.push(`support migration is missing ${needle}`)
for (const needle of ['rename column user_id to author_user_id',"column_name='author_user_id'"]) if (!files.supportSchema.includes(needle)) failures.push(`support schema migration is missing ${needle}`)
for (const needle of ['assigned_to uuid','closed_at timestamptz']) if (!files.supportTicketSchema.includes(needle)) failures.push(`support ticket schema migration is missing ${needle}`)
for (const needle of ['waiting_user','waiting_support','waiting_for_user','in_progress']) if (!files.supportStatuses.includes(needle)) failures.push(`support status migration is missing ${needle}`)

if (failures.length) { console.error(failures.map(item => `FAIL ${item}`).join('\n')); process.exit(1) }
console.log(`Market chart and support routing verified (${expected.length} supported markets).`)
