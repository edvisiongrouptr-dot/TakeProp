const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"] as const;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
});
function envKey(name: string, fallback: string) {
  const direct = Deno.env.get(name);
  if (direct) return direct;
  const raw = Deno.env.get(fallback);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return parsed.default || Object.values(parsed)[0] || "";
  } catch { return raw; }
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "user-agent": "TakeProp-Market-Data/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

async function allMarkPrices() {
  const cryptoCompare = fetchJson("https://min-api.cryptocompare.com/data/pricemulti?fsyms=BTC,ETH,SOL,BNB&tsyms=USDT")
    .then(x => ({ BTCUSDT:Number(x?.BTC?.USDT), ETHUSDT:Number(x?.ETH?.USDT), SOLUSDT:Number(x?.SOL?.USDT), BNBUSDT:Number(x?.BNB?.USDT) }));
  const coinGecko = fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin,tether&vs_currencies=usd")
    .then(x => { const peg=Number(x?.tether?.usd)||1; return { BTCUSDT:Number(x?.bitcoin?.usd)/peg, ETHUSDT:Number(x?.ethereum?.usd)/peg, SOLUSDT:Number(x?.solana?.usd)/peg, BNBUSDT:Number(x?.binancecoin?.usd)/peg }; });
  const settled = await Promise.allSettled([cryptoCompare, coinGecko]);
  const providers = settled.flatMap(x => x.status === "fulfilled" ? [x.value] : []);
  if (!providers.length) throw new Error("Market price providers unavailable");
  const marks: Record<string,number> = {};
  for (const symbol of symbols) {
    const values=providers.map(x=>Number(x[symbol])).filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>a-b);
    if (!values.length) throw new Error(`Market price unavailable for ${symbol}`);
    const mark=values.length===1?values[0]:(values[0]+values[1])/2;
    if(values.length>1&&(values[1]-values[0])/mark>0.015)throw new Error(`Market price validation failed for ${symbol}`);
    marks[symbol]=mark;
  }
  return { marks, source: providers.length>1 ? "Validated CryptoCompare + CoinGecko reference price" : "Validated reference market price" };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = envKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
  const serviceKey = envKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
  const authorization = req.headers.get("authorization") || "";
  if (!supabaseUrl || !anonKey || !serviceKey || !authorization.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, authorization } });
    if (!userRes.ok) return json({ error: "Unauthorized" }, 401);
    const user = await userRes.json();
    const body = await req.json();
    const action = String(body.action || "snapshot");
    const accountId = String(body.accountId || "");
    if (!accountId) return json({ error: "Account is required" }, 400);

    const market = await allMarkPrices();
    const marks = market.marks;
    let rpc = "internal_advanced_snapshot";
    let payload: Record<string, unknown> = { p_user_id: user.id, p_account_id: accountId, p_marks: marks };
    if (action === "open") {
      const symbol = String(body.symbol || "").toUpperCase();
      rpc = "internal_open_sim_trade_advanced";
      payload = { ...payload, p_symbol: symbol, p_side: body.side, p_margin: Number(body.margin), p_leverage: Number(body.leverage), p_mark: marks[symbol], p_stop_loss: body.stopLoss ? Number(body.stopLoss) : null, p_take_profit: body.takeProfit ? Number(body.takeProfit) : null };
    } else if (action === "place_pending") {
      const symbol = String(body.symbol || "").toUpperCase();
      rpc = "internal_place_pending_order";
      payload = { p_user_id: user.id, p_account_id: accountId, p_symbol: symbol, p_side: body.side, p_order_type: body.orderType, p_margin: Number(body.margin), p_leverage: Number(body.leverage), p_trigger_price: Number(body.triggerPrice), p_stop_loss: body.stopLoss ? Number(body.stopLoss) : null, p_take_profit: body.takeProfit ? Number(body.takeProfit) : null, p_current_mark: marks[symbol] };
    } else if (action === "cancel_pending") {
      rpc = "internal_cancel_pending_order";
      payload = { p_user_id: user.id, p_account_id: accountId, p_order_id: body.orderId };
    } else if (action === "close") {
      const symbol = String(body.symbol || "").toUpperCase();
      rpc = "internal_close_sim_trade";
      payload = { ...payload, p_trade_id: body.tradeId, p_mark: marks[symbol] };
    } else if (action !== "snapshot") return json({ error: "Unsupported action" }, 400);

    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpc}`, {
      method: "POST",
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await rpcRes.json().catch(() => ({}));
    if (!rpcRes.ok) return json({ error: result.message || "Trading action failed" }, 400);
    const finalRes = await fetch(`${supabaseUrl}/rest/v1/rpc/internal_finalize_sim_account`, {
      method: "POST",
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
      body: JSON.stringify({ p_user_id: user.id, p_account_id: accountId, p_marks: marks }),
    });
    const finalResult = await finalRes.json().catch(() => result);
    if (!finalRes.ok) return json({ error: finalResult.message || "Risk finalization failed" }, 400);
    const snapshotRes = await fetch(`${supabaseUrl}/rest/v1/rpc/internal_advanced_snapshot`, {
      method: "POST",
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
      body: JSON.stringify({ p_user_id: user.id, p_account_id: accountId, p_marks: marks }),
    });
    const snapshot = await snapshotRes.json().catch(() => finalResult);
    if (!snapshotRes.ok) return json({ error: snapshot.message || "Account snapshot failed" }, 400);
    return json({ ...snapshot, marks, markSource: market.source, serverTime: new Date().toISOString() });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Trading service unavailable" }, 500);
  }
});
