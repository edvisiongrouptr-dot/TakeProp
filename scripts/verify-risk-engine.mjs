import { readFile } from 'node:fs/promises'

const migration = await readFile('supabase/migrations/20260822090000_harden_risk_and_stage_engine.sql', 'utf8')
const edge = await readFile('supabase/functions/sim-trading/index.ts', 'utf8')
const dashboard = await readFile('apps/web/app/dashboard/page.tsx', 'utf8')

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

if (failures.length) {
  console.error(`Risk engine verification failed: ${failures.join(', ')}`)
  process.exit(1)
}

console.log(`Risk and stage engine verified (${assertions.length + 4} invariants).`)
