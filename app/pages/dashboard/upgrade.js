import { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { getSessionFromRequest } from '../../lib/auth'
import { findContactByEmail } from '../../lib/hubspot'

function fmt$(n) { return `$${Number(n).toFixed(2)}` }

// ── Pricing constants (mirrors quote builder) ──────────────────────────────────
const BG_RENTAL = { 1: 159.99, 2: 266.99, 3: 399.99, 4: 500, 5: 625, 6: 750 }
const MQ_RENTAL = 299.99
const BARRIER    = 49.99
const BG_INSTALL = 80.00
const MQ_INSTALL = 199.99

// ── Upgrade catalog keyed by current plan ──────────────────────────────────────
// Each entry describes what a logged-in customer currently has and what they
// can add. `monthlyDelta` is the increase; `oneTime` lists installation /
// equipment charges due at the first service visit.

function buildUpgrades({ pathKey, trapCount, systemType }) {
  const tc = parseInt(trapCount, 10) || 1
  const isBG  = systemType === 'Biogents-CO2' || systemType === 'Biogents'
  const isMQ  = systemType === 'Mosqitter-Grand' || systemType === 'Mosqitter' || systemType === 'MQ-RENT'
  const isBGOwned = systemType === 'Biogents-Owned'

  const upgrades = []

  // ── Biogents rental customers — add one trap at a time up to 6 ─────────────
  if ((isBG || isBGOwned) && tc < 6) {
    const currentMonthly = isBGOwned ? 124.99 : (BG_RENTAL[tc] || BG_RENTAL[1])
    const nextCount = tc + 1
    const newMonthly = BG_RENTAL[nextCount]
    const ordinals = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth']
    const title = `Add a ${ordinals[nextCount] || nextCount + 'th'} Biogents CO₂ Trap`
    const taglines = {
      2: 'Double your coverage. Ideal for ½-acre+ lots or multiple outdoor zones.',
      3: 'Three-zone coverage at the best per-trap rate.',
      4: 'Four traps for large properties or full perimeter coverage.',
      5: 'Five-trap setup for large estates and heavily wooded lots.',
      6: 'Maximum coverage — six traps for the largest properties.',
    }
    const images = {
      2: '/images/mosquitairedouble.webp',
      3: '/images/biogentstriple.webp',
    }
    upgrades.push({
      id: 'add-biogents-trap',
      title,
      tagline: taglines[nextCount] || `Expand to ${nextCount} traps for greater coverage.`,
      image: images[nextCount] || '/images/biogentstriple.png',
      currentMonthly,
      newMonthly,
      monthlyDelta: newMonthly - currentMonthly,
      oneTime: [{ label: 'Trap installation & placement', amount: BG_INSTALL }],
      serviceLines: [
        { label: `Biogents CO₂ Rental — ${nextCount} Trap${nextCount > 1 ? 's' : ''}`, amount: newMonthly, recurring: true },
      ],
      includes: [
        `${nextCount} CO₂ trap rentals`,
        'CO₂ tank & monthly refills included',
        'Monthly service visit (all traps)',
        'Trap warranty & replacement coverage',
        'Free placement consultation',
      ],
      badge: nextCount === 2 ? 'Most Popular' : null,
      badgeColor: 'var(--green)',
    })
  }

  // ── Add Mosqitter Grand as a second zone ───────────────────────────────────
  if (isBG || isBGOwned) {
    const currentMonthly = isBGOwned ? 124.99 : (BG_RENTAL[tc] || BG_RENTAL[1])
    upgrades.push({
      id: 'add-mosqitter-grand',
      title: 'Add a Mosqitter Grand',
      tagline: 'Extend coverage with a premium stainless steel trap. Up to 2 acres per unit.',
      image: '/images/prod-mosqitter-grand.jpg',
      currentMonthly,
      newMonthly: currentMonthly + MQ_RENTAL,
      monthlyDelta: MQ_RENTAL,
      oneTime: [{ label: 'Mosqitter installation & commissioning', amount: MQ_INSTALL }],
      serviceLines: [
        { label: 'Existing Biogents service (unchanged)', amount: currentMonthly, recurring: true },
        { label: 'Mosqitter Grand Rental — trap, CO₂, bait & maintenance', amount: MQ_RENTAL, recurring: true },
      ],
      includes: [
        'Your existing Biogents trap continues as-is',
        'Mosqitter Grand: 304 stainless steel, 125W system',
        'Up to 2-acre coverage per unit',
        'Bluetooth app monitoring',
        'CO₂, bait & monthly maintenance included',
      ],
      badge: 'Premium',
      badgeColor: 'var(--gold)',
    })
  }

  // ── Mosqitter customers: add a second Mosqitter ───────────────────────────
  if (isMQ) {
    upgrades.push({
      id: 'add-second-mosqitter',
      title: 'Add a Second Mosqitter Grand',
      tagline: 'Two units for large estates or separated outdoor zones.',
      image: '/images/prod-mosqitter-grand.jpg',
      currentMonthly: MQ_RENTAL,
      newMonthly: MQ_RENTAL * 2,
      monthlyDelta: MQ_RENTAL,
      oneTime: [{ label: 'Second Mosqitter installation', amount: MQ_INSTALL }],
      serviceLines: [
        { label: 'Mosqitter Grand Rental ×2', amount: MQ_RENTAL * 2, recurring: true },
      ],
      includes: [
        'Two Mosqitter Grand units',
        'Up to 4 acres total coverage',
        'CO₂, bait & maintenance for both units',
        'Bluetooth app monitors both traps',
        'Recommended for 1+ acre properties',
      ],
      badge: null,
    })
  }

  // ── Barrier treatment — available to everyone ─────────────────────────────
  const anyMonthly = isMQ ? MQ_RENTAL : isBGOwned ? 124.99 : (BG_RENTAL[tc] || BG_RENTAL[1])
  upgrades.push({
    id: 'add-barrier',
    title: 'Add Barrier Treatment',
    tagline: 'A second layer of defense for heavily shaded yards and dense vegetation.',
    image: null,
    currentMonthly: anyMonthly,
    newMonthly: anyMonthly + BARRIER,
    monthlyDelta: BARRIER,
    oneTime: [],
    serviceLines: [
      { label: 'Barrier treatment (applied each monthly visit)', amount: BARRIER, recurring: true },
    ],
    includes: [
      'Monthly perimeter barrier application',
      'Targets resting mosquitoes outside trap zones',
      'Applied to shrubs, hedges, and structure perimeters',
      'No additional service visit needed — added to existing stop',
      'No installation charge',
    ],
    badge: null,
  })

  return upgrades
}

// ── Current plan label ────────────────────────────────────────────────────────
function currentPlanLabel(systemType, trapCount) {
  const tc = parseInt(trapCount, 10) || 1
  if (systemType === 'Mosqitter-Grand' || systemType === 'Mosqitter' || systemType === 'MQ-RENT') {
    return { label: 'Mosqitter Grand Rental', monthly: MQ_RENTAL }
  }
  if (systemType === 'Biogents-Owned') {
    return { label: 'CO₂ Tank & Service (owned trap)', monthly: 124.99 }
  }
  if (systemType === 'Biogents-CO2' || systemType === 'Biogents') {
    return { label: `Biogents CO₂ Rental — ${tc} Trap${tc > 1 ? 's' : ''}`, monthly: BG_RENTAL[tc] || null }
  }
  return { label: 'Current Service Plan', monthly: null }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const PAGE_BG   = 'var(--bg)'
const CARD      = { background: 'var(--bg-card)', border: '1px solid rgba(var(--border-rgb),0.18)', borderRadius: 12, padding: 28, marginBottom: 20 }
const EYEBROW   = { fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(var(--gold-rgb),0.7)', marginBottom: 8, display: 'block' }
const TEXT_MUTED = { color: 'var(--text-dim)' }

export default function UpgradePage({ name, firstName, systemType, trapCount, upgrades, currentPlan }) {
  const [requested, setRequested] = useState({})   // upgradeId → true
  const [loading,   setLoading]   = useState({})
  const [error,     setError]     = useState({})

  async function requestUpgrade(u) {
    setLoading(l => ({ ...l, [u.id]: true }))
    setError(e => ({ ...e, [u.id]: null }))
    try {
      const res = await fetch('/api/customer/request-upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upgradeId: u.id, upgradeTitle: u.title, monthlyDelta: u.monthlyDelta, oneTime: u.oneTime }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Request failed')
      setRequested(r => ({ ...r, [u.id]: true }))
    } catch (e) {
      setError(err => ({ ...err, [u.id]: e.message || 'Something went wrong. Call 512-560-4129.' }))
    }
    setLoading(l => ({ ...l, [u.id]: false }))
  }

  return (
    <>
      <Head>
        <title>Upgrade Your Service · GreenGuard USA</title>
        <meta name="robots" content="noindex" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: PAGE_BG, color: 'var(--text)', paddingBottom: 80 }}>

        {/* ── Header ── */}
        <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid rgba(var(--border-rgb),0.15)', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>
              Green<span style={{ color: 'var(--green)' }}>Guard</span> USA
            </div>
            <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Smart · Safe · Effective</div>
          </div>
          <Link href="/dashboard" style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textDecoration: 'none' }}>← My Dashboard</Link>
        </div>

        <div style={{ maxWidth: 720, margin: '0 auto', padding: '44px 24px 0' }}>

          {/* ── Title ── */}
          <div style={{ marginBottom: 36 }}>
            <span style={EYEBROW}>Upgrade Your Service</span>
            <h1 style={{ fontSize: 'clamp(1.7rem,3.5vw,2.4rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 10px', lineHeight: 1.15 }}>
              {firstName ? `${firstName}, expand your` : 'Expand your'}{' '}
              <span style={{ color: 'var(--green)' }}>mosquito-free zone.</span>
            </h1>
            <p style={{ fontSize: '1rem', ...TEXT_MUTED, margin: 0, lineHeight: 1.65 }}>
              Add a system, extend your coverage, or layer in additional protection. Pricing is exactly what you see below — no surprises.
            </p>
          </div>

          {/* ── Current Plan ── */}
          {currentPlan && (
            <div style={{ ...CARD, background: 'rgba(var(--border-rgb),0.04)', border: '1px solid rgba(var(--border-rgb),0.2)', marginBottom: 32 }}>
              <span style={EYEBROW}>Your Current Service</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text)', marginBottom: 4 }}>{currentPlan.label}</div>
                  <div style={{ fontSize: '0.85rem', ...TEXT_MUTED }}>Active plan · billed monthly after each service visit</div>
                </div>
                {currentPlan.monthly != null && (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--green)', lineHeight: 1 }}>{fmt$(currentPlan.monthly)}</div>
                    <div style={{ fontSize: '0.72rem', ...TEXT_MUTED, marginTop: 2 }}>/month</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Upgrade cards ── */}
          <span style={{ ...EYEBROW, marginBottom: 20 }}>Available Upgrades</span>

          {upgrades.map((u) => {
            const done = !!requested[u.id]
            const busy = !!loading[u.id]
            const err  = error[u.id]
            const totalOneTime = u.oneTime.reduce((s, x) => s + x.amount, 0)

            return (
              <div key={u.id} style={{ ...CARD, padding: 0, overflow: 'hidden', marginBottom: 24 }}>

                {/* Card header */}
                <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(var(--border-rgb),0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                        {u.badge && (
                          <span style={{ fontSize: '0.62rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 100, background: u.badgeColor === 'var(--gold)' ? 'rgba(var(--gold-rgb),0.1)' : 'rgba(var(--green-rgb),0.1)', border: `1px solid ${u.badgeColor === 'var(--gold)' ? 'rgba(var(--gold-rgb),0.35)' : 'rgba(var(--green-rgb),0.35)'}`, color: u.badgeColor }}>
                            {u.badge}
                          </span>
                        )}
                      </div>
                      <h2 style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text)', margin: '0 0 6px', lineHeight: 1.25 }}>{u.title}</h2>
                      <p style={{ margin: 0, fontSize: '0.875rem', ...TEXT_MUTED, lineHeight: 1.6 }}>{u.tagline}</p>
                    </div>
                    {u.image && (
                      <div style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 10, overflow: 'hidden', background: 'var(--bg-card)', border: '1px solid rgba(var(--border-rgb),0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={u.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Cost breakdown */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', borderBottom: '1px solid rgba(var(--border-rgb),0.1)' }}>

                  {/* Before */}
                  <div style={{ padding: '20px 28px', borderRight: '1px solid rgba(var(--border-rgb),0.1)' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 10 }}>Monthly — Now</div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-dim)', lineHeight: 1 }}>{fmt$(u.currentMonthly)}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 4 }}>/month</div>
                  </div>

                  {/* After */}
                  <div style={{ padding: '20px 28px' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 10 }}>Monthly — After Upgrade</div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--green)', lineHeight: 1 }}>{fmt$(u.newMonthly)}</div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(var(--green-rgb),0.45)', marginTop: 4 }}>
                      +{fmt$(u.monthlyDelta)}/month
                    </div>
                  </div>
                </div>

                {/* Monthly service lines */}
                <div style={{ padding: '18px 28px', borderBottom: '1px solid rgba(var(--border-rgb),0.1)' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(var(--gold-rgb),0.6)', marginBottom: 12 }}>Monthly Service</div>
                  {u.serviceLines.map((l, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < u.serviceLines.length - 1 ? '1px solid rgba(var(--border-rgb),0.07)' : 'none', fontSize: '0.875rem' }}>
                      <span style={{ ...TEXT_MUTED }}>{l.label}</span>
                      <span style={{ fontWeight: 800, color: 'var(--green)' }}>{fmt$(l.amount)}/mo</span>
                    </div>
                  ))}
                </div>

                {/* One-time costs */}
                {u.oneTime.length > 0 && (
                  <div style={{ padding: '18px 28px', borderBottom: '1px solid rgba(var(--border-rgb),0.1)', background: 'rgba(var(--info-rgb),0.03)' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(var(--info-rgb),0.7)', marginBottom: 12 }}>One-Time at First Service Visit</div>
                    {u.oneTime.map((l, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: '0.875rem' }}>
                        <span style={{ ...TEXT_MUTED }}>{l.label}</span>
                        <span style={{ fontWeight: 800, color: 'var(--info)' }}>{fmt$(l.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* What's included */}
                <div style={{ padding: '18px 28px', borderBottom: '1px solid rgba(var(--border-rgb),0.1)' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 12 }}>What&apos;s Included</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px 16px' }}>
                    {u.includes.map((item, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.84rem' }}>
                        <span style={{ color: 'var(--green)', flexShrink: 0, marginTop: 2 }}>✓</span>
                        <span style={{ ...TEXT_MUTED, lineHeight: 1.5 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary + CTA */}
                <div style={{ padding: '20px 28px', background: 'var(--bg-alt)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: '0.8rem', ...TEXT_MUTED, marginBottom: 2 }}>Total cost to upgrade</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text)' }}>
                          +{fmt$(u.monthlyDelta)}<span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', marginLeft: 2 }}>/mo</span>
                        </span>
                        {totalOneTime > 0 && (
                          <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--info)' }}>+ {fmt$(totalOneTime)} one-time</span>
                        )}
                      </div>
                    </div>

                    {done ? (
                      <div style={{ padding: '12px 24px', borderRadius: 8, background: 'rgba(var(--green-rgb),0.08)', border: '1px solid rgba(var(--green-rgb),0.3)', textAlign: 'center' }}>
                        <div style={{ fontWeight: 900, color: 'var(--green)', fontSize: '0.9rem' }}>✓ Request sent</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 2 }}>We&apos;ll reach out within 24 hours</div>
                      </div>
                    ) : (
                      <button
                        onClick={() => requestUpgrade(u)}
                        disabled={busy}
                        style={{
                          padding: '13px 28px', borderRadius: 8, border: 'none',
                          background: busy ? 'rgba(var(--green-rgb),0.15)' : 'var(--green)',
                          color: busy ? 'var(--text-dim)' : 'var(--text-on-accent)',
                          fontWeight: 900, fontSize: '0.9rem', cursor: busy ? 'wait' : 'pointer',
                          letterSpacing: '-0.01em', whiteSpace: 'nowrap',
                          transition: 'opacity 0.15s', opacity: busy ? 0.7 : 1,
                        }}
                      >
                        {busy ? 'Sending…' : 'Request This Upgrade'}
                      </button>
                    )}
                  </div>

                  {err && (
                    <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(var(--danger-rgb),0.08)', border: '1px solid rgba(var(--danger-rgb),0.2)', color: 'var(--danger)', fontSize: '0.82rem' }}>
                      {err}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* ── Footer ── */}
          <div style={{ textAlign: 'center', paddingTop: 16 }}>
            <p style={{ fontSize: '0.85rem', ...TEXT_MUTED, marginBottom: 8 }}>
              Questions? Call or text <a href="tel:+15125604129" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 700 }}>512-560-4129</a>
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              Requesting an upgrade notifies our team. We&apos;ll confirm availability and schedule your first upgraded service visit within 24 hours. No charges until service begins.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }

  const contact = await findContactByEmail(session.email).catch(() => null)
  const p = contact?.properties || {}

  const systemType = p.system_type || null
  const trapCount  = parseInt(p.trap_count || '1', 10) || 1
  const firstName  = p.firstname || null
  const name       = [p.firstname, p.lastname].filter(Boolean).join(' ') || null

  const currentPlan = systemType ? currentPlanLabel(systemType, trapCount) : null
  const upgrades    = buildUpgrades({ systemType, trapCount })

  return { props: { name, firstName, systemType, trapCount, currentPlan, upgrades } }
}
