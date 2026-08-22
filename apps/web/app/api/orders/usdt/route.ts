import { NextResponse } from 'next/server'
import { getAuthenticatedUser, getOwnData, postOwnData } from '../../../../lib/supabase-rest'

type Plan = { id: string; slug: string; name: string; account_size: number; price: number; currency: string; version: number; profit_target_pct:number; daily_loss_limit_pct:number; max_loss_limit_pct:number; profit_split_pct:number; min_trading_days:number; leverage_ratio:number; rules: Record<string, unknown> }
const networks = {
  bep20: { provider: 'usdt_bep20', wallet: '0x30127dee8f4bfeaec586c32d580a8b6066eac11b' },
  erc20: { provider: 'usdt_erc20', wallet: '0x30127dee8f4bfeaec586c32d580a8b6066eac11b' },
  trc20: { provider: 'usdt_trc20', wallet: 'TLTKYRdtpaaYXoSHMgUgEJ3BGARbQkcx3g' },
  ton: { provider: 'usdt_ton', wallet: 'UQCuT9QECsZp-iBmSM1v8c8Gdga3JWww1sENWn6sywc4cjKc' }
} as const

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedUser()
    if (!auth) return NextResponse.json({ error: 'Please sign in before submitting a payment.' }, { status: 401 })
    const { planId, txHash, network } = await request.json()
    if (typeof planId !== 'string') return NextResponse.json({ error: 'Choose a valid challenge plan.' }, { status: 400 })
    const selected = typeof network === 'string' ? networks[network as keyof typeof networks] : undefined
    if (!selected) return NextResponse.json({ error: 'Choose a supported USDT network.' }, { status: 400 })
    const normalized=typeof txHash==='string'?txHash.trim():''
    const validHash=network==='bep20'||network==='erc20'?/^0x[0-9a-fA-F]{64}$/.test(normalized):network==='trc20'?/^[0-9a-fA-F]{64}$/.test(normalized):/^[A-Za-z0-9_-]{43,44}$/.test(normalized)
    if (!validHash) return NextResponse.json({ error: 'Enter a valid transaction hash for the selected network.' }, { status: 400 })
    const plans = await getOwnData<Plan[]>(`challenge_plans?select=id,slug,name,account_size,price,currency,version,profit_target_pct,daily_loss_limit_pct,max_loss_limit_pct,profit_split_pct,min_trading_days,leverage_ratio,rules&id=eq.${encodeURIComponent(planId)}&is_active=eq.true&limit=1`, auth.accessToken)
    const plan = plans[0]
    if (!plan) return NextResponse.json({ error: 'This challenge plan is unavailable.' }, { status: 404 })
    const orders = await postOwnData<{ id: string }[]>('orders', auth.accessToken, {
      user_id: auth.user.id,
      plan_id: plan.id,
      amount: plan.price,
      currency: 'USDT',
      status: 'pending',
      payment_provider: selected.provider,
      provider_checkout_id: selected.wallet,
      provider_payment_id: normalized,
      plan_version: plan.version,
      plan_snapshot: { slug: plan.slug, name: plan.name, account_size: plan.account_size, price: plan.price, currency: plan.currency, challenge_type: plan.rules.challenge_type, phase_2_profit_target_pct: plan.rules.phase_2_profit_target_pct, minimum_payout_usd: plan.rules.minimum_payout_usd, profit_target_pct:plan.profit_target_pct, daily_loss_limit_pct:plan.daily_loss_limit_pct, max_loss_limit_pct:plan.max_loss_limit_pct, profit_split_pct:plan.profit_split_pct, min_trading_days:plan.min_trading_days, leverage_ratio:plan.leverage_ratio, rules: plan.rules }
    })
    return NextResponse.json({ ok: true, orderId: orders[0]?.id })
  } catch (error) {
    const message = error instanceof Error && error.message.includes('duplicate') ? 'This transaction hash has already been submitted.' : 'Unable to submit payment. Check the transaction hash and try again.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
