import { useState, useMemo, useRef } from 'react'
import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { listAllCustomers } from '../../lib/stripe'
import { getAllContacts } from '../../lib/hubspot'

// Standalone, dependency-free PDF invoice generator for ONE-OFF / random items.
// Builds a branded printable invoice sheet entirely client-side; "Save as PDF"
// uses the browser's print dialog (window.print + @media print CSS), so no PDF
// library is added to the bundle. This does NOT touch Stripe — use /admin/invoice
// for billable Stripe invoices. This is for quick manual invoices/receipts.

const COMPANY = {
  name: 'GreenGuard USA',
  line1: '1519 Parkway',
  line2: 'Austin, TX 78703',
  phone: '512-560-4129',
  email: 'admin@greenguard-usa.com',
  web: 'greenguard-usa.com',
}
const TAX_RATE_DEFAULT = 8.25 // Austin, matches books-close TX_RATE_BPS=825

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }

  const [stripeRaw, hsContacts] = await Promise.all([
    listAllCustomers().catch(() => []),
    getAllContacts(200).catch(() => []),
  ])
  const stripeCustomers = stripeRaw.map((c) => ({
    name: c.name || '', email: c.email || '', phone: c.phone || '',
    address: [c.address?.line1, c.address?.city, c.address?.state].filter(Boolean).join(', '),
  })).filter((c) => c.email || c.name)
  const stripeEmails = new Set(stripeCustomers.map((c) => c.email.toLowerCase()).filter(Boolean))
  const prospects = hsContacts.map((c) => ({
    name: [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' '),
    email: c.properties?.email || '', phone: c.properties?.phone || '',
    address: c.properties?.address || '',
  })).filter((c) => (c.name || c.email) && (!c.email || !stripeEmails.has(c.email.toLowerCase())))

  const customers = [...stripeCustomers, ...prospects]
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
  return { props: { customers } }
}

