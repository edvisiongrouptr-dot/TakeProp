export const MARKETS = [
  ['BTCUSDT', 'BTC / USDT'],
  ['ETHUSDT', 'ETH / USDT'],
  ['SOLUSDT', 'SOL / USDT'],
  ['BNBUSDT', 'BNB / USDT'],
  ['XRPUSDT', 'XRP / USDT'],
  ['ADAUSDT', 'ADA / USDT'],
  ['DOGEUSDT', 'DOGE / USDT'],
  ['AVAXUSDT', 'AVAX / USDT'],
  ['LINKUSDT', 'LINK / USDT'],
  ['DOTUSDT', 'DOT / USDT'],
  ['LTCUSDT', 'LTC / USDT'],
  ['TRXUSDT', 'TRX / USDT'],
  ['SUIUSDT', 'SUI / USDT'],
  ['AAVEUSDT', 'AAVE / USDT'],
] as const

export const MARKET_SYMBOLS = new Set<string>(MARKETS.map(([symbol]) => symbol))
