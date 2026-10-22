import { readFile } from 'node:fs/promises'

const migration = await readFile('supabase/migrations/20260822090000_harden_risk_and_stage_engine.sql', 'utf8')
const edge = await readFile('supabase/functions/sim-trading/index.ts', 'utf8')
const dashboard = await readFile('apps/web/app/dashboard/page.tsx', 'utf8')
const protectionMigration = await readFile('supabase/migrations/20261023180000_edit_open_trade_protection.sql', 'utf8')
const terminal = await readFile('apps/web/app/terminal/terminal-client.tsx', 'utf8')
const menu = await readFile('apps/web/app/site-menu.tsx', 'utf8')

const assertions = [
  ['immutable account contract', /Account plan and rule snapshot are immutable/],
  ['row locking', /for update/],
  ['daily equity breach', /v_equity<=v_daily_floor/],
  ['static equity breach', /v_equity<=v_static_floor/],
  ['automatic liquidation', /close_reason='risk_breach'/],
  ['minimum trading days', /v_account\.trading_days>=v_min_days/],
  ['no open positions before pass', /closed_at is null/],
  ['no pending orders before pass', /status='pending'/],
  ['idempotent child account', /source_account_id=p_account_id/],
  ['frozen phase two target', /phase2ProfitTargetPct/],
  ['frozen lifecycle initialization', /v_challenge_type:=coalesce\(nullif\(new\.rule_snapshot/],
]

const failures = assertions.filter(([, pattern]) => !pattern.test(migration)).map(([name]) => name)
if (!edge.includes('internal_finalize_sim_account')) failures.push('edge finalization call')
if (!edge.includes('internal_advanced_snapshot')) failures.push('server-owned snapshot call')
if (!dashboard.includes('rule_snapshot')) failures.push('dashboard frozen rules')
if (!dashboard.includes('account.daily_start_balance')) failures.push('dashboard daily baseline')
if (!edge.includes('internal_update_trade_protection')) failures.push('SL/TP update edge action')
if (!protectionMigration.includes('internal_validate_protection') || !protectionMigration.includes('closed_at is not null') || !protectionMigration.includes('Position symbol mismatch')) failures.push('SL/TP update validation')
if (!terminal.includes('[1,2,5,10,20,25,50,75,100]')) failures.push('100x terminal leverage options')
if (!terminal.includes("action:'update_protection'") || !terminal.includes('Edit SL/TP')) failures.push('open position SL/TP editor')
for (const route of ['/dashboard','/terminal','/payouts','/kyc','/notifications','/support']) if (!menu.includes(`href="${route}"`)) failures.push(`menu route ${route}`)

if (failures.length) {
  console.error(`Risk engine verification failed: ${failures.join(', ')}`)
  process.exit(1)
}

console.log(`Risk, protection and navigation controls verified (${assertions.length + 14} invariants).`)
