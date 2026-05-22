import { useState, useCallback } from 'react'
import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }
  return { props: {} }
}

const SERVICE_LABELS = {
  env: 'Environment Variables',
  stripe: 'Stripe',
  hubspot: 'HubSpot',
  google_calendar: 'Google Calendar',
  resend: 'Resend (Email)',
  ga4: 'Google Analytics 4',
}

function StatusDot({ ok, warning }) {
  const color = warning ? '#c9a84c' : ok ? '#7dffaa' : '#ff6b6b'
  return <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
}

function ServiceRow({ name, result }) {
  const label = SERVICE_LABELS[name] || name
  const hasWarning = result.warning && result.ok
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(122,171,130,0.08)' }}>
      <StatusDot ok={result.ok} warning={hasWarning} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{label}</div>
        {result.error && <div style={{ fontSize: '0.75rem', color: '#ff8080', marginTop: 2 }}>{result.error}</div>}
        {result.errors?.length > 0 && result.errors.map((e, i) => (
          <div key={i} style={{ fontSize: '0.75rem', color: '#ff8080', marginTop: 2 }}>{e}</div>
        ))}
        {hasWarning && <div style={{ fontSize: '0.75rem', color: '#c9a84c', marginTop: 2 }}>{result.warning}</div>}
      </div>
      {result.latency != null && (
        <span style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.35)', whiteSpace: 'nowrap' }}>
          {result.latency}ms
        </span>
      )}
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: result.ok ? '#7dffaa' : '#ff6b6b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {result.ok ? (hasWarning ? 'warn' : 'ok') : 'fail'}
      </span>
    </div>
  )
}

export default function HealthDashboard() {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [lastRun, setLastRun] = useState(null)

  const runCheck = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/health')
      const data = await res.json()
      setResult(data)
      setLastRun(new Date())
    } catch (e) {
      setResult({ status: 'error', error: e.message })
    } finally {
      setLoading(false)
    }
  }, [])

  const statusColor = !result ? 'rgba(212,230,202,0.3)' : result.status === 'healthy' ? '#7dffaa' : '#ff6b6b'
  const statusLabel = !result ? 'Not checked' : result.status === 'healthy' ? 'All systems operational' : 'Degraded — see below'

  return (
    <>
      <Head><title>Health · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <div style={{ marginBottom: 28 }}>
          <span className="tag">Admin</span>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            System Health
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.45)', margin: 0 }}>
            Live status of all integrations · Auto-checked every 5 minutes via cron
          </p>
        </div>

        {/* Status banner */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, padding: '16px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${statusColor}33`, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: statusColor, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontWeight: 800, color: statusColor, fontSize: '1rem' }}>{statusLabel}</span>
            {result?.totalMs && <span style={{ fontSize: '0.75rem', color: 'rgba(212,230,202,0.35)' }}>({result.totalMs}ms)</span>}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {lastRun && <span style={{ fontSize: '0.75rem', color: 'rgba(212,230,202,0.35)' }}>Last: {lastRun.toLocaleTimeString()}</span>}
            <button
              onClick={runCheck}
              disabled={loading}
              style={{ padding: '8px 18px', borderRadius: 6, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: '0.82rem', fontFamily: 'Nunito Sans, sans-serif', background: loading ? 'rgba(201,168,76,0.2)' : '#c9a84c', color: loading ? 'rgba(212,230,202,0.4)' : '#0d1a10' }}
            >
              {loading ? 'Checking…' : result ? 'Re-check Now' : 'Run Health Check'}
            </button>
          </div>
        </div>

        {/* Service checks */}
        {result?.checks && (
          <div className="card" style={{ marginBottom: 24 }}>
            {Object.entries(result.checks).map(([name, check]) => (
              <ServiceRow key={name} name={name} result={check} />
            ))}
          </div>
        )}

        {/* Cron info */}
        <div className="card" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '0.88rem', marginBottom: 4 }}>Automatic Monitoring</div>
            <p style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.55)', margin: '0 0 8px', lineHeight: 1.5 }}>
              Vercel Cron runs <code style={{ color: '#c9a84c' }}>/api/cron/health</code> every 5 minutes. If any service is down, an alert email is sent to <strong>admin@greenguard-usa.com</strong> automatically.
            </p>
            <p style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.35)', margin: 0 }}>
              GitHub Actions also runs a health check every 15 minutes as a backup monitor.
            </p>
          </div>
          <a
            href={`${process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'}/api/health`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.25)', fontSize: '0.78rem', fontWeight: 700, color: '#7aab82', textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            Raw JSON →
          </a>
        </div>
      </PortalLayout>
    </>
  )
}