function todayISO() { return new Date().toISOString().slice(0, 10) }
function plusDaysISO(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
function defaultInvoiceNo() {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const rand = Math.floor(100 + Math.random() * 900)
  return `GG-${ymd}-${rand}`
}
function fmt$(n) { return `$${(Number(n) || 0).toFixed(2)}` }
function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function InvoicePdf({ customers = [] }) {
  const [billTo, setBillTo] = useState({ name: '', email: '', phone: '', address: '' })
  const [search, setSearch] = useState('')
  const [showDrop, setShowDrop] = useState(false)
  const [invoiceNo, setInvoiceNo] = useState(defaultInvoiceNo())
  const [invoiceDate, setInvoiceDate] = useState(todayISO())
  const [dueDate, setDueDate] = useState(plusDaysISO(15))
  const [items, setItems] = useState([{ desc: '', qty: '1', price: '' }])
  const [taxEnabled, setTaxEnabled] = useState(true)
  const [taxRate, setTaxRate] = useState(String(TAX_RATE_DEFAULT))
  const [notes, setNotes] = useState('Thank you for your business. Payment due within 15 days.')

  const filtered = useMemo(() => {
    if (search.length < 1) return []
    const q = search.toLowerCase()
    return customers.filter((c) => (c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)).slice(0, 8)
  }, [search, customers])

  const subtotal = items.reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0), 0)
  const taxAmt = taxEnabled ? subtotal * ((parseFloat(taxRate) || 0) / 100) : 0
  const total = subtotal + taxAmt

  function pickCustomer(c) {
    setBillTo({ name: c.name || '', email: c.email || '', phone: c.phone || '', address: c.address || '' })
    setSearch(c.name || c.email); setShowDrop(false)
  }
  function setItem(i, k, v) { setItems((arr) => arr.map((it, idx) => idx === i ? { ...it, [k]: v } : it)) }
  function addRow() { setItems((arr) => [...arr, { desc: '', qty: '1', price: '' }]) }
  function removeRow(i) { setItems((arr) => arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr) }

  // ── styles for the admin form chrome ──
  const input = { padding: '9px 12px', border: '1px solid rgba(var(--green-rgb),0.25)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.88rem', outline: 'none', width: '100%' }
  const label = { fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 5, display: 'block' }
  const SECTION = { fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', margin: '24px 0 12px' }
  const btn = (v) => ({ padding: '9px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.82rem', ...(v === 'gold' ? { background: 'var(--gold)', color: 'var(--text-on-accent)' } : v === 'green' ? { background: 'var(--green)', color: 'var(--text-on-accent)' } : { background: 'rgba(var(--green-rgb),0.10)', color: 'var(--green-muted)', border: '1px solid rgba(var(--green-rgb),0.20)' }) })

  return (
    <PortalLayout isAdmin title="PDF Invoice">
      <Head><title>PDF Invoice Generator — GreenGuard Admin</title></Head>

      {/* print CSS: only the invoice sheet prints */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden !important; }
          #invoice-sheet, #invoice-sheet * { visibility: visible !important; }
          #invoice-sheet { position: absolute; left: 0; top: 0; width: 100%; margin: 0; box-shadow: none !important; border-radius: 0 !important; }
          @page { size: letter; margin: 0.6in; }
        }
      `}</style>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 460px) 1fr', gap: 28, alignItems: 'start' }} className="ip-grid">
        {/* ── FORM ── */}
        <div className="no-print">
          <div style={SECTION}>Bill To</div>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <span style={label}>Find customer (optional)</span>
            <input value={search} placeholder="Search name or email…" style={input}
              onChange={(e) => { setSearch(e.target.value); setShowDrop(true) }}
              onFocus={() => setShowDrop(true)} />
            {showDrop && filtered.length > 0 && (
              <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid rgba(var(--green-rgb),0.25)', borderRadius: 8, marginTop: 4, overflow: 'hidden' }}>
                {filtered.map((c, i) => (
                  <div key={i} onClick={() => pickCustomer(c)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.84rem', color: 'var(--text)', borderBottom: '1px solid rgba(var(--green-rgb),0.08)' }}>
                    <b>{c.name || '(no name)'}</b> <span style={{ color: 'var(--text-dim)' }}>{c.email}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {['name', 'email', 'phone', 'address'].map((k) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <span style={label}>{k}</span>
              <input value={billTo[k]} onChange={(e) => setBillTo({ ...billTo, [k]: e.target.value })} style={input} />
            </div>
          ))}

          <div style={SECTION}>Invoice Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><span style={label}>Invoice #</span><input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} style={input} /></div>
            <div><span style={label}>Date</span><input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} style={input} /></div>
            <div><span style={label}>Due date</span><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={input} /></div>
          </div>

          <div style={SECTION}>Line Items</div>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input value={it.desc} onChange={(e) => setItem(i, 'desc', e.target.value)} placeholder="Description" style={{ ...input, flex: '3 1 0' }} />
              <input value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} inputMode="decimal" placeholder="Qty" style={{ ...input, flex: '0 1 60px' }} />
              <input value={it.price} onChange={(e) => setItem(i, 'price', e.target.value)} inputMode="decimal" placeholder="$ each" style={{ ...input, flex: '1 1 80px' }} />
              <button onClick={() => removeRow(i)} title="Remove" style={{ ...btn(), padding: '8px 12px' }}>✕</button>
            </div>
          ))}
          <button onClick={addRow} style={btn()}>+ Add line</button>

          <div style={SECTION}>Tax & Notes</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.84rem', color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={taxEnabled} onChange={(e) => setTaxEnabled(e.target.checked)} /> Apply tax
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: taxEnabled ? 1 : 0.4 }}>
              <input value={taxRate} onChange={(e) => setTaxRate(e.target.value)} inputMode="decimal" disabled={!taxEnabled} style={{ ...input, width: 80 }} />
              <span style={{ color: 'var(--text-dim)', fontSize: '0.84rem' }}>%</span>
            </div>
          </div>
          <span style={label}>Notes / memo</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...input, resize: 'vertical' }} />

          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button onClick={() => window.print()} style={btn('gold')}>🖨 Print / Save as PDF</button>
            <button onClick={() => { setInvoiceNo(defaultInvoiceNo()); setItems([{ desc: '', qty: '1', price: '' }]); setBillTo({ name: '', email: '', phone: '', address: '' }); setSearch('') }} style={btn()}>Reset</button>
          </div>
        </div>

        {/* ── LIVE PREVIEW / PRINT SHEET ── */}
        <div id="invoice-sheet" style={{ background: '#ffffff', color: '#1a2620', borderRadius: 10, padding: '40px 44px', boxShadow: '0 8px 40px rgba(0,0,0,0.4)', fontFamily: 'Arial, Helvetica, sans-serif', minHeight: 700 }}>
          {/* header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #1a3320', paddingBottom: 18 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#1a3320', letterSpacing: '-0.5px' }}>{COMPANY.name}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7dbc8a', letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 }}>Mosquito Control · Austin, TX</div>
              <div style={{ fontSize: 12, color: '#555', marginTop: 10, lineHeight: 1.5 }}>
                {COMPANY.line1}<br />{COMPANY.line2}<br />{COMPANY.phone} · {COMPANY.email}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: '#1a3320', letterSpacing: 3 }}>INVOICE</div>
              <div style={{ fontSize: 13, color: '#333', marginTop: 8 }}><b>{invoiceNo}</b></div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Date: {fmtDate(invoiceDate)}</div>
              <div style={{ fontSize: 12, color: '#666' }}>Due: {fmtDate(dueDate)}</div>
            </div>
          </div>

          {/* bill to */}
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7dbc8a' }}>Bill To</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a2620', marginTop: 5 }}>{billTo.name || '—'}</div>
            <div style={{ fontSize: 12.5, color: '#555', lineHeight: 1.5, marginTop: 2 }}>
              {billTo.address && <>{billTo.address}<br /></>}
              {billTo.email}{billTo.email && billTo.phone ? ' · ' : ''}{billTo.phone}
            </div>
          </div>

          {/* items table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 22, fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#1a3320', color: '#fff' }}>
                <th style={{ textAlign: 'left', padding: '9px 12px', fontWeight: 700 }}>Description</th>
                <th style={{ textAlign: 'right', padding: '9px 12px', fontWeight: 700, width: 60 }}>Qty</th>
                <th style={{ textAlign: 'right', padding: '9px 12px', fontWeight: 700, width: 90 }}>Unit</th>
                <th style={{ textAlign: 'right', padding: '9px 12px', fontWeight: 700, width: 100 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.filter((it) => it.desc || it.price).map((it, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #e2e8e2' }}>
                  <td style={{ padding: '9px 12px', color: '#1a2620' }}>{it.desc || '—'}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: '#555' }}>{parseFloat(it.qty) || 0}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: '#555' }}>{fmt$(it.price)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: '#1a2620', fontWeight: 600 }}>{fmt$((parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0))}</td>
                </tr>
              ))}
              {items.filter((it) => it.desc || it.price).length === 0 && (
                <tr><td colSpan={4} style={{ padding: '16px 12px', color: '#aaa', fontStyle: 'italic' }}>No line items yet</td></tr>
              )}
            </tbody>
          </table>

          {/* totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <table style={{ fontSize: 13, minWidth: 240 }}>
              <tbody>
                <tr><td style={{ padding: '4px 12px', color: '#666' }}>Subtotal</td><td style={{ padding: '4px 12px', textAlign: 'right', color: '#1a2620' }}>{fmt$(subtotal)}</td></tr>
                {taxEnabled && <tr><td style={{ padding: '4px 12px', color: '#666' }}>Tax ({parseFloat(taxRate) || 0}%)</td><td style={{ padding: '4px 12px', textAlign: 'right', color: '#1a2620' }}>{fmt$(taxAmt)}</td></tr>}
                <tr style={{ borderTop: '2px solid #1a3320' }}><td style={{ padding: '8px 12px', fontWeight: 900, color: '#1a3320', fontSize: 15 }}>Total Due</td><td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 900, color: '#1a3320', fontSize: 15 }}>{fmt$(total)}</td></tr>
              </tbody>
            </table>
          </div>

          {/* notes + footer */}
          {notes && (
            <div style={{ marginTop: 26, paddingTop: 14, borderTop: '1px solid #e2e8e2' }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7dbc8a' }}>Notes</div>
              <div style={{ fontSize: 12.5, color: '#555', marginTop: 5, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{notes}</div>
            </div>
          )}
          <div style={{ marginTop: 30, textAlign: 'center', fontSize: 11, color: '#9bb0a0' }}>
            {COMPANY.name} · {COMPANY.web} · Make checks payable to {COMPANY.name}
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 900px) { :global(.ip-grid) { grid-template-columns: 1fr !important; } }
      `}</style>
    </PortalLayout>
  )
}
