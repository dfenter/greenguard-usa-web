import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }
  return { props: {} }
}

export default function AdminBooking() {
  const router = useRouter()
  const [eventTypes, setEventTypes] = useState([])
  const [etError, setEtError] = useState(null)

  // Pre-fill from query params (e.g. ?email=x&name=x&phone=x&address=x from client panel)
  const prefill = router.isReady ? router.query : {}
  const nameParts = (prefill.name || '').split(' ')

  const [form, setForm] = useState({
    eventTypeId: '', firstName: '', lastName: '', email: '',
    address: '', startLocal: '', notes: '', recurring: 'none',
  })
  const [status, setStatus] = useState(null) // null | 'loading' | 'success' | {error}

  // Apply query param pre-fill once router is ready. `start` is the
  // datetime-local value from a click on the calendar grid; expected format
  // is YYYY-MM-DDTHH:mm (what <input type=datetime-local> wants).
  useEffect(() => {
    if (!router.isReady) return
    const q = router.query
    if (q.email || q.name || q.address || q.start) {
      const parts = (q.name || '').split(' ')
      setForm((f) => ({
        ...f,
        email: q.email || f.email,
        firstName: parts[0] || f.firstName,
        lastName: parts.slice(1).join(' ') || f.lastName,
        address: q.address || f.address,
        startLocal: q.start || f.startLocal,
      }))
    }
  }, [router.isReady]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/admin/event-types')
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data) || data.length === 0) {
          setEtError('No service types returned from Cal.com. Check CALCOM_API_KEY in Vercel.')
          return
        }
        setEventTypes(data)
        setForm(f => ({ ...f, eventTypeId: data[0].id }))
      })
      .catch(() => { setEtError('Failed to load service types.') })
  }, [])

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('loading')
    try {
      const res = await fetch('/api/admin/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Booking failed')
      const count = data.count || 1
      setStatus({ success: true, count, recurring: data.recurring })
      setForm(f => ({ ...f, firstName: '', lastName: '', email: '', address: '', startLocal: '', notes: '', recurring: 'none' }))
    } catch (err) {
      setStatus({ error: err.message })
    }
  }

  const input = {
    width: '100%', padding: '10px 12px',
    border: '1px solid rgba(122,171,130,0.25)',
    borderRadius: 8, fontSize: 15,
    background: 'rgba(255,255,255,0.04)', color: '#d4e6ca',
    outline: 'none',
  }

  const label = {
    display: 'block', fontSize: 13, fontWeight: 700,
    color: 'rgba(212,230,202,0.6)', marginBottom: 6,
  }

  const field = { marginBottom: 18 }

  return (
    <>
      <Head><title>New Booking · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <div style={{ maxWidth: 560 }}>
          <span className="tag">Admin</span>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
            New Booking
          </h1>
          <p style={{ fontSize: '0.88rem', color: 'rgba(212,230,202,0.45)', marginBottom: 32 }}>
            Create a booking on behalf of a customer
          </p>

          {status?.success && (
            <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(125,255,170,0.3)', background: 'rgba(125,255,170,0.06)' }}>
              <p style={{ color: '#7dffaa', fontWeight: 700, margin: 0 }}>
                {status.recurring
                  ? `${status.count} recurring appointments created successfully!`
                  : 'Booking created!'}
              </p>
            </div>
          )}

          {status?.error && (
            <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(255,100,100,0.3)', background: 'rgba(255,80,80,0.06)' }}>
              <p style={{ color: '#ff8080', fontWeight: 700, margin: 0 }}>{status.error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={field}>
              <label style={label}>Service Type</label>
              {etError ? (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,100,100,0.08)', border: '1px solid rgba(255,100,100,0.2)', fontSize: '0.82rem', color: '#ff8080' }}>
                  {etError}
                </div>
              ) : (
                <select value={form.eventTypeId} onChange={set('eventTypeId')} required style={input}>
                  {eventTypes.length === 0 && <option value="">Loading…</option>}
                  {eventTypes.map(et => (
                    <option key={et.id} value={et.id}>{et.title}</option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
              <div>
                <label style={label}>First Name</label>
                <input style={input} type="text" value={form.firstName} onChange={set('firstName')} required placeholder="Jane" />
              </div>
              <div>
                <label style={label}>Last Name</label>
                <input style={input} type="text" value={form.lastName} onChange={set('lastName')} required placeholder="Smith" />
              </div>
            </div>

            <div style={field}>
              <label style={label}>Email</label>
              <input style={input} type="email" value={form.email} onChange={set('email')} required placeholder="jane@example.com" />
            </div>

            <div style={field}>
              <label style={label}>Service Address</label>
              <input style={input} type="text" value={form.address} onChange={set('address')} required placeholder="1234 Oak St, Austin TX 78701" />
            </div>

            <div style={field}>
              <label style={label}>Date &amp; Time (Central Time)</label>
              <input style={input} type="datetime-local" value={form.startLocal} onChange={set('startLocal')} required />
            </div>

            <div style={field}>
              <label style={label}>Recurring Schedule</label>
              <select style={input} value={form.recurring} onChange={set('recurring')}>
                <option value="none">One-time appointment</option>
                <option value="21">Every 21 days (6 appointments)</option>
                <option value="28">Every 28 days (6 appointments)</option>
              </select>
              {form.recurring !== 'none' && (
                <p style={{ fontSize: '0.78rem', color: '#c9a84c', margin: '6px 0 0' }}>
                  Will create 6 appointments starting from selected date.
                </p>
              )}
            </div>

            <div style={field}>
              <label style={label}>Notes (optional)</label>
              <textarea style={{ ...input, resize: 'vertical' }} rows={3} value={form.notes} onChange={set('notes')} placeholder="Any special requests…" />
            </div>

            <button
              type="submit"
              className="btn-outline"
              disabled={status === 'loading'}
              style={{ width: '100%', justifyContent: 'center', opacity: status === 'loading' ? 0.6 : 1 }}
            >
              {status === 'loading' ? 'Creating…' : form.recurring !== 'none' ? `Create ${form.recurring}-Day Recurring Series` : 'Create Booking'}
            </button>
          </form>
        </div>
      </PortalLayout>
    </>
  )
}
