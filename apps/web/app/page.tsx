import './launch.css'
import BrandLogo from './brand-logo'
import ChallengeSelector, { type PublicPlan } from './challenge-selector'
import { getPublicData } from '../lib/supabase-rest'

export const revalidate = 60

const commonFaq = [
  [
    'What exactly is TakeProp?',
    'TakeProp is a proprietary trading evaluation platform that measures trading performance and risk discipline under predefined rules. Evaluation and funded-stage accounts operate in a simulated trading environment; TakeProp does not accept customer trading capital or route customer orders to an exchange.',
  ],
  [
    'What does simulated trading mean?',
    'Balances, orders, positions and P&L are simulated using market-reference data and the TakeProp execution model. Eligible performance rewards are contractual rewards based on simulated performance rather than investment returns on customer deposits.',
  ],
  [
    'Is there a time limit?',
    'Current paid evaluation plans have no fixed time limit. Any inactivity rule is disclosed in the applicable plan terms.',
  ],
  [
    'Are minimum trading days required?',
    'Current challenge plans require zero minimum trading days.',
  ],
  [
    'Does maximum drawdown trail profits?',
    'No. The maximum-loss floor is static and anchored to the original simulated starting balance.',
  ],
  [
    'How is daily loss calculated?',
    'The current daily loss limit is measured from the UTC day-start balance. Open equity counts under the account rule snapshot, and risk uses the platform reference-price methodology.',
  ],
  [
    'What happens after a breach?',
    'Trading is locked according to the applicable rule set. TakeProp records the rule version, UTC time, floor, equity and relevant market evidence so the event can be reviewed objectively.',
  ],
  [
    'Can I trade news and weekends?',
    'Current challenge rules permit news and weekend trading where the selected market is available. Stale-price exploitation, platform manipulation and other prohibited conduct remain disallowed.',
  ],
  [
    'Is scalping allowed?',
    'Yes on current production challenge rules. Legitimate short-duration trading is not a breach by itself.',
  ],
  [
    'Is a stop loss mandatory?',
    'No on current challenge plans. Traders remain responsible for keeping equity inside all limits.',
  ],
  [
    'Can I use bots or API trading?',
    'Automated strategies are not a violation by themselves. Direct API access may only be used when the feature is enabled; latency abuse, data-feed exploitation, fake fills and simulator manipulation are prohibited.',
  ],
  [
    'What happens after I pass?',
    'The account enters review. After required checks, identity verification and agreement acceptance, an eligible trader can progress to a fresh funded-stage simulated account. Evaluation profit does not carry into that new account.',
  ],
  [
    'When is KYC required?',
    'Identity/compliance verification is intended after passing and before a funded-stage account or monetary performance reward is activated.',
  ],
  [
    'How are performance rewards calculated?',
    'Only newly realized eligible performance can become reward-eligible. High-water-mark accounting prevents previously rewarded gross performance from being counted twice.',
  ],
  [
    'What is the minimum reward request?',
    'Current plan rules use a $50 minimum where rewards are enabled, subject to KYC, compliance, wallet validation and payout-rail availability.',
  ],
  [
    'Can a reward be rejected because I was too profitable?',
    'Profitability alone is not a valid reason. Reviews should be based on disclosed rules, identity/compliance, payment fraud, confirmed account sharing or objectively evidenced platform/trading abuse.',
  ],
  [
    'Which strategies are prohibited?',
    'Examples include stale-price exploitation, latency arbitrage against the platform, bug exploitation, fake fills, identity fraud, account sharing, coordinated opposite-account abuse and attempts to manipulate the simulator.',
  ],
  [
    'How do refunds work?',
    'Refund eligibility follows the published Refund Policy and depends on the order/account state. Duplicate payments and confirmed technical payment errors are handled under that policy.',
  ],
  [
    'Are all countries supported?',
    'No. Availability may be restricted by sanctions, KYC-provider coverage, payment rails or compliance policy.',
  ],
  [
    'How can I contact support?',
    'Use the Support area after signing in or email support@takeprop.trade.',
  ],
] as const

