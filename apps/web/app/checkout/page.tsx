import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser, getOwnData } from '../../lib/supabase-rest'
import CheckoutForm from './checkout-form'
import './checkout.css'
import './network.css'

type Plan = { id: string; slug: string; name: string; account_size: number; price: number; profit_target_pct: number; daily_loss_limit_pct: number; max_loss_limit_pct: number; profit_split_pct: number; rules: { challenge_type?: string; phase_2_profit_target_pct?: number } }
const usd=(value:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value)

export default async function Checkout({ searchParams }: { searchParams: { plan?: string } }) {
  const auth = await getAuthenticatedUser(); if (!auth) redirect(`/auth?next=${encodeURIComponent(`/checkout?plan=${searchParams.plan || ''}`)}`)
  const slug = typeof searchParams.plan === 'string' ? searchParams.plan : ''
  const plans = await getOwnData<Plan[]>(`challenge_plans?select=id,slug,name,account_size,price,profit_target_pct,daily_loss_limit_pct,max_loss_limit_pct,profit_split_pct,rules&slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&limit=1`, auth.accessToken)
  const plan = plans[0]; if (!plan) redirect('/#plans')
  const twoStep = plan.rules?.challenge_type === 'two_step'
  return <main className="checkoutPage"><header><Link className="brand" href="/"><b>TP</b><strong>TakeProp</strong></Link><Link href="/#plans">← Change plan</Link></header><section><div className="checkoutIntro"><span>SECURE CHECKOUT</span><h1>Start your {twoStep ? 'Two-Step' : 'One-Step'} challenge.</h1><p>Review the fixed rules, pay with USDT on BEP20 and submit the blockchain transaction for verification.</p><div className="orderCard"><small>SELECTED CHALLENGE</small><h2>{usd(plan.account_size)}</h2><p>{plan.name}</p><div><span>Profit target<b>{twoStep ? `${plan.profit_target_pct}% / ${plan.rules.phase_2_profit_target_pct || 5}%` : `${plan.profit_target_pct}%`}</b></span><span>Daily loss<b>{plan.daily_loss_limit_pct}%</b></span><span>Static max loss<b>{plan.max_loss_limit_pct}%</b></span><span>Reward split<b>{plan.profit_split_pct}%</b></span></div><strong>{plan.price} USDT</strong></div></div><CheckoutForm planId={plan.id}/></section></main>
}
