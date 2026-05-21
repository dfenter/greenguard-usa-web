import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { findContactByEmail } from '../../lib/hubspot'
import { getBookingsForEmail } from '../../lib/calcom'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }

  const contact = await findContactByEmail(session.email).catch(() => null)
  const p = contact?.properties || {}

  const trapCount = p.trap_count ? parseInt(p.trap_count, 10) : 0
  const tankCount = p.tank_count ? parseInt(p.tank_count, 10) : 0
  const installDate = p.service_start_date || null
  const systemType = p.system_type || null
  const hasTimer = p.has_timer === 'true'

  const usesC02 = systemType === 'Biogents-CO2' || systemType === 'Mosqitter'
  const tanksPerMonth = usesC02 ? trapCount : 0

  let nextRefillDate = null
  if (installDate && usesC02) {
    const install = new Date(installDate)
    const now = new Date()
    const monthsSince = (now.getFullYear() - install.getFullYear()) * 12 + (now.getMonth() - install.getMonth())
    const nextRefill = new Date(install)
    nextRefill.setMonth(nextRefill.getMonth() + monthsSince + 1)
    nextRefillDate = nextRefill.toISOString()
  }

  // Tank level indicator — find last past Cal.com booking
  let tankPctRemaining = null
  let tankDaysRemaining = null
  let lastVisitDate = null

  if (usesC02) {
    // Prefer last_visit_date from HubSpot (set by tech visit completion tool)
    const lastVisitStr = p.last_visit_date || null
    let lastVisitMs = null

    if (lastVisitStr) {
      lastVisitMs = new Date(lastVisitStr).getTime()
    } else {
      // Fall back to Cal.com booking history
      try {
        const bookings = await getBookingsForEmail(session.email)
        const now = Date.now()
        const pastBookings = bookings
          .filter((b) => new Date(b.startTime).getTime() < now)
          .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
        if (pastBookings.length > 0) {
          lastVisitMs = new Date(pastBookings[0].startTime).getTime()
        }
      } catch {
        // Cal.com not configured — skip tank level
      }
    }

    if (lastVisitMs) {
      lastVisitDate = new Date(lastVisitMs).toISOString()
      // Cycle length: Mosqitter = 28d, Biogents+timer = 28d, Biogents-no timer = 20d
      const cycleDays = systemType === 'Mosqitter' ? 28 : hasTimer ? 28 : 20
      const daysSinceVisit = (Date.now() - lastVisitMs) / 86400000
      tankDaysRemaining = Math.max(0, Math.round(cycleDays - daysSinceVisit))
      tankPctRemaining = Math.max(0, Math.round((cycleDays - daysSinceVisit) / cycleDays * 100))
    }
  }

  return {
    props: {
      systemType,
      trapCount,
      tankCount,
      tanksPerMonth,
      nextRefillDate,
      usesC02,
      hasTimer,
      tankPctRemaining,
      tankDaysRemaining,
      lastVisitDate,
      isAdmin: session.email === 'admin@greenguard-usa.com',
    },
  }
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function TankLevelBar({ pct }) {
  const color = pct < 20 ? '#ff4444' : pct < 40 ? '#c9a84c' : '#7dffaa'
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.82rem' }}>
        <span style={{ color: 'rgba(212,230,202,0.6)' }}>Tank level</span>
        <span style={{ color, fontWeight: 800 }}>{pct}%</span>
      </div>
      <div style={{ height: 12, background: 'rgba(212,230,202,0.1)', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: 6,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  )
}

export default function Co2Status({ systemType, trapCount, tankCount, tanksPerMonth, nextRefillDate, usesC02, hasTimer, tankPctRemaining, tankDaysRemaining, lastVisitDate, isAdmin }) {
  return (
    <>
      <Head><title>CO₂ Status · GreenGuard</title></Head>
      <PortalLayout title="CO₂ Status" isAdmin={isAdmin}>
        {!usesC02 ? (
          <div className="card" style={{ maxWidth: 480 }}>
            <p style={{ color: 'rgba(212,230,202,0.6)', margin: 0 }}>
              Your system ({systemType || 'Non-CO₂'}) does not use CO₂ tanks.
            </p>
          </div>
        ) : (
          <>
            {/* Low tank warning */}
            {tankPctRemaining !== null && tankPctRemaining < 20 && (
              <div style={{
                background: 'rgba(255,68,68,0.12)',
                border: '1px solid rgba(255,68,68,0.4)',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 20,
                color: '#ff8888',
                fontWeight: 700,
                fontSize: '0.9rem',
              }}>
                ⚠ Tank level is low — your technician will be in touch to schedule a refill.
              </div>
            )}

            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', maxWidth: 700 }}>
              {/* Tank Level Card */}
              <div className="card" style={{ gridColumn: 'span 2' }}>
                <span className="tag">Current Tank Level</span>
                {tankPctRemaining !== null ? (
                  <>
                    <TankLevelBar pct={tankPctRemaining} />
                    <div style={{ marginTop: 10, fontSize: '0.85rem', color: 'rgba(212,230,202,0.6)' }}>
                      {tankDaysRemaining > 0
                        ? `~${tankDaysRemaining} day${tankDaysRemaining !== 1 ? 's' : ''} remaining`
                        : 'Tank likely empty — contact us to schedule a refill'}
                    </div>
                    {lastVisitDate && (
                      <div style={{ marginTop: 4, fontSize: '0.78rem', color: 'rgba(212,230,202,0.35)' }}>
                        Last visit: {fmtDate(lastVisitDate)}
                        {systemType === 'Biogents-CO2' && (
                          <> · {hasTimer ? '28-day' : '20-day'} cycle</>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p style={{ marginTop: 12, color: 'rgba(212,230,202,0.45)', fontSize: '0.88rem', margin: '12px 0 0' }}>
                    No visit recorded yet — level will appear after your first service.
                  </p>
                )}
              </div>

              <div className="card">
                <span className="tag">Tanks in Field</span>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, lineHeight: 1 }}>{tankCount}</div>
                <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.5)', marginTop: 6 }}>× 20 lb canisters</div>
              </div>

              <div className="card">
                <span className="tag">Monthly Usage</span>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, lineHeight: 1 }}>{tanksPerMonth}</div>
                <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.5)', marginTop: 6 }}>
                  tank{tanksPerMonth !== 1 ? 's' : ''}/month ({trapCount} trap{trapCount !== 1 ? 's' : ''})
                </div>
              </div>

              {nextRefillDate && (
                <div className="card" style={{ gridColumn: 'span 2' }}>
                  <span className="tag">Est. Next Refill</span>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{fmtDate(nextRefillDate)}</div>
                  <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.5)', marginTop: 6 }}>
                    Approximate — your technician will contact you to confirm
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <p style={{ marginTop: 28, fontSize: '0.83rem', color: 'rgba(212,230,202,0.4)' }}>
          Questions about your CO₂ service?{' '}
          <a href="mailto:hello@greenguard-usa.com" style={{ color: '#7aab82' }}>Email us</a>
        </p>
      </PortalLayout>
    </>
  )
}