export default async function Home() {
  let plans: PublicPlan[] = []

  try {
    plans = await getPublicData<PublicPlan[]>(
      'challenge_plans?select=slug,name,account_size,price,compare_at_price,profit_target_pct,daily_loss_limit_pct,max_loss_limit_pct,profit_split_pct,min_trading_days,max_trading_days,leverage_ratio,rules&is_active=eq.true&order=sort_order.asc,account_size.asc',
      60,
    )
  } catch {}

  const startPrice = plans.length
    ? Math.min(...plans.map((plan) => Number(plan.price)))
    : null
  const maxSplit = plans.length
    ? Math.max(...plans.map((plan) => Number(plan.profit_split_pct)))
    : 90
  const maxLeverage = plans.length
    ? Math.max(...plans.map((plan) => Number(plan.leverage_ratio)))
    : 100

  const oneStep = plans.find(
    (plan) => (plan.rules?.challenge_type || 'one_step') === 'one_step',
  )
  const twoStep = plans.find(
    (plan) => plan.rules?.challenge_type === 'two_step',
  )

  const dailyLoss = Number(oneStep?.daily_loss_limit_pct || 3)
  const oneStepLoss = Number(oneStep?.max_loss_limit_pct || 6)
  const twoStepLoss = Number(twoStep?.max_loss_limit_pct || 8)
  const phase2Target = Number(
    twoStep?.rules?.phase_2_profit_target_pct ||
      twoStep?.profit_target_pct ||
      8,
  )

  const faq = [
    [
      'How does the 1-Step evaluation work?',
      `Reach the ${Number(
        oneStep?.profit_target_pct || 8,
      )}% realized-profit target without breaching the ${dailyLoss}% daily-loss or ${oneStepLoss}% static maximum-loss rule.`,
    ],
    [
      'How does the 2-Step evaluation work?',
      `Complete Phase 1 at ${Number(
        twoStep?.profit_target_pct || 8,
      )}%, then a fresh Phase 2 at ${phase2Target}%, while respecting the ${dailyLoss}% daily-loss and ${twoStepLoss}% static maximum-loss rules.`,
    ],
    ...commonFaq,
  ] as const

  return (
    <main>
      <div className="notice">
        SIMULATED TRADING <i /> LIVE RULE CATALOG <i /> STATIC DRAWDOWN{' '}
        <i /> UP TO {maxSplit}% PERFORMANCE REWARDS
      </div>

      <header className="nav shell">
        <BrandLogo href="#top" />
        <nav>
          <a href="#how">How it works</a>
          <a href="#plans">Challenges</a>
          <a href="#rules">Rules</a>
          <a href="#rewards">Rewards</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div>
          <a href="/auth">Log in</a>
          <a className="btn small" href="#plans">
            Start challenge
          </a>
        </div>
      </header>

      <section className="hero shell heroPremium" id="top">
        <div>
          <span className="eyebrow">
            ● CRYPTO PROP EVALUATIONS WITH PROVABLE RULES
          </span>
          <h1>
            Prove your edge.
            <br />
            <em>Earn your allocation.</em>
          </h1>
          <p>
            Transparent simulated evaluations with static drawdown, objective
            breach evidence and a live production catalog that stays consistent
            from landing page to checkout.
          </p>

          <div className="actions">
            <a className="btn" href="#plans">
              {startPrice
                ? `Start from ${money(startPrice)} →`
                : 'View challenges →'}
            </a>
            <a href="#rules">Review the rules first</a>
          </div>

          <div className="heroTrust">
            <span>✓ No time pressure</span>
            <span>✓ Static drawdown</span>
            <span>✓ No hidden consistency rule</span>
            <span>✓ Every breach is reviewable</span>
          </div>
        </div>

        <Terminal maxLeverage={maxLeverage} />
      </section>

      <section className="metrics">
        <div className="shell">
          <Metric a={`UP TO ${maxSplit}%`} b="REWARD SPLIT" />
          <Metric a={`${maxLeverage}×`} b="MAX LEVERAGE" />
          <Metric a="0" b="MINIMUM DAYS" />
          <Metric a="24/7" b="CRYPTO MARKETS" />
        </div>
      </section>

      <section className="section shell" id="how">
        <Title
          over="THE PROCESS"
          title={
            <>
              A clear path from evaluation to <em>performance rewards.</em>
            </>
          }
        />
        <div className="processFive">
          <Card n="01" title="Choose your challenge">
            Pick a live plan, account size and evaluation type.
          </Card>
          <Card n="02" title="Prove your edge">
            Reach the target without breaching your fixed account rule snapshot.
          </Card>
          <Card n="03" title="Pass review">
            Account state, closed positions and trading-integrity evidence are
            reviewed.
          </Card>
          <Card n="04" title="Verify & agree">
            Complete KYC/compliance and accept the funded trader agreement.
          </Card>
          <Card n="05" title="Funded simulation">
            Start a fresh funded-stage simulated account and become eligible for
            rewards under the applicable terms.
          </Card>
        </div>
      </section>

      <section className="section dark" id="plans">
        <div className="shell">
          <Title
            over="LIVE CHALLENGE CATALOG"
            title={
              <>
                One catalog. <em>No conflicting prices.</em>
              </>
            }
          />
          <ChallengeSelector plans={plans} />
        </div>
      </section>

      <section className="section shell">
        <Title
          over="WHY TAKEPROP"
          title={
            <>
              Built around <em>clarity, evidence and control.</em>
            </>
          }
        />
        <div className="grid three">
          <Card n="◇" title="Static drawdown">
            The maximum-loss floor is fixed to the original simulated balance.
          </Card>
          <Card n="◎" title="Mark-price risk">
            Risk and unrealized P&amp;L use the platform reference-price
            methodology.
          </Card>
          <Card n="◈" title="Provable breaches">
            Risk events preserve rule, floor, equity, UTC time and market
            context.
          </Card>
          <Card n="$" title="High-water-mark rewards">
            Previously rewarded simulated performance cannot be counted twice.
          </Card>
          <Card n="↗" title="Clear progression">
            Evaluation, review, KYC, agreement and funded-stage transitions are
            recorded.
          </Card>
          <Card n="⚙" title="Operations controls">
            Payments, payouts, KYC, support, users and risk states are auditable
            by authorized staff.
          </Card>
        </div>
      </section>

      <section className="section ruleBand" id="rules">
        <div className="shell">
          <Title
            over="RISK TRANSPARENCY"
            title={
              <>
                Rules that <em>do not move.</em>
              </>
            }
          />
          <div className="riskShowcase">
            <div className="riskNumbers">
              <RuleBlock
                label="DAILY LOSS"
                value={`${dailyLoss}%`}
                text="UTC day-start basis under the account rule snapshot."
              />
              <RuleBlock
                label="1-STEP STATIC LOSS"
                value={`${oneStepLoss}%`}
                text="Static floor anchored to starting balance."
              />
              <RuleBlock
                label="2-STEP STATIC LOSS"
                value={`${twoStepLoss}%`}
                text="Static maximum-loss framework for two-step plans."
              />
            </div>

            <div className="drawdownVisual">
              <span>SIMULATED EQUITY</span>
              <div className="equityLine" />
              <div className="floorLine">
                <b>STATIC FLOOR</b>
              </div>
              <p>
                Profits can rise. The maximum-loss floor does not trail upward.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section shell" id="rewards">
        <div className="rewardGrid">
          <div>
            <span className="eyebrow">PERFORMANCE REWARDS</span>
            <h2>
              Reward only <em>new</em> eligible performance.
            </h2>
            <p>
              High-water-mark accounting tracks previously rewarded gross
              performance so the same simulated profit cannot be rewarded
              twice. Requests remain subject to KYC, compliance, wallet
              validation and trading-integrity review.
            </p>

            <div className="rewardStats">
              <Metric a={`UP TO ${maxSplit}%`} b="PLAN REWARD SPLIT" />
              <Metric a="$50" b="CURRENT MINIMUM" />
              <Metric a="REVIEWED" b="REQUEST LIFECYCLE" />
            </div>
          </div>

          <div className="evidenceCard">
            <small>REVIEW EVIDENCE</small>
            {[
              'Account rule snapshot and stage',
              'Realized performance and reward high-water mark',
              'Identity/compliance status',
              'Wallet and request details',
              'Trading-integrity and risk evidence',
            ].map((item) => (
              <span key={item}>✓ {item}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="cta shell">
        <span>READY TO PROVE YOUR EDGE?</span>
        <h2>Every core rule visible before you start.</h2>
        <p>Live prices and plan terms come from the production challenge catalog.</p>
        <a className="btn" href="#plans">
          View challenge plans →
        </a>
      </section>

      <section className="section shell faq" id="faq">
        <Title
          over="FAQ"
          title={
            <>
              Detailed answers. <em>No fine-print games.</em>
            </>
          }
        />
        {faq.map(([question, answer]) => (
          <details key={question}>
            <summary>
              {question}
              <b>+</b>
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </section>

      <footer>
        <div className="shell foot">
          <div>
            <BrandLogo href="#top" />
            <p>Trade Crypto. Prove Your Edge. Get Funded.</p>
            <small>SIMULATED TRADING EVALUATIONS</small>
          </div>
          <div>
            <strong>Product</strong>
            <a href="#plans">Challenges</a>
            <a href="#rules">Rules</a>
            <a href="#rewards">Rewards</a>
            <a href="/dashboard">Dashboard</a>
          </div>
          <div>
            <strong>Support</strong>
            <a href="#faq">FAQ</a>
            <a href="/support">Support center</a>
            <a href="mailto:support@takeprop.trade">support@takeprop.trade</a>
            <a href="/api/health">System health</a>
          </div>
          <div>
            <strong>Legal</strong>
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
            <a href="/refund-policy">Refund policy</a>
            <a href="/risk-disclosure">Risk disclosure</a>
            <a href="/aml-kyc">AML / KYC</a>
          </div>
        </div>

        <div className="shell legal">
          © 2026 TakeProp. Simulated trading evaluations and funded-stage
          simulated accounts only. Customer trading capital is not accepted and
          customer orders are not routed to an exchange. Performance rewards
          are subject to eligibility, identity/compliance checks, review and
          agreement. Nothing on this site is investment advice or brokerage
          services.
        </div>
      </footer>
    </main>
  )
}
function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function Title({
  over,
  title,
}: {
  over: string
  title: React.ReactNode
}) {
  return (
    <div className="title">
      <span>{over}</span>
      <h2>{title}</h2>
    </div>
  )
}
function Metric({ a, b }: { a: string; b: string }) {
  return (
    <div>
      <b>{a}</b>
      <span>{b}</span>
    </div>
  )
}

function Card({
  n,
  title,
  children,
}: {
  n: string
  title: string
  children: React.ReactNode
}) {
  return (
    <article>
      <b>{n}</b>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  )
}

function RuleBlock({
  label,
  value,
  text,
}: {
  label: string
  value: string
  text: string
}) {
  return (
    <article>
      <small>{label}</small>
      <b>{value}</b>
      <p>{text}</p>
    </article>
  )
}

function Terminal({ maxLeverage }: { maxLeverage: number }) {
  return (
    <div className="terminal premiumTerminal">
      <header>
        <span>● TAKEPROP TERMINAL</span>
        <b>SIMULATED</b>
      </header>

      <div className="quoteStrip">
        <div>
          <small>LAST</small>
          <b>64,286.40</b>
        </div>
        <div>
          <small>INDEX</small>
          <b>64,301.10</b>
        </div>
        <div>
          <small>MARK</small>
          <b className="green">64,294.80</b>
        </div>
      </div>

      <div className="market">
        <small>BTC / USDT</small>
        <strong>$64,294.80</strong>
        <em>+2.84%</em>
        <div className="chart">▂▃▂▄▅▄▆▇▆█</div>
      </div>

      <div className="tstats">
        <div>
          <small>BALANCE</small>
          <b>$25,000.00</b>
        </div>
        <div>
          <small>EQUITY</small>
          <b>$25,482.60</b>
        </div>
        <div>
          <small>RISK STATE</small>
          <b className="green">SAFE</b>
        </div>
      </div>

      <div className="progress">
        <span>
          Evaluation progress <b>60%</b>
        </span>
        <i>
          <b />
        </i>
        <small>
          Illustrative terminal preview · up to {maxLeverage}× by current plan
          catalog
        </small>
      </div>

      <div className="trade">
        <button>LONG</button>
        <button>SHORT</button>
      </div>
    </div>
  )
}
