import { useState, useEffect } from 'react'
import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (session.email !== ADMIN_EMAIL) return { redirect: { destination: '/dashboard', permanent: false } }
  return { props: {} }
}

export default function AdminBooking() {
  const [eventTypes, setEventTypes] = useState([])
  const [form, setForm] = useState({
    eventTypeId: '', firstName: '', lastName: '', email: '',
    phone: '', address: '', startLocal: '', notes: '',
  })
  const [status, setStatus] = useState(null) // null | 'loading' | 'success' | {error}

  useEffect(() => {
    fetch('/api/admin/event-types')
      .then(r => r.json())
      .then(data => {
        setEventTypes(Array.isArray(data) ? data : [])
        if (data[0]) setForm(f => ({ ...f, eventTypeId: data[0].id }))
      })
      .catch(() => {})
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
      setStatus('success')
      setForm(f => ({ ...f, firstName: '', lastName: '', email: '', phone: '', address: '', startLocal: '', notes: '' }))
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
      <PortalLayout>
        <div style={{ maxWidth: 560 }}>
          <span className="tag">Admin</span>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
            New Booking
          </h1>
          <p style={{ fontSize: '0.88rem', color: 'rgba(212,230,202,0.45)', marginBottom: 32 }}>
            Create a booking on behalf of a customer
          </p>

          {status === 'success' && (
            <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(125,255,170,0.3)', background: 'rgba(125,255,170,0.06)' }}>
              <p style={{ color: '#7dffaa', fontWeight: 700, margin: 0 }}>
                Booking created — draft assessment email will appear in Gmail within 60 seconds.
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
              <select value={form.eventTypeId} onChange={set('eventTypeId')} required style={input}>
                {eventTypes.map(et => (
                  <option key={et.id} value={et.id}>{et.title}</option>
                ))}
              </select>
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
              <label style={label}>Phone</label>
              <input style={input} type="tel" value={form.phone} onChange={set('phone')} placeholder="(512) 555-1234" />
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
              <label style={label}>Notes (optional)</label>
              <textarea style={{ ...input, resize: 'vertical' }} rows={3} value={form.notes} onChange={set('notes')} placeholder="Any special requests…" />
            </div>

            <button
              type="submit"
              className="btn-outline"
              disabled={status === 'loading'}
              style={{ width: '100%', justifyContent: 'center', opacity: status === 'loading' ? 0.6 : 1 }}
            >
              {status === 'loading' ? 'Creating…' : 'Create Booking'}
            </button>
          </form>
        </div>
      </PortalLayout>
    </>
  )
}
