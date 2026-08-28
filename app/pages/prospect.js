import Head from 'next/head'
import PortalLayout from '../components/PortalLayout'
import { getSessionFromRequest } from '../lib/auth'
const biz = require('../lib/business.config')

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }

  return {
    props: {
      email: session.email,
      name: session.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    }
  }
}

export default function ProspectPage({ email, name }) {
  const services = [
    { label: 'Biogents CO₂ Rental — 1 Trap', price: '$159.99/mo', desc: 'Perfect for standard Austin residential lots. All-inclusive — tank exchanges, maintenance, and seasonal adjustments.', slug: 'biogents-co2-1' },
    { label: 'CO₂ Tank Delivery', price: 'From $89.99/mo', desc: 'Already own a Biogents trap? We deliver and exchange your 20lb CO₂ tanks on a monthly schedule.', slug: 'tank-exchange-1' },
    { label: 'Free Property Assessment', price: 'Free', desc: 'We evaluate your property, identify breeding zones, and recommend the right trap placement.', slug: 'property-assessment' },
  ]

  const s = { display: 'block', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(var(--gold-rgb),0.7)', marginBottom: 8 }

  return (
    <>
      <Head><title>Your GreenGuard Proposal · GreenGuard USA</title></Head>
      <PortalLayout>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          {/* Welcome */}
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 10 }}>Welcome</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(1.8rem,3.4vw,2.4rem)', margin: '0 0 12px' }}>
              {name ? `Hi ${name.split(' ')[0]},` : 'Welcome to GreenGuard USA'}
            </h1>
            <p style={{ fontSize: '1rem', color: 'var(--text-muted)', lineHeight: 1.7, margin: 0 }}>
              Thank you for your interest in pesticide-free CO₂ mosquito control. Here&apos;s how we can protect your Austin property.
            </p>
          </div>

          {/* Why GreenGuard */}
          <div className="card" style={{ marginBottom: 28, background: 'rgba(var(--gold-rgb),0.04)', borderColor: 'rgba(var(--gold-rgb),0.2)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 20 }}>
              {[
                { stat: '93%', label: 'Bite reduction' },
                { stat: '100%', label: 'Pesticide-free' },
                { stat: '100+', label: 'Austin families' },
                { stat: '5★', label: 'Google reviews' },
              ].map(({ stat, label }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--gold)', lineHeight: 1 }}>{stat}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Services */}
          <div style={{ marginBottom: 10 }}>
            <span style={s}>Recommended for you</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 40 }}>
            {services.map((svc) => (
              <div key={svc.slug} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: 4 }}>{svc.label}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--gold)', marginBottom: 8 }}>{svc.price}</div>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.65 }}>{svc.desc}</p>
                </div>
                <a href={`https://cal.com/greenguard-usa/${svc.slug}`} target="_blank" rel="noopener noreferrer"
                  style={{ flexShrink: 0, padding: '10px 20px', borderRadius: 8, background: 'var(--gold)', color: 'var(--text-on-accent)', fontWeight: 900, fontSize: '0.85rem', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  Book →
                </a>
              </div>
            ))}
          </div>

          {/* Contact */}
          <div className="card" style={{ textAlign: 'center', borderColor: 'rgba(var(--border-rgb),0.12)' }}>
            <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: 8 }}>Questions? We&apos;re local.</div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-dim)', margin: '0 0 16px', lineHeight: 1.6 }}>
              Call or text us directly. We serve Austin and surrounding areas.
            </p>
            <a href="tel:+15125604129" style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--green)', textDecoration: 'none' }}>512-560-4129</a>
            <div style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              <a href={`mailto:${biz.email}`} style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>{biz.email}</a>
            </div>
          </div>
        </div>
      </PortalLayout>
    </>
  )
}
