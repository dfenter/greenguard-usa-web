import { useState, useCallback } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { listAllCustomers } from '../../lib/stripe'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (session.email !== ADMIN_EMAIL) return { redirect: { destination: '/dashboard', permanent: false } }

  const raw = await listAllCustomers()
  const customers = raw.map((c) => {
    const subs = c.subscriptions?.data || []
    const activeSub = subs.find((s) => s.status === 'active') || subs[0] || null
    const mrr = activeSub ? activeSub.items.data.reduce((sum, i) => sum + (i.price.unit_amount || 0), 0) : 0
    const planLabel = activeSub ? activeSub.items.data.map((i) => i.price.nickname || i.price.id).filter(Boolean).join(' + ') : null
    return {
      id: c.id,
      name: c.name || '',
      email: c.email || '',
      phone: c.phone || '',
      status: activeSub?.status || 'inactive',
      plan: planLabel,
      mrr,
    }
  }).sort((a, b) => {
    const order = { active: 0, trialing: 1, past_due: 2, unpaid: 3, canceled: 4, inactive: 5 }
    return ((order[a.status] ?? 6) - (order[b.status] ?? 6)) || a.name.localeCompare(b.name)
  })

  return { props: { customers } }
}

const STATUS_COLORS = {
  active:   { bg: 'rgba(125,255,170,0.12)', color: '#7dffaa',              label: 'Active' },
  trialing: { bg: 'rgba(125,255,170,0.07)', color: '#7dffaa',              label: 'Trial' },
  past_due: { bg: 'rgba(255,160,80,0.12)',  color: '#ffb060',              label: 'Past Due' },
  unpaid:   { bg: 'rgba(255,100,100,0.12)', color: '#ff8080',              label: 'Unpaid' },
  canceled: { bg: 'rgba(212,230,202,0.06)', color: 'rgba(212,230,202,0.35)', label: 'Canceled' },
  inactive: { bg: 'rgba(212,230,202,0.06)', color: 'rgba(212,230,202,0.35)', label: 'No Sub' },
}

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.inactive
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.06em', background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function fmtDateShort(unix) {
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtAmt(cents) { return `$${(cents / 100).toFixed(2)}` }

// ── Docked Detail Panel ────────────────────────────────────────────────────────

