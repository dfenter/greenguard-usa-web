import Head from 'next/head'
import { useState } from 'react'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { findContactByEmail, upsertContact, getNotesForContact } from '../../lib/hubspot'

const INVENTORY_EMAIL = 'inventory@greenguard-usa.com'

async function getOrCreateInventoryContact() {
  let contact = await findContactByEmail(INVENTORY_EMAIL).catch(() => null)
  if (!contact) {
    await upsertContact({ email: INVENTORY_EMAIL, name: 'GreenGuard Inventory Tracker', metadata: {} })
    contact = await findContactByEmail(INVENTORY_EMAIL)
  }
  return contact
}

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session || session.email !== (process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com')) {
    return { redirect: { destination: '/dashboard', permanent: false } }
  }

  let history = []
  try {
    const contact = await getOrCreateInventoryContact()
    history = await getNotesForContact(contact.id, 30)
  } catch {
    // history stays empty
  }

  return { props: { isAdmin: true, history } }
}

const FIELDS = [
  { key: 'fullTanks', label: 'Full CO₂ tanks' },
  { key: 'emptyTanks', label: 'Empty CO₂ tanks' },
  { key: 'damagedTanks', label: 'Damaged CO₂ tanks' },
  { key: 'bgTraps', label: 'Biogents traps in stock' },
  { key: 'mosqitterUnits', label: 'Mosqitter units in stock' },
  { key: 'timers', label: 'Timers in stock' },
  { key: 'baitStations', label: 'Bait stations in stock' },
]

const empty = () => Object.fromEntries(FIELDS.map(({ key }) => [key, '']))

function parseNote(noteBody) {
  if (!noteBody) return null
  const lines = noteBody.split('\n')
  const result = { date: null, notes: null }
  for (const line of lines) {
    const [k, ...v] = line.split(':')
    const key = k?.trim()
    const val = v.join(':').trim()
    if (key === 'Date') result.date = val
    else if (key === 'Notes') result.notes = val
    else {
      const field = FIELDS.find((f) => f.label === key)
      if (field) result[field.key] = val
    }
  }
  return result
}

export default function InventoryPage({ isAdmin, history }) {
  const [counts, setCounts] = useState(empty())
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState(null)
  const [rows, setRows] = useState(history)

  function handleChange(key, val) {
    setCounts((prev) => ({ ...prev, [key]: val }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('submitting')
    try {
      const res = await fetch('/api/admin/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counts, notes }),
      })
      if (!res.ok) throw new Error()
      setStatus('sent')
      setCounts(empty())
      setNotes('')
      // Refresh history
      const histRes = await fetch('/api/admin/inventory')
      if (histRes.ok) setRows(await histRes.json())
    } catch {
      setStatus('error')
    }
  }

  return (
    <>
      <Head><title>Inventory · GreenGuard Admin</title></Head>
      <PortalLayout title="Daily Inventory" isAdmin={isAdmin}>
        <div style={{ display: 'grid', gap: 40, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start', maxWidth: 900 }}>
          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gap: 14, marginBottom: 18 }}>
              {FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 5, color: 'rgba(212,230,202,0.6)' }}>
                    {label}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={counts[key]}
                    onChange={(e) => handleChange(key, e.target.value)}
                    placeholder="0"
                    style={{
                      width: '100%', padding: '10px 14px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(122,171,130,0.25)',
                      borderRadius: 6, color: '#d4e6ca', fontSize: '0.9rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 5, color: 'rgba(212,230,202,0.6)' }}>
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Any supply issues, orders placed, etc."
                  style={{
                    width: '100%', padding: '12px 14px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(122,171,130,0.25)',
                    borderRadius: 6, color: '#d4e6ca', fontSize: '0.9rem',
                    fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <button type="submit" disabled={status === 'submitting'} className="btn-gold">
              {status === 'submitting' ? 'Submitting…' : 'Submit Inventory'}
            </button>

            {status === 'sent' && (
              <div style={{ marginTop: 14, color: '#7dffaa', fontWeight: 700, fontSize: '0.9rem' }}>
                ✓ Inventory logged and email sent to admin.
              </div>
            )}
            {status === 'error' && (
              <div style={{ marginTop: 14, color: '#ff8888', fontSize: '0.9rem' }}>Something went wrong — try again.</div>
            )}
          </form>

          {/* History table */}
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(212,230,202,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Recent submissions
            </div>
            {rows.length === 0 ? (
              <div style={{ color: 'rgba(212,230,202,0.4)', fontSize: '0.9rem' }}>No submissions yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {rows.map((row, i) => {
                  const parsed = parseNote(row.properties?.hs_note_body)
                  if (!parsed) return null
                  return (
                    <div key={i} className="card" style={{ padding: '14px 16px' }}>
                      <div style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.45)', marginBottom: 8 }}>
                        {parsed.date || new Date(row.properties?.hs_timestamp).toLocaleString('en-US', { timeZone: 'America/Chicago' })}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '0.83rem' }}>
                        {FIELDS.map(({ key, label }) => (
                          parsed[key] !== undefined && (
                            <div key={key}>
                              <span style={{ color: 'rgba(212,230,202,0.5)' }}>{label}: </span>
                              <span style={{ fontWeight: 700 }}>{parsed[key] ?? '—'}</span>
                            </div>
                          )
                        ))}
                      </div>
                      {parsed.notes && (
                        <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'rgba(212,230,202,0.5)' }}>
                          {parsed.notes}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </PortalLayout>
    </>
  )
}
