'use client'

import { useEffect, useMemo, useState } from 'react'

export type PublicPlan = {
  slug: string
  name: string
  account_size: number
  price: number
  compare_at_price: number | null
  profit_target_pct: number
  daily_loss_limit_pct: number
  max_loss_limit_pct: number
  profit_split_pct: number
  min_trading_days: number
  max_trading_days: number | null
  leverage_ratio: number
  rules: {
    challenge_type?: string
    phase_2_profit_target_pct?: number
    time_limit?: string
    consistency_rule?: boolean
  }
}

const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)

const sizeLabel = (value: number) =>
  value >= 1000 ? `${value / 1000}K` : String(value)

export default function ChallengeSelector({
  plans,
}: {
  plans: PublicPlan[]
}) {
  const steps = useMemo(
    () =>
      Array.from(
        new Set(plans.map((plan) => plan.rules?.challenge_type || 'one_step')),
      ),
    [plans],
  )

  const [step, setStep] = useState(
    steps.includes('one_step') ? 'one_step' : steps[0] || 'one_step',
  )

  const stepPlans = useMemo(
    () =>
      plans
        .filter((plan) => (plan.rules?.challenge_type || 'one_step') === step)
        .sort((a, b) => Number(a.account_size) - Number(b.account_size)),
    [plans, step],
  )

  const [size, setSize] = useState(Number(stepPlans[0]?.account_size || 0))

  useEffect(() => {
    if (!stepPlans.some((plan) => Number(plan.account_size) === size)) {
      setSize(Number(stepPlans[0]?.account_size || 0))
    }
  }, [stepPlans, size])

  const plan =
    stepPlans.find((item) => Number(item.account_size) === size) || stepPlans[0]

  if (!plan) {
    return (
      <div className="planUnavailable">
        <b>Challenge catalog is temporarily unavailable.</b>
        <p>Please refresh shortly or contact support.</p>
      </div>
    )
  }

  const twoStep = step === 'two_step'
  const phase2 = Number(
    plan.rules?.phase_2_profit_target_pct || plan.profit_target_pct,
  )

  return (
    <div className="liveCatalog">
      <div className="catalogHeader">
        <div>
          <span>LIVE CHALLENGE CATALOG</span>
          <h3>Build your evaluation.</h3>
          <p>
            Pricing and rules are loaded from the same production catalog used
            by checkout.
          </p>
        </div>

        <div className="catalogPrice">
          <small>ONE-TIME FEE</small>
          {plan.compare_at_price &&
          Number(plan.compare_at_price) > Number(plan.price) ? (
            <s>{money(Number(plan.compare_at_price))}</s>
          ) : null}
          <b>{money(Number(plan.price))}</b>
        </div>
      </div>

      <div className="toggle" aria-label="Evaluation type">
        {steps.map((item) => (
          <button
            key={item}
            className={step === item ? 'on' : ''}
            onClick={() => setStep(item)}
            type="button"
          >
            {item === 'two_step' ? '2-Step' : '1-Step'}
          </button>
        ))}
      </div>

      <div className="sizes" aria-label="Account size">
        {stepPlans.map((item) => (
          <button
            key={item.slug}
            className={
              Number(plan.account_size) === Number(item.account_size) ? 'on' : ''
            }
            onClick={() => setSize(Number(item.account_size))}
            type="button"
          >
            {sizeLabel(Number(item.account_size))}
          </button>
        ))}
      </div>

      <div className="plan">
        <div className="offer">
          <span>{twoStep ? 'TWO-STEP' : 'ONE-STEP'} CHALLENGE</span>
          <h2>{money(Number(plan.account_size))}</h2>
          <p>Simulated account balance</p>

          <div className="price">
            {plan.compare_at_price &&
            Number(plan.compare_at_price) > Number(plan.price) ? (
              <s>{money(Number(plan.compare_at_price))}</s>
            ) : null}
            <b>{money(Number(plan.price))}</b>
            <small>one-time</small>
          </div>

          <a
            className="btn"
            href={`/checkout?plan=${encodeURIComponent(plan.slug)}`}
          >
            Start challenge →
          </a>
          <small>No subscription. Your account keeps its plan snapshot.</small>
        </div>

        <div className="rules">
          <Rule
            a={twoStep ? 'PHASE TARGETS' : 'PROFIT TARGET'}
            b={
              twoStep
                ? `${Number(plan.profit_target_pct)}% / ${phase2}%`
                : `${Number(plan.profit_target_pct)}%`
            }
          />
          <Rule
            a="DAILY LOSS LIMIT"
            b={`${Number(plan.daily_loss_limit_pct)}% · ${money(
              (Number(plan.account_size) *
                Number(plan.daily_loss_limit_pct)) /
                100,
            )}`}
          />
          <Rule
            a="STATIC MAX LOSS"
            b={`${Number(plan.max_loss_limit_pct)}% · ${money(
              (Number(plan.account_size) *
                Number(plan.max_loss_limit_pct)) /
                100,
            )}`}
          />
          <Rule
            a="REWARD SPLIT"
            b={`${Number(plan.profit_split_pct)}%`}
            green
          />
          <Rule
            a="TIME LIMIT"
            b={
              plan.max_trading_days
                ? `Up to ${plan.max_trading_days} days`
                : 'None'
            }
          />
          <Rule
            a="MINIMUM DAYS"
            b={`${Number(plan.min_trading_days)} days`}
          />
          <Rule
            a="MAX LEVERAGE"
            b={`Up to ${Number(plan.leverage_ratio)}×`}
          />
          <Rule
            a="CONSISTENCY RULE"
            b={plan.rules?.consistency_rule ? 'Applies' : 'None'}
          />
        </div>
      </div>

      <p className="fine">
        All accounts and executions are simulated. Rewards require eligibility,
        review, identity verification and the applicable agreement.
      </p>
    </div>
  )
}
function Rule({
  a,
  b,
  green,
}: {
  a: string
  b: string
  green?: boolean
}) {
  return (
    <div>
      <small>{a}</small>
      <b className={green ? 'green' : ''}>{b}</b>
    </div>
  )
}

