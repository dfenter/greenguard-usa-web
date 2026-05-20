import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { findContactByEmail } from '../../lib/hubspot'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }

  const contact = await findContactByEmail(session.email).catch(() => null)
  const p = contact?.properties || {}

  return {
    props: {
      systemType: p.system_type || null,
      trapCount: p.trap_count ? parseInt(p.trap_count, 10) : null,
      tankCount: p.tank_count ? parseInt(p.tank_count, 10) : null,
      hasTimer: p.has_timer === 'true',
      customerType: p.customer_type || null,
      installDate: p.service_start_date || null,
    },
  }
}

function Detail({ label, value }) {
  if (!value && value !== 0) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(122,171,130,0.12)' }}>
      <span style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.55)' }}>{label}</span>
      <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{value}</span>
    </div>
  )
}

export default function Equipment({ systemType, trapCount, tankCount, hasTimer, customerType, installDate }) {
  const typeLabel = {
    'Biogents-CO2': 'Biogents CO₂ Trap',
    'Biogents-NonCO2': 'Biogents (Non-CO₂)',
    Mosqitter: 'Mosqitter Grand',
    'Tank-Only': 'CO₂ Delivery Only',
  }[systemType] || systemType || 'Not on file'

  return (
    <>
      <Head><title>My System · GreenGuard</title></Head>
      <PortalLayout title="My System">
        <div className="card" style={{ maxWidth: 520 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 10,
              background: 'rgba(125,255,170,0.1)', border: '1px solid rgba(125,255,170,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.4rem',
            }}>
              🪤
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>{typeLabel}</div>
              <div className="badge badge-green" style={{ marginTop: 4 }}>
                {customerType === 'rental' ? 'Rental' : 'Owned'}
              </div>
            </div>
          </div>

          <Detail label="Trap count" value={trapCount ? `${trapCount} trap${trapCount !== 1 ? 's' : ''}` : null} />
          <Detail label="CO₂ tanks" value={tankCount ? `${tankCount} × 20 lb` : null} />
          <Detail label="Timer installed" value={hasTimer ? 'Yes' : 'No'} />
          <Detail label="Service start" value={installDate ? new Date(installDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null} />
        </div>

        <p style={{ marginTop: 24, fontSize: '0.83rem', color: 'rgba(212,230,202,0.45)' }}>
          Need to update your equipment info?{' '}
          <a href="mailto:hello@greenguard-usa.com" style={{ color: '#7aab82' }}>Contact us</a>
        </p>
      </PortalLayout>
    </>
  )
}
