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

async function markPrice(symbol: string) {
  if (!symbols.includes(symbol as typeof symbols[number])) throw new Error("Unsupported symbol");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`, { signal: controller.signal });
    if (!res.ok) throw new Error("Market price provider unavailable");
    const data = await res.json();
    const price = Number(data.markPrice);
    if (!Number.isFinite(price) || price <= 0) throw new Error("Invalid market price");
    return price;
  } finally { clearTimeout(timer); }
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

    const marksEntries = await Promise.all(symbols.map(async symbol => [symbol, await markPrice(symbol)] as const));
    const marks = Object.fromEntries(marksEntries);
    let rpc = "internal_sync_sim_account";
    let payload: Record<string, unknown> = { p_user_id: user.id, p_account_id: accountId, p_marks: marks };
    if (action === "open") {
      const symbol = String(body.symbol || "").toUpperCase();
      rpc = "internal_open_sim_trade";
      payload = { ...payload, p_symbol: symbol, p_side: body.side, p_margin: Number(body.margin), p_leverage: Number(body.leverage), p_mark: marks[symbol] };
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
    return json({ ...result, marks, markSource: "Binance USD-M mark price", serverTime: new Date().toISOString() });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Trading service unavailable" }, 500);
  }
});
