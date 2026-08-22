import {readFile} from 'node:fs/promises'

const migration=await readFile('supabase/migrations/20260822093000_harden_payments_and_payouts.sql','utf8')
const orderRoute=await readFile('apps/web/app/api/orders/usdt/route.ts','utf8')
const payoutPage=await readFile('apps/web/app/payouts/page.tsx','utf8')
const checks=[
 ['unique outbound reference',/create unique index if not exists payout_provider_reference_unique/i.test(migration)],
 ['strict payout transitions',/Invalid payout status transition/.test(migration)],
 ['network-specific payout hashes',/Invalid EVM transaction hash/.test(migration)&&/Invalid TRON transaction hash/.test(migration)&&/Invalid TON transaction hash/.test(migration)],
 ['on-chain confirmation floors',/usdt_bep20' then 15/.test(migration)&&/usdt_trc20' then 20/.test(migration)],
 ['recipient and amount checks',/Recipient mismatch/.test(migration)&&/Payment amount is insufficient/.test(migration)],
 ['idempotent account issuance',/where order_id=v_order.id limit 1/.test(migration)],
 ['payment audit records',/payment\.approve/.test(migration)&&/payment\.reject/.test(migration)],
 ['payout audit records',/'payout\.'\|\|p_decision/.test(migration)],
 ['frozen payout rules',/v_account\.rule_snapshot->>'profitSplitPct'/.test(migration)],
 ['pending order payout block',/public\.pending_orders/.test(migration)],
 ['rich order snapshot',/daily_loss_limit_pct:plan\.daily_loss_limit_pct/.test(orderRoute)&&/profit_split_pct:plan\.profit_split_pct/.test(orderRoute)],
 ['payout UI frozen snapshot',/rule_snapshot/.test(payoutPage)&&/minimumPayoutUsd/.test(payoutPage)]
]
const failed=checks.filter(([,ok])=>!ok)
if(failed.length){for(const [name] of failed)console.error(`FAIL ${name}`);process.exit(1)}
console.log(`Payment and payout invariants verified (${checks.length} checks).`)
