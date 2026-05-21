import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { findContactByEmail } from '../../lib/hubspot'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }

  const contact = await findContactByEmail(session.email).catch(() => null)
  const p = contact?.properties || {}

  const trapCount = p.trap_count ? parseInt(p.trap_count, 10) : 0
  const tankCount = p.tank_count ? parseInt(p.tank_count, 10) : 0
  const installDate = p.service_start_date || null
  const systemType = p.system_type || null

  // CO₂ systems use 1 × 20 lb tank per trap per month (30-day cycle)
  const usesC02 = systemType === 'Biogents-CO2' || systemType === 'Mosqitter'
  const tanksPerMonth = usesC02 ? trapCount : 0

  // Estimate next refill from install date (approx monthly cadence)
  let nextRefillDate = null
  if (installDate && usesC02) {
    const install = new Date(installDate)
    const now = new Date()
    const monthsSince = (now.getFullYear() - install.getFullYear()) * 12 + (now.getMonth() - install.getMonth())
    const nextRefill = new Date(install)
    nextRefill.setMonth(nextRefill.getMonth() + monthsSince + 1)
    nextRefillDate = nextRefill.toISOString()
  }

  return {
    props: {
      systemType,
      trapCount,
      tankCount,
      tanksPerMonth,
      nextRefillDate,
      usesC02,
      isAdmin: session.email === 'admin@greenguard-usa.com',
    },
  }
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export default function Co2Status({ systemType, trapCount, tankCount, tanksPerMonth, nextRefillDate, usesC02, isAdmin }) {
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
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', maxWidth: 640 }}>
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
        )}

        <p style={{ marginTop: 28, fontSize: '0.83rem', color: 'rgba(212,230,202,0.4)' }}>
          Questions about your CO₂ service?{' '}
          <a href="mailto:hello@greenguard-usa.com" style={{ color: '#7aab82' }}>Email us</a>
        </p>
      </PortalLayout>
    </>
  )
}
