import Head from 'next/head'
import Link from 'next/link'
import GtmLayout from '../../components/gtm/GtmLayout'
import { gtmServerSideProps } from '../../lib/gtm-page'

export const getServerSideProps = gtmServerSideProps()

const LINKS = [
  { href: '/gtm/plan', label: 'Plan', desc: '90-day sprint, read section by section.' },
  { href: '/gtm/timeline', label: 'Timeline', desc: 'Day-range phases at a glance.' },
  { href: '/gtm/training', label: 'Training', desc: 'SE training, quiz, price cheat sheet.' },
  { href: '/gtm/targets', label: 'Targets', desc: '31 firms, scoring, approval status.' },
  { href: '/gtm/outreach', label: 'Outreach', desc: 'First email, sequence, touch rules.' },
  { href: '/gtm/discovery', label: 'Discovery', desc: 'Call script and structured report.' },
  { href: '/gtm/objections', label: 'Objections', desc: 'The objection library.' },
  { href: '/gtm/competitive', label: 'Competitive', desc: 'Living competitive cheat sheet.' },
  { href: '/gtm/reports', label: 'Reports', desc: 'Weekly report, KPI dashboard, reviews.' },
  { href: '/gtm/site', label: 'Site pages', desc: 'Compare, Architecture, Pricing, Benchmarks.' },
  { href: '/gtm/partners', label: 'Partners', desc: 'Partner program terms.' },
  { href: '/gtm/internal', label: 'Internal', desc: 'Internal-only, not for prospects.' },
]

export default function GtmDashboard({ session }) {
  return (
    <GtmLayout title="GTM Dashboard" session={session}>
      <Head><title>GTM Dashboard — GreenGuard USA</title></Head>
      <p>Everything for the SparkBridge 90-day go-to-market sprint. Full dashboard content lands in later waves.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginTop: 20 }}>
        {LINKS.map(({ href, label, desc }) => (
          <Link key={href} href={href} style={{
            display: 'block',
            padding: '16px',
            border: '1px solid var(--border-gold)',
            borderRadius: 10,
            textDecoration: 'none',
            color: 'var(--text)',
            background: 'var(--bg-card)',
          }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{desc}</div>
          </Link>
        ))}
      </div>
    </GtmLayout>
  )
}
