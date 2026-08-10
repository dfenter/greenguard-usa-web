import { useState } from 'react'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { findContactByEmail } from '../../lib/hubspot'
import Link from 'next/link'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }

  let contact = null
  try {
    contact = await findContactByEmail(session.email)
  } catch {}

  const p = contact?.properties || {}
  return {
    props: {
      email: session.email,
      contactId: contact?.id || null,
      initialData: {
        firstName: p.firstname || '',
        lastName:  p.lastname  || '',
        phone:     p.phone     || '',
        address:   p.address   || '',
      },
    },
  }
}

const inp = {
  width: '100%', padding: '10px 14px', borderRadius: 8,
  background: 'var(--bg-card)', border: '1px solid rgba(var(--border-rgb),0.25)',
  color: 'var(--text)', fontSize: '0.9rem',
  boxSizing: 'border-box',
}
const card = { background: 'var(--bg-card)', border: '1px solid rgba(var(--border-rgb),0.18)', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }
const sectionLabel = { fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 14 }
const fieldLabel = { fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 5, display: 'block' }

export default function SettingsPage({ email, contactId, initialData }) {
  const [data, setData]     = useState(initialData)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState(null)

  const set = (k) => (e) => setData(prev => ({ ...prev, [k]: e.target.value }))

  async function save(e) {
    e.preventDefault()
    setSaving(true); setSaved(false); setError(null)
    try {
      const res = await fetch('/api/customer/update-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error(await res.text())
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PortalLayout title="Account Settings">
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 28 }}>
          Update your contact information. Changes apply to future communications and service scheduling.
        </p>

        <form onSubmit={save}>
          {/* Contact info */}
          <div style={card}>
            <div style={sectionLabel}>Contact Information</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={fieldLabel}>First name</label>
                <input style={inp} value={data.firstName} onChange={set('firstName')} placeholder="Lauren" />
              </div>
              <div>
                <label style={fieldLabel}>Last name</label>
                <input style={inp} value={data.lastName} onChange={set('lastName')} placeholder="Hughes" />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={fieldLabel}>Email</label>
              <input style={{ ...inp, opacity: 0.5, cursor: 'not-allowed' }} value={email} disabled />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 4 }}>
                Email is used for login and cannot be changed here. Contact us to update.
              </div>
            </div>
            <div>
              <label style={fieldLabel}>Phone</label>
              <input style={inp} value={data.phone} onChange={set('phone')} placeholder="512-555-1234" type="tel" />
            </div>
          </div>

          {/* Service address */}
          <div style={card}>
            <div style={sectionLabel}>Service Address</div>
            <div>
              <label style={fieldLabel}>Street address</label>
              <input style={inp} value={data.address} onChange={set('address')} placeholder="1234 Oak St, Austin TX 78701" />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 4 }}>
                This is where we deliver your CO₂ and service your traps.
              </div>
            </div>
          </div>

          {/* Save */}
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(var(--danger-rgb),0.08)', border: '1px solid rgba(var(--danger-rgb),0.25)', color: 'var(--danger)', fontSize: '0.82rem', marginBottom: 14 }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={saving}
            style={{ width: '100%', padding: '13px', borderRadius: 10, fontWeight: 900, fontSize: '0.9rem', cursor: saving ? 'not-allowed' : 'pointer', border: 'none', background: saved ? 'rgba(var(--green-rgb),0.15)' : 'var(--green)', color: saved ? 'var(--green)' : 'var(--text-on-accent)', transition: 'all 0.2s' }}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
          </button>
        </form>

        {/* Payment method */}
        <div style={{ ...card, marginTop: 20 }}>
          <div style={sectionLabel}>Payment Method</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 14px' }}>
            Update your credit card, view past invoices, or download receipts.
          </p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/customer/billing-portal"
            style={{ display: 'inline-block', padding: '9px 20px', borderRadius: 8, border: '1px solid rgba(var(--border-rgb),0.3)', color: 'var(--green)', fontWeight: 700, fontSize: '0.82rem', textDecoration: 'none' }}>
            Manage Payment Method &rarr;
          </a>
        </div>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Link href="/dashboard" style={{ color: 'var(--text-dim)', fontSize: '0.82rem', textDecoration: 'none' }}>
            ← Back to My Account
          </Link>
        </div>
      </div>
    </PortalLayout>
  )
}
