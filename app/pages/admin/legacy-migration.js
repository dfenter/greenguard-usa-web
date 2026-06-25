import { useState } from 'react'
import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }
  return { props: {} }
}

export default function LegacyMigration() {
  const [events, setEvents] = useState(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState({})

  async function audit() {
    setLoading(true); setResults({})
    try {
      const r = await fetch('/api/admin/legacy-events')
      const d = await r.json()
      setEvents(d.events || [])
    } catch (e) { alert('Audit failed: ' + e.message) }
    setLoading(false)
  }

  async function migrateOne(eventId) {
    setResults((s) => ({ ...s, [eventId]: { status: 'working' } }))
    try {
      const r = await fetch('/api/admin/migrate-legacy-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      })
      const d = await r.json()
      if (r.ok) setResults((s) => ({ ...s, [eventId]: { status: 'ok', rescheduleUrl: d.rescheduleUrl, warning: d.warning } }))
      else setResults((s) => ({ ...s, [eventId]: { status: 'err', error: d.error || `HTTP ${r.status}` } }))
    } catch (e) {
      setResults((s) => ({ ...s, [eventId]: { status: 'err', error: e.message } }))
    }
  }

  async function migrateAll() {
    if (!events?.length) return
    if (!window.confirm(`Migrate all ${events.length} legacy events? Each creates a real Cal.com booking. Customer may receive a confirmation email per booking.`)) return
    for (const ev of events) {
      // sequential to avoid Cal.com rate limits
      // eslint-disable-next-line no-await-in-loop
      await migrateOne(ev.id)
    }
  }

  return (
    <>
      <Head><title>Legacy Event Migration · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <div style={{ marginBottom: 24 }}>
          <span className="tag">Admin · Migration</span>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Legacy Event Migration</h1>
          <p style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.5)', margin: 0, lineHeight: 1.6 }}>
            Upcoming Google Calendar events from Acuity/Squarespace days that don&apos;t yet have a Cal.com booking attached. Migrating one creates a matching Cal.com booking and patches the event description so the customer (and admin) can self-reschedule or cancel via Cal.com going forward.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button onClick={audit} disabled={loading} style={{ padding: '9px 18px', borderRadius: 6, border: '1px solid rgba(125,255,170,0.3)', background: 'transparent', color: '#7dffaa', cursor: loading ? 'wait' : 'pointer', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'Inter, sans-serif' }}>
            {loading ? 'Scanning…' : events ? '↻ Re-scan' : 'Scan Calendar'}
          </button>
          {events && events.length > 0 && (
            <button onClick={migrateAll} style={{ padding: '9px 18px', borderRadius: 6, border: 'none', background: '#c9a84c', color: '#0d1a10', cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem', fontFamily: 'Inter, sans-serif' }}>
              Migrate All ({events.length})
            </button>
          )}
        </div>

        {events && events.length === 0 && (
          <div className="card" style={{ fontSize: '0.88rem', color: 'rgba(212,230,202,0.55)' }}>
            ✓ No legacy events to migrate. Every upcoming GreenGuard booking already has a Cal.com URL.
          </div>
        )}

        {events && events.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {events.map((ev) => {
              const r = results[ev.id]
              return (
                <div key={ev.id} className="card" style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.92rem', marginBottom: 2 }}>{ev.summary || '(untitled)'}</div>
                      <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.55)' }}>
                        {ev.start ? new Date(ev.start).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'no time'}
                        {ev.attendeeEmail ? ` · ${ev.attendeeEmail}` : ''}
                        {ev.hasAcuityId ? ' · Acuity legacy' : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {r?.status === 'ok' && (
                        <a href={r.rescheduleUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '5px 10px', borderRadius: 4, background: 'rgba(125,255,170,0.12)', color: '#7dffaa', fontWeight: 700, fontSize: '0.75rem', textDecoration: 'none' }}>
                          ✓ Migrated{r.warning ? ' ⚠' : ''}
                        </a>
                      )}
                      {r?.status === 'err' && (
                        <span style={{ fontSize: '0.75rem', color: '#ff8080', fontWeight: 700, maxWidth: 360, textAlign: 'right' }}>✗ {r.error}</span>
                      )}
                      {!r && (
                        <button onClick={() => migrateOne(ev.id)} style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid rgba(201,168,76,0.4)', background: 'transparent', color: '#c9a84c', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'Inter, sans-serif' }}>
                          Migrate
                        </button>
                      )}
                      {r?.status === 'working' && (
                        <span style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.5)' }}>migrating…</span>
                      )}
                    </div>
                  </div>
                  {r?.warning && (
                    <div style={{ fontSize: '0.72rem', color: '#c9a84c', marginTop: 6 }}>⚠ {r.warning}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </PortalLayout>
    </>
  )
}