function CustomerPanel({ customer, onClose }) {
  const router = useRouter()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', phone: '', address: '', planType: '', systemType: '', trapCount: '', hasTimer: false })
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/customer-detail?customerId=${customer.id}`)
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setDetail(data)
      setEditForm({ name: data.name, phone: data.phone, address: data.address, planType: data.planType || '', systemType: data.systemType || '', trapCount: data.trapCount || '', hasTimer: data.hasTimer || false })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [customer.id])

  // Fetch on mount
  useState(() => { fetchDetail() }, []) // run once; intentionally using useState trick

  // Actually fetch on mount properly
  const [fetched, setFetched] = useState(false)
  if (!fetched) { setFetched(true); fetchDetail() }

  async function saveEdit() {
    setSaving(true)
    await fetch('/api/admin/update-customer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: customer.id, hubspotContactId: detail?.hubspotContactId, ...editForm }),
    })
    setSaving(false)
    setEditing(false)
    fetchDetail()
  }

  async function handleCancel() {
    if (!detail?.nextBooking?.calBookingId) return
    if (!window.confirm('Cancel this appointment?')) return
    setCancelling(true)
    await fetch('/api/admin/cancel-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: detail.nextBooking.calBookingId }),
    })
    setCancelling(false)
    fetchDetail()
  }

  function scheduleForCustomer() {
    const d = detail || customer
    const params = new URLSearchParams({
      email: d.email || '',
      name: d.name || '',
      phone: d.phone || '',
      address: d.address || '',
    })
    router.push('/admin/booking?' + params.toString())
  }

  const panel = {
    position: 'fixed', top: 0, right: 0, bottom: 0, width: 400,  /* becomes bottom sheet on mobile via .docked-panel CSS class */
    background: '#0d1a10', borderLeft: '1px solid rgba(122,171,130,0.2)',
    zIndex: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column',
    boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
  }

  const row = { padding: '14px 0', borderBottom: '1px solid rgba(122,171,130,0.08)' }
  const lbl = { fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)', marginBottom: 4 }
  const val = { fontSize: '0.88rem', fontWeight: 600, color: '#d4e6ca' }
  const input = {
    width: '100%', padding: '8px 10px', borderRadius: 6, boxSizing: 'border-box',
    border: '1px solid rgba(122,171,130,0.3)', background: 'rgba(255,255,255,0.04)',
    color: '#d4e6ca', fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif', outline: 'none',
  }
  const btn = (variant) => ({
    padding: '7px 14px', borderRadius: 4, border: 'none', cursor: 'pointer',
    fontWeight: 800, fontSize: '0.78rem', fontFamily: 'Nunito Sans, sans-serif',
    ...(variant === 'gold'   ? { background: '#c9a84c', color: '#0d1a10' } :
        variant === 'green'  ? { background: '#7dffaa', color: '#0d1a10' } :
        variant === 'red'    ? { background: 'rgba(255,100,100,0.15)', color: '#ff8080', border: '1px solid rgba(255,100,100,0.25)' } :
        variant === 'ghost'  ? { background: 'rgba(122,171,130,0.08)', color: 'rgba(212,230,202,0.6)', border: '1px solid rgba(122,171,130,0.15)' } :
                               { background: 'rgba(122,171,130,0.12)', color: '#7aab82' }),
  })

  return (
    <div style={panel} className="docked-panel">
      {/* Header */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(122,171,130,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: '1.05rem', marginBottom: 2 }}>{customer.name || 'Customer'}</div>
          <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.45)' }}>{customer.email}</div>
          <div style={{ marginTop: 8 }}><StatusBadge status={customer.status} /></div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(212,230,202,0.4)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1, padding: 4 }}>×</button>
      </div>

      {/* Action bar */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(122,171,130,0.08)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={btn('gold')} onClick={scheduleForCustomer}>+ Schedule</button>
        {!editing && <button style={btn('ghost')} onClick={() => setEditing(true)}>Edit</button>}
        {editing && <button style={btn('green')} onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>}
        {editing && <button style={btn('ghost')} onClick={() => setEditing(false)}>Cancel</button>}
      </div>

      {/* Body */}
      <div style={{ padding: '0 20px 32px', flex: 1 }}>
        {loading && <p style={{ color: 'rgba(212,230,202,0.4)', marginTop: 24 }}>Loading…</p>}
        {error && <p style={{ color: '#ff8080', marginTop: 24 }}>{error}</p>}

        {detail && !loading && (
          <>
            {/* Contact info */}
            <div style={row}>
              <div style={lbl}>Contact</div>
              {editing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                  <input style={input} placeholder="Full name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                  <input style={input} placeholder="Phone" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
                  <input style={input} placeholder="Address" value={editForm.address} onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))} />
                  <select style={input} value={editForm.planType} onChange={(e) => setEditForm((f) => ({ ...f, planType: e.target.value }))}>
                    <option value="">Plan type…</option>
                    <option value="rent">Rent</option>
                    <option value="own">Own</option>
                  </select>
                  <select style={input} value={editForm.systemType} onChange={(e) => setEditForm((f) => ({ ...f, systemType: e.target.value }))}>
                    <option value="">System type…</option>
                    <option value="Biogents-CO2">Biogents CO₂</option>
                    <option value="Biogents-NonCO2">Biogents Non-CO₂</option>
                    <option value="Mosqitter-Grand">Mosqitter Grand</option>
                  </select>
                  <input style={input} type="number" min="1" placeholder="Trap count" value={editForm.trapCount} onChange={(e) => setEditForm((f) => ({ ...f, trapCount: e.target.value }))} />
                  {editForm.systemType === 'Biogents-CO2' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'rgba(212,230,202,0.7)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!editForm.hasTimer} onChange={(e) => setEditForm((f) => ({ ...f, hasTimer: e.target.checked }))} />
                      Has Biogents Timer
                    </label>
                  )}
                </div>
              ) : (
                <>
                  {detail.phone && <div style={val}>{detail.phone}</div>}
                  {detail.address && <div style={{ ...val, color: 'rgba(212,230,202,0.55)', marginTop: 2 }}>{detail.address}</div>}
                  {(detail.planType || detail.systemType) && (
                    <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.4)', marginTop: 4 }}>
                      {detail.planType && <span style={{ textTransform: 'capitalize', marginRight: 6 }}>{detail.planType}</span>}
                      {detail.systemType && <span>{detail.systemType === 'Biogents-CO2' ? 'Biogents CO₂' : detail.systemType === 'Biogents-NonCO2' ? 'Biogents Non-CO₂' : 'Mosqitter Grand'}</span>}
                      {detail.trapCount ? ` · ${detail.trapCount} trap${detail.trapCount > 1 ? 's' : ''}` : ''}
                      {detail.hasTimer ? ' · Timer' : ''}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Current plan */}
            {detail.subscription && (
              <div style={row}>
                <div style={lbl}>Current Plan</div>
                <div style={val}>{fmtAmt(detail.subscription.amount)}/{detail.subscription.interval}</div>
                {detail.subscription.label && <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.4)', marginTop: 2 }}>{detail.subscription.label}</div>}
              </div>
            )}

            {/* Outstanding invoices */}
            {detail.openInvoices?.length > 0 && (
              <div style={row}>
                <div style={{ ...lbl, color: '#ffb060' }}>Outstanding Invoices</div>
                {detail.openInvoices.map((inv) => (
                  <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <div>
                      <div style={{ ...val, color: '#ffb060' }}>{fmtAmt(inv.amountDue)}</div>
                      <div style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.4)' }}>{inv.number} · Due {fmtDateShort(inv.created)}</div>
                    </div>
                    {inv.hostedUrl && (
                      <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: 4, background: '#c9a84c', color: '#0d1a10', fontWeight: 800, textDecoration: 'none' }}>Pay</a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Next appointment */}
            <div style={row}>
              <div style={lbl}>Next Appointment</div>
              {detail.nextBooking ? (
                <>
                  <div style={{ ...val, color: '#7dffaa' }}>{fmtDate(detail.nextBooking.startTime)}</div>
                  <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.55)', marginTop: 2 }}>{detail.nextBooking.title}</div>
                  {detail.nextBooking.address && <div style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.35)', marginTop: 2 }}>{detail.nextBooking.address}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    {detail.nextBooking.calBookingId && (
                      <button style={btn('red')} onClick={handleCancel} disabled={cancelling}>
                        {cancelling ? 'Cancelling…' : 'Cancel'}
                      </button>
                    )}
                    {detail.nextBooking.calBookingUid && (
                      <a
                        href={`https://cal.com/reschedule/${detail.nextBooking.calBookingUid}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ ...btn('ghost'), textDecoration: 'none', display: 'inline-block' }}
                      >
                        Reschedule
                      </a>
                    )}
                    {!detail.nextBooking.calBookingId && (
                      <span style={{ fontSize: '0.72rem', color: 'rgba(212,230,202,0.3)' }}>No Cal.com booking linked</span>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.35)', marginTop: 4 }}>None scheduled</div>
              )}
            </div>

            {/* Appointment history */}
            {detail.pastBookings?.length > 0 && (
              <div style={row}>
                <div style={lbl}>Appointment History</div>
                {detail.pastBookings.map((b) => (
                  <div key={b.id} style={{ marginTop: 8 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(212,230,202,0.65)' }}>{fmtDate(b.startTime)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(212,230,202,0.4)' }}>{b.title}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Notes */}
            {detail.notes?.length > 0 && (
              <div style={{ ...row, borderBottom: 'none' }}>
                <div style={lbl}>Notes</div>
                {detail.notes.map((note) => (
                  <div key={note.id} style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(122,171,130,0.05)', borderRadius: 6, borderLeft: '2px solid rgba(122,171,130,0.2)' }}>
                    <div style={{ fontSize: '0.78rem', whiteSpace: 'pre-wrap', color: 'rgba(212,230,202,0.7)', lineHeight: 1.5 }}>{note.body}</div>
                    {note.timestamp && (
                      <div style={{ fontSize: '0.68rem', color: 'rgba(212,230,202,0.3)', marginTop: 6 }}>
                        {new Date(note.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {detail.notes?.length === 0 && (
              <div style={{ ...row, borderBottom: 'none' }}>
                <div style={lbl}>Notes</div>
                <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.3)', marginTop: 4 }}>No notes yet</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'past_due', label: 'Past Due' },
  { key: 'inactive', label: 'No Sub' },
]

export default function Clients({ customers }) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all')
  const [selected, setSelected] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState(null)

  async function runImport() {
    if (!window.confirm('Import 133 contacts from list(6).csv into HubSpot? This will upsert all rows.')) return
    setImporting(true)
    setImportMsg(null)
    try {
      const res = await fetch('/api/admin/import-csv', { method: 'POST' })
      const data = await res.json()
      setImportMsg(`Done: ${data.created} created, ${data.updated} updated, ${data.skipped} skipped${data.errors?.length ? ` — ${data.errors.length} errors` : ''}`)
    } catch (e) { setImportMsg('Import failed') }
    finally { setImporting(false) }
  }

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase()
    const matchSearch = !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.replace(/\D/g,'').includes(q.replace(/\D/g,''))
    const matchTab = tab === 'all' || (tab === 'inactive' ? ['inactive', 'canceled'].includes(c.status) : c.status === tab)
    return matchSearch && matchTab
  })

  const totalMrr = customers.filter((c) => ['active', 'trialing'].includes(c.status)).reduce((s, c) => s + c.mrr, 0)
  const panelOpen = !!selected

  return (
    <>
      <Head><title>Clients · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="tag">Admin</span>
            <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Clients</h1>
            <p style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.45)', margin: 0 }}>
              {customers.length} total · MRR ${(totalMrr / 100).toFixed(0)}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={runImport} disabled={importing}
              style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(201,168,76,0.3)', fontSize: '0.78rem', fontWeight: 700, color: '#c9a84c', background: 'transparent', cursor: importing ? 'not-allowed' : 'pointer', fontFamily: 'Nunito Sans, sans-serif' }}>
              {importing ? 'Importing…' : 'Import CSV → HubSpot'}
            </button>
            <a href="/api/admin/export?type=clients" download
              style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.25)', fontSize: '0.78rem', fontWeight: 700, color: '#7aab82', textDecoration: 'none' }}>
              Export CSV
            </a>
            <a href="/api/admin/export?type=revenue" download
              style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.25)', fontSize: '0.78rem', fontWeight: 700, color: '#7aab82', textDecoration: 'none' }}>
              Revenue CSV
            </a>
          </div>
          {importMsg && <p style={{ fontSize: '0.78rem', color: importMsg.includes('failed') ? '#ff8080' : '#7dffaa', margin: '8px 0 0' }}>{importMsg}</p>}
        </div>

        {/* Search + filter */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="search"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: '1 1 200px', padding: '9px 14px',
              border: '1px solid rgba(122,171,130,0.25)', borderRadius: 8,
              background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.88rem', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            {FILTER_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '7px 14px', borderRadius: 4, border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: '0.78rem', fontFamily: 'Nunito Sans, sans-serif',
                  background: tab === t.key ? '#c9a84c' : 'rgba(201,168,76,0.1)',
                  color: tab === t.key ? '#0d1a10' : 'rgba(201,168,76,0.7)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className={`card panel-open-shrink`} style={{ padding: 0, overflow: 'hidden', marginRight: panelOpen ? 420 : 0, transition: 'margin-right 0.2s' }}>
          {filtered.length === 0 ? (
            <p style={{ padding: 24, color: 'rgba(212,230,202,0.4)', margin: 0 }}>No customers match.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(122,171,130,0.15)' }}>
                  {['Name', 'Email', 'Phone', 'Status', 'Plan', 'MRR'].map((h) => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(selected?.id === c.id ? null : c)}
                    style={{
                      borderBottom: '1px solid rgba(122,171,130,0.08)',
                      cursor: 'pointer',
                      background: selected?.id === c.id ? 'rgba(201,168,76,0.06)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '11px 16px', fontWeight: 700 }}>{c.name || '—'}</td>
                    <td style={{ padding: '11px 16px', color: 'rgba(212,230,202,0.55)', fontSize: '0.82rem' }}>{c.email || <span style={{ color: 'rgba(212,230,202,0.25)' }}>—</span>}</td>
                    <td style={{ padding: '11px 16px', color: 'rgba(212,230,202,0.55)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{c.phone || <span style={{ color: 'rgba(212,230,202,0.25)' }}>—</span>}</td>
                    <td style={{ padding: '11px 16px' }}><StatusBadge status={c.status} /></td>
                    <td style={{ padding: '11px 16px', color: 'rgba(212,230,202,0.5)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.plan || '—'}
                    </td>
                    <td style={{ padding: '11px 16px', fontWeight: 700, color: c.mrr ? '#7dffaa' : 'rgba(212,230,202,0.3)' }}>
                      {c.mrr ? `$${(c.mrr / 100).toFixed(0)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p style={{ marginTop: 10, fontSize: '0.72rem', color: 'rgba(212,230,202,0.25)' }}>
          {filtered.length} of {customers.length} shown · Click a row to open details
        </p>
      </PortalLayout>

      {/* Docked panel */}
      {selected && <CustomerPanel key={selected.id} customer={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
