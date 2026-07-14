import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { useLazyData, LazyLoading, LazyError } from '../../components/useLazyData'

export async function getServerSideProps({ req, res }) {
  res?.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=30')
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }
  return { props: {} }
}

function fmt$(cents) { return `$${(cents / 100).toFixed(2)}` }
function fmtDate(unix) { return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }

const STATUS_COLOR = { paid: 'var(--green)', open: 'var(--warn)', draft: 'var(--gold)', void: 'rgba(var(--text-rgb),0.35)' }

// Heavy data (customer list) loads client-side; the page shell paints immediately.
export default function InvoiceEditor() {
  const { data, error, reload } = useLazyData('/api/admin/invoice-data')
  if (error) return <LazyError error={error} onRetry={reload} />
  if (!data) return <LazyLoading />
  return <InvoiceEditorView {...data} />
}

function InvoiceEditorView({ customers = [] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [email, setEmail] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false)
  const [selectedSku, setSelectedSku] = useState('')
  const [customDesc, setCustomDesc] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [customQty, setCustomQty] = useState('1')
  const [addingCustom, setAddingCustom] = useState(false)
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState(null)
  const [expandedInv, setExpandedInv] = useState(null)
  const [pending, setPending] = useState(null)
  const [pendingLoading, setPendingLoading] = useState(false)
  const [approvingAll, setApprovingAll] = useState(false)
  const [expandedDraft, setExpandedDraft] = useState(null)
  const [draftAddSku, setDraftAddSku] = useState({})  // { invoiceId: sku }
  const [draftAdding, setDraftAdding] = useState(null)  // invoiceId currently adding
  const [sentDrafts, setSentDrafts] = useState({})  // { invoiceId: { status, collectionMethod } }
  const [sendingDraft, setSendingDraft] = useState(null)  // invoiceId currently submitting
  const searchRef = useRef(null)
  const addItemInFlight = useRef(false)
  const addCustomInFlight = useRef(false)
  const draftAddInFlight = useRef(new Set())

  const filtered = search.length >= 1
    ? customers.filter((c) => {
        const q = search.toLowerCase()
        return (c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)
      }).slice(0, 10)
    : []

  useEffect(() => {
    loadPending()
  }, [])

  useEffect(() => {
    if (router.isReady && router.query.email) {
      const e = router.query.email
      const match = customers.find((c) => c.email === e)
      setSearch(match?.name || e)
      setEmail(e)
      loadCustomer(e)
    }
  }, [router.isReady]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPending() {
    setPendingLoading(true)
    try {
      const res = await fetch('/api/admin/pending-invoices')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setPending({ ...json, _refreshedAt: new Date().toISOString() })
    } catch (e) {
      console.error('Failed to load pending invoices:', e)
    } finally {
      setPendingLoading(false)
    }
  }

  function selectCustomer(c) {
    setSearch(c.name || c.email)
    setEmail(c.email)
    setShowDropdown(false)
    loadCustomer(c.email)
  }

  async function loadCustomer(e) {
    const target = e || email
    if (!target) return
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const res = await fetch(`/api/admin/invoice-items?email=${encodeURIComponent(target)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setData(json)
      setSelectedSku(json.skuList?.[0]?.sku || '')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function addItem() {
    if (addItemInFlight.current) return
    addItemInFlight.current = true
    const requestId = crypto.randomUUID()
    try {
      if (!selectedSku || !data) return
      setAdding(true)
      const res = await fetch('/api/admin/invoice-items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', customerId: data.customer.id, sku: selectedSku, requestId }),
      })
      if (res.ok) { setMsg('Item added'); loadCustomer() }
      else { const j = await res.json(); setMsg(`Error: ${j.error}`) }
    } finally {
      addItemInFlight.current = false
      setAdding(false)
    }
  }

  async function addCustomItem() {
    if (addCustomInFlight.current) return
    addCustomInFlight.current = true
    const requestId = crypto.randomUUID()
    try {
      if (!data) return
      const desc = customDesc.trim()
      const price = parseFloat(customPrice)
      const qty = Math.max(1, parseInt(customQty, 10) || 1)
      if (!desc) { setMsg('Error: description required'); return }
      if (!Number.isFinite(price) || price <= 0) { setMsg('Error: enter a positive dollar amount'); return }
      setAddingCustom(true)
      const res = await fetch('/api/admin/invoice-items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-custom', customerId: data.customer.id, description: desc, unitPrice: price, qty, requestId }),
      })
      if (res.ok) { setMsg('Custom item added'); setCustomDesc(''); setCustomPrice(''); setCustomQty('1'); loadCustomer() }
      else { const j = await res.json(); setMsg(`Error: ${j.error}`) }
    } finally {
      addCustomInFlight.current = false
      setAddingCustom(false)
    }
  }

  async function removeItem(itemId) {
    const res = await fetch('/api/admin/invoice-items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', itemId }),
    })
    if (res.ok) { setMsg('Item removed'); loadCustomer() }
  }

  async function deleteLineItem(invoiceId, itemId) {
    if (!window.confirm('Remove this line item from the invoice?')) return
    const res = await fetch('/api/admin/invoice-items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-line', invoiceId, itemId }),
    })
    if (res.ok) { setMsg('Line item removed'); loadCustomer() }
    else { const j = await res.json(); setMsg(`Error: ${j.error}`) }
  }

  async function voidInvoice(invoiceId) {
    if (!window.confirm('Void this invoice? This cannot be undone.')) return
    const res = await fetch('/api/admin/invoice-items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'void', invoiceId }),
    })
    if (res.ok) { setMsg('Invoice voided'); loadCustomer() }
    else { const j = await res.json(); setMsg(`Error: ${j.error}`) }
  }

  async function deleteDraft(invoiceId) {
    if (!window.confirm('Delete this draft invoice? Removes it permanently.')) return
    const res = await fetch('/api/admin/invoice-items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-draft', invoiceId }),
    })
    if (res.ok) { setMsg('Draft deleted'); loadCustomer(); loadPending() }
    else { const j = await res.json(); setMsg(`Error: ${j.error}`) }
  }

  async function sendInvoice(invoiceId) {
    setSending(true)
    const res = await fetch('/api/admin/invoice-items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send', customerId: data?.customer.id, invoiceId }),
    })
    setSending(false)
    if (res.ok) { setMsg('Invoice sent to customer'); loadCustomer(); await loadPending() }
    else { const j = await res.json(); setMsg(`Error: ${j.error}`) }
  }

  async function approveAll() {
    if (!pending?.drafts?.length) return
    const total = pending.drafts.reduce((s, d) => s + (d.amountDue || 0), 0)
    const eligible = pending.drafts.filter((d) => (d.lineCount || 0) > 0)
    const empties = pending.drafts.length - eligible.length
    let msg = `Submit ${eligible.length} draft invoice${eligible.length === 1 ? '' : 's'} totaling ${fmt$(total)}?\n\n`
    msg += `Customers with a card on file will be charged now.\nCustomers without a card will receive an email with a payment link.\n\nThis is irreversible.`
    if (empties > 0) msg += `\n\n(${empties} empty draft${empties === 1 ? '' : 's'} will be skipped.)`
    if (!window.confirm(msg)) return

    setApprovingAll(true)
    const errors = []
    const successes = []
    for (const draft of eligible) {
      try {
        const res = await fetch('/api/admin/invoice-items', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send', customerId: draft.customerId, invoiceId: draft.id }),
        })
        const j = await res.json().catch(() => ({}))
        if (res.ok) {
          successes.push({ id: draft.id, status: j.status, collectionMethod: j.collectionMethod })
        } else {
          errors.push(`${draft.customerName || draft.customerEmail}: ${j.error || 'HTTP ' + res.status}`)
        }
      } catch (e) {
        errors.push(`${draft.customerName || draft.customerEmail}: ${e.message}`)
      }
    }
    setApprovingAll(false)
    // Mark in-session sent state for the successes so buttons lock immediately.
    if (successes.length) {
      setSentDrafts((prev) => {
        const next = { ...prev }
        for (const s of successes) next[s.id] = { status: s.status, collectionMethod: s.collectionMethod }
        return next
      })
    }
    if (errors.length) {
      alert(`Submitted ${successes.length}/${eligible.length}.\n\nErrors:\n${errors.join('\n')}`)
    } else {
      alert(`✓ Submitted all ${successes.length} drafts`)
    }
    await loadPending()
  }

  const input = { padding: '9px 12px', border: '1px solid rgba(var(--border-rgb),0.25)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.88rem', fontFamily: 'Inter, sans-serif', outline: 'none' }
  const btn = (v) => ({ padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.8rem', fontFamily: 'Inter, sans-serif', ...(v === 'gold' ? { background: 'var(--gold)', color: 'var(--text-on-accent)' } : v === 'green' ? { background: 'var(--green)', color: 'var(--text-on-accent)' } : v === 'red' ? { background: 'rgba(var(--danger-rgb),0.12)', color: 'var(--danger)', border: '1px solid rgba(var(--danger-rgb),0.2)' } : { background: 'rgba(var(--border-rgb),0.1)', color: 'var(--green-muted)', border: '1px solid rgba(var(--border-rgb),0.2)' }) })
  const SECTION = { fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 12, marginTop: 28 }

  return (
    <>
      <Head><title>Invoice Editor · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <div style={{ marginBottom: 24 }}>
          <span className="tag">Admin</span>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Invoice Editor</h1>
          <p style={{ fontSize: '0.85rem', color: 'rgba(var(--text-rgb),0.45)', margin: 0 }}>Find a customer and manage their invoices</p>
        </div>

        {/* Pending Approvals */}
        {pending && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
              <div style={SECTION}>Pending Approvals</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 28 }}>
                {pending._refreshedAt && (
                  <span style={{ fontSize: '0.72rem', color: 'rgba(var(--text-rgb),0.4)' }}>
                    Updated {new Date(pending._refreshedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                )}
                <button
                  onClick={loadPending}
                  disabled={pendingLoading}
                  style={{ ...btn('gold'), fontSize: '0.75rem', padding: '6px 12px' }}
                >
                  {pendingLoading ? 'Loading…' : '↻ Refresh'}
                </button>
              </div>
            </div>

            {/* KPI strip */}
            <div className="card" style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', fontSize: '0.85rem' }}>
              <div>
                <div style={{ color: 'rgba(var(--text-rgb),0.5)', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Drafts Ready</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--gold)' }}>{pending.drafts?.length || 0}</div>
              </div>
              <div>
                <div style={{ color: 'rgba(var(--text-rgb),0.5)', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Unbilled</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--warn)' }}>{pending.needsInvoice?.length || 0}</div>
              </div>
              <div>
                <div style={{ color: 'rgba(var(--text-rgb),0.5)', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Outstanding</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--green)' }}>
                  {fmt$(pending.drafts?.reduce((s, d) => s + d.amountDue, 0) || 0)}
                </div>
              </div>
            </div>

            {/* Draft invoices */}
            {pending.drafts?.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(var(--text-rgb),0.35)', marginBottom: 12 }}>Draft Invoices (ready to send)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pending.drafts.map((draft) => (
                    <div
                      key={draft.id}
                      style={{
                        padding: '12px',
                        border: '1px solid rgba(var(--border-rgb),0.15)',
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 200, cursor: 'pointer' }}
                             onClick={() => setExpandedDraft(expandedDraft === draft.id ? null : draft.id)}>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '0.68rem', color: 'rgba(var(--text-rgb),0.3)' }}>
                              {expandedDraft === draft.id ? '▲' : '▼'}
                            </span>
                            {draft.customerName || draft.customerEmail}
                            {draft.lineCount === 0 && (
                              <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: 3, background: 'rgba(var(--warn-rgb),0.15)', border: '1px solid rgba(var(--warn-rgb),0.3)', color: 'var(--warn)', fontWeight: 800 }}>
                                ⚠ EMPTY
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'rgba(var(--text-rgb),0.5)', marginTop: 2 }}>
                            {draft.serviceDate} · {draft.lineCount} item{draft.lineCount !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <div style={{ fontWeight: 900, fontSize: '0.95rem', color: 'var(--gold)' }}>{fmt$(draft.amountDue)}</div>
                        {(() => {
                          const submitted = sentDrafts[draft.id]
                          const isSubmitting = sendingDraft === draft.id
                          if (submitted) {
                            const isPaid = submitted.status === 'paid'
                            const verb = submitted.collectionMethod === 'send_invoice' ? 'Emailed' : (isPaid ? 'Paid' : 'Submitted')
                            return (
                              <button disabled style={{ ...btn('gold'), opacity: 0.55, cursor: 'not-allowed', background: 'rgba(var(--green-rgb),0.12)', color: 'var(--green)', border: '1px solid rgba(var(--green-rgb),0.3)' }}>
                                ✓ {verb}
                              </button>
                            )
                          }
                          return (
                            <button style={btn('gold')}
                              onClick={async () => {
                                if (sendingDraft) return
                                const who = draft.customerName || draft.customerEmail
                                const amt = fmt$(draft.amountDue)
                                if (!window.confirm(`Submit invoice for ${who} — ${amt}?\n\nIf they have a card on file, it will be charged now. Otherwise Stripe emails a hosted invoice link.\n\nThis is irreversible.`)) return
                                setSendingDraft(draft.id)
                                const r = await fetch('/api/admin/invoice-items', {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'send', customerId: draft.customerId, invoiceId: draft.id }),
                                })
                                const j = await r.json().catch(() => ({}))
                                setSendingDraft(null)
                                if (r.ok) {
                                  setSentDrafts((p) => ({ ...p, [draft.id]: { status: j.status, collectionMethod: j.collectionMethod } }))
                                  const verb = j.collectionMethod === 'send_invoice' ? `emailed to ${who}` : (j.status === 'paid' ? `charged ${amt} on card` : 'submitted')
                                  alert(`✓ Invoice ${verb}`)
                                  loadPending()
                                } else {
                                  alert(`Failed to submit invoice for ${who}:\n\n${j.error || ('HTTP ' + r.status)}`)
                                }
                              }}
                              disabled={isSubmitting || draft.lineCount === 0 || !!sendingDraft}
                              title={draft.lineCount === 0 ? 'Add at least one line item before sending' : ''}>
                              {isSubmitting ? 'Submitting…' : 'Send'}
                            </button>
                          )
                        })()}
                        <button onClick={async () => {
                          if (!window.confirm(`Delete this draft invoice for ${draft.customerName || draft.customerEmail}? This permanently removes it.`)) return
                          const r = await fetch('/api/admin/invoice-items', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'delete-draft', invoiceId: draft.id }),
                          })
                          if (r.ok) { setMsg('Draft deleted'); loadPending() }
                          else { const j = await r.json().catch(() => ({})); alert('Failed: ' + (j.error || r.status)) }
                        }}
                          style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(var(--danger-rgb),0.3)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                          Cancel
                        </button>
                        {draft.hostedUrl && (
                          <a href={draft.hostedUrl} target="_blank" rel="noopener noreferrer" style={{ ...btn('ghost'), textDecoration: 'none' }}>
                            ↗
                          </a>
                        )}
                      </div>

                      {expandedDraft === draft.id && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(var(--border-rgb),0.12)' }}>
                          {/* Existing line items */}
                          {draft.items?.length > 0 ? (
                            draft.items.map(line => (
                              <div key={line.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', padding: '7px 0', borderBottom: '1px solid rgba(var(--border-rgb),0.06)' }}>
                                <span style={{ color: 'rgba(var(--text-rgb),0.75)', flex: 1 }}>{line.description}</span>
                                <span style={{ fontWeight: 700, marginLeft: 16 }}>{fmt$(line.amount)}</span>
                                <button onClick={async () => {
                                  if (!window.confirm('Remove this line item?')) return
                                  await fetch('/api/admin/invoice-items', {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'delete-line', invoiceId: draft.id, itemId: line.id }),
                                  })
                                  loadPending()
                                }} style={{ marginLeft: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(var(--danger-rgb),0.25)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                                  ✕
                                </button>
                              </div>
                            ))
                          ) : (
                            <div style={{ fontSize: '0.78rem', color: 'rgba(var(--warn-rgb),0.7)', padding: '6px 0' }}>
                              No line items yet. Add at least one before sending.
                            </div>
                          )}

                          {/* Add line item */}
                          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                            <select value={draftAddSku[draft.id] || ''}
                                    onChange={(e) => setDraftAddSku({ ...draftAddSku, [draft.id]: e.target.value })}
                                    style={{ ...input, flex: '1 1 220px' }}>
                              <option value="">— Add line item —</option>
                              {(pending.skuList || []).map(({ sku, price }) => (
                                <option key={sku} value={sku}>{sku} — ${price.toFixed(2)}</option>
                              ))}
                            </select>
                            <button style={btn('green')}
                                    disabled={!draftAddSku[draft.id] || draftAdding === draft.id}
                                    onClick={async () => {
                                      if (draftAddInFlight.current.has(draft.id)) return
                                      draftAddInFlight.current.add(draft.id)
                                      const requestId = crypto.randomUUID()
                                      try {
                                        const sku = draftAddSku[draft.id]
                                        if (!sku) return
                                        setDraftAdding(draft.id)
                                        const r = await fetch('/api/admin/invoice-items', {
                                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ action: 'add', customerId: draft.customerId, invoiceId: draft.id, sku, requestId }),
                                        })
                                        if (r.ok) {
                                          setDraftAddSku({ ...draftAddSku, [draft.id]: '' })
                                          loadPending()
                                        } else {
                                          const j = await r.json().catch(() => ({}))
                                          alert('Failed: ' + (j.error || r.status))
                                        }
                                      } finally {
                                        draftAddInFlight.current.delete(draft.id)
                                        setDraftAdding(null)
                                      }
                                    }}>
                              {draftAdding === draft.id ? 'Adding…' : '+ Add'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {pending.drafts.length > 1 && (
                  <button
                    onClick={approveAll}
                    disabled={approvingAll}
                    style={{ ...btn('green'), marginTop: 12, width: '100%' }}
                  >
                    {approvingAll ? 'Approving…' : `Approve All ${pending.drafts.length} Drafts`}
                  </button>
                )}
              </div>
            )}

            {/* Appointments without invoices */}
            {pending.needsInvoice?.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(var(--text-rgb),0.35)', marginBottom: 12 }}>Appointments without invoices (past 7 days)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pending.needsInvoice.map((apt, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px',
                        border: `1px solid ${apt.needsEmail ? 'rgba(var(--warn-rgb),0.3)' : 'rgba(var(--border-rgb),0.15)'}`,
                        borderRadius: 6,
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{apt.customerName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(var(--text-rgb),0.5)', marginTop: 2 }}>
                          {apt.date} · {apt.serviceType}
                        </div>
                        {apt.needsEmail && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--warn)', marginTop: 4, fontWeight: 700 }}>
                            ⚠ No email in calendar event — manual lookup needed
                          </div>
                        )}
                        {apt.email && (
                          <div style={{ fontSize: '0.72rem', color: 'rgba(var(--text-rgb),0.4)', marginTop: 2 }}>
                            {apt.email}
                          </div>
                        )}
                      </div>
                      <a href={`/admin/rounds?date=${apt.date}${apt.email ? `&email=${encodeURIComponent(apt.email)}` : ''}`} style={{ ...btn('ghost'), textDecoration: 'none', fontSize: '0.75rem' }}>
                        → Rounds
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Customer lookup — name search with dropdown */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div ref={searchRef} style={{ position: 'relative', flex: '1 1 280px' }}>
            <input
              style={{ ...input, width: '100%', boxSizing: 'border-box' }}
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowDropdown(true) }}
              onFocus={() => setShowDropdown(true)}
              onKeyDown={(e) => { if (e.key === 'Enter' && email) loadCustomer(); if (e.key === 'Escape') setShowDropdown(false) }}
            />
            {showDropdown && filtered.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid rgba(var(--border-rgb),0.25)', borderRadius: 8, zIndex: 50, maxHeight: 280, overflowY: 'auto', marginTop: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                {filtered.map((c) => (
                  <div key={c.id} onClick={() => selectCustomer(c)}
                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(var(--border-rgb),0.08)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(var(--border-rgb),0.08)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{c.name || c.email}</div>
                    {c.name && <div style={{ fontSize: '0.75rem', color: 'rgba(var(--text-rgb),0.45)' }}>{c.email}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button style={btn('gold')} onClick={() => loadCustomer()} disabled={loading || !email}>{loading ? 'Loading…' : 'Load'}</button>
        </div>

        {error && <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(var(--danger-rgb),0.08)', border: '1px solid rgba(var(--danger-rgb),0.2)', color: 'var(--danger)', fontSize: '0.85rem', marginBottom: 20 }}>{error}</div>}
        {msg && <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(var(--green-rgb),0.06)', border: '1px solid rgba(var(--green-rgb),0.2)', color: 'var(--green)', fontSize: '0.85rem', marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>{msg} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer' }}>×</button></div>}

        {data && (
          <>
            {/* Customer info */}
            <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>{data.customer.name || data.customer.email}</div>
                <div style={{ fontSize: '0.82rem', color: 'rgba(var(--text-rgb),0.5)', marginTop: 2 }}>{data.customer.email}</div>
                {data.customer.phone && <div style={{ fontSize: '0.82rem', color: 'rgba(var(--text-rgb),0.5)' }}>{data.customer.phone}</div>}
                {data.subscription && (
                  <div style={{ marginTop: 8, fontSize: '0.82rem', color: 'var(--green)', fontWeight: 700 }}>
                    {data.subscription.label} · ${(data.subscription.amount / 100).toFixed(0)}/mo
                  </div>
                )}
              </div>
              <a href={`https://dashboard.stripe.com/customers/${data.customer.id}`} target="_blank" rel="noopener noreferrer" style={btn('ghost')}>Open in Stripe →</a>
            </div>

            {/* Add item */}
            <div style={SECTION}>Add Invoice Item</div>
            <div className="card">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={selectedSku} onChange={(e) => setSelectedSku(e.target.value)} style={{ ...input, flex: '1 1 200px' }}>
                  {(data.skuList || []).map(({ sku, price }) => (
                    <option key={sku} value={sku}>{sku} — ${price.toFixed(2)}</option>
                  ))}
                </select>
                <button style={btn('green')} onClick={addItem} disabled={adding}>{adding ? 'Adding…' : '+ Add to Next Invoice'}</button>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'rgba(var(--text-rgb),0.35)', margin: '10px 0 0' }}>
                Items are added as pending invoice items and included on the next invoice you send.
              </p>

              {/* Custom / one-off line item (no SKU) */}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(var(--border-rgb),0.12)' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(var(--text-rgb),0.5)', marginBottom: 10 }}>Custom / One-Off Item</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input value={customDesc} onChange={(e) => setCustomDesc(e.target.value)} placeholder="Description (e.g. Extra tank swap)" style={{ ...input, flex: '3 1 240px' }} />
                  <input value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} inputMode="decimal" placeholder="$ each" style={{ ...input, flex: '1 1 90px' }} />
                  <input value={customQty} onChange={(e) => setCustomQty(e.target.value)} inputMode="numeric" placeholder="Qty" style={{ ...input, flex: '0 1 70px' }} />
                  <button style={btn('green')} onClick={addCustomItem} disabled={addingCustom}>{addingCustom ? 'Adding…' : '+ Add Custom'}</button>
                </div>
              </div>
            </div>

            {/* Pending items */}
            {data.pendingItems?.length > 0 && (
              <>
                <div style={SECTION}>Pending Items (not yet invoiced)</div>
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                    <thead><tr style={{ borderBottom: '1px solid rgba(var(--border-rgb),0.15)' }}>
                      {['Description', 'Amount', ''].map((h) => (
                        <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(var(--text-rgb),0.35)' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {data.pendingItems.map((item) => (
                        <tr key={item.id} style={{ borderBottom: '1px solid rgba(var(--border-rgb),0.08)' }}>
                          <td style={{ padding: '10px 14px' }}>{item.description}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 700 }}>{fmt$(item.amount)}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <button style={btn('red')} onClick={() => removeItem(item.id)}>Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(var(--border-rgb),0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', color: 'rgba(var(--text-rgb),0.5)' }}>{data.pendingItems.length} pending item{data.pendingItems.length !== 1 ? 's' : ''}</span>
                    <button style={btn('gold')} onClick={() => sendInvoice(null)} disabled={sending}>{sending ? 'Sending…' : 'Create & Send Invoice'}</button>
                  </div>
                </div>
              </>
            )}

            {/* Invoice history */}
            {data.invoices?.length > 0 && (
              <>
                <div style={SECTION}>Invoice History</div>
                {data.invoices.map((inv) => {
                  const isExpanded = expandedInv === inv.id
                  const isDraft = inv.status === 'draft'
                  const isOpen = inv.status === 'open'
                  const amount = fmt$(inv.status === 'open' ? inv.amountDue : inv.amountPaid || inv.amountDue)
                  return (
                    <div key={inv.id} className="card" style={{ marginBottom: 10 }}>
                      {/* Header row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                        <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => setExpandedInv(isExpanded ? null : inv.id)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                            <span style={{ fontWeight: 800 }}>{inv.number || inv.id.slice(-8)}</span>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: STATUS_COLOR[inv.status] || 'rgba(var(--text-rgb),0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{inv.status}</span>
                            <span style={{ fontSize: '0.68rem', color: 'rgba(var(--text-rgb),0.3)' }}>{isExpanded ? '▲' : '▼'}</span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'rgba(var(--text-rgb),0.45)' }}>{fmtDate(inv.created)} · {amount}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          {isDraft && <button style={btn('gold')} onClick={() => sendInvoice(inv.id)} disabled={sending}>{sending ? 'Sending…' : 'Finalize & Send'}</button>}
                          {isDraft && <button style={btn('red')} onClick={() => deleteDraft(inv.id)}>Delete</button>}
                          {isOpen && (
                            <button style={btn('gold')} onClick={() => sendInvoice(inv.id)} disabled={sending}
                              title={inv.collectionMethod === 'charge_automatically' ? 'Re-attempt charge on card on file' : 'Resend the hosted invoice email to the customer'}>
                              {sending ? 'Sending…' : (inv.collectionMethod === 'charge_automatically' ? 'Charge Now' : 'Resend Email')}
                            </button>
                          )}
                          {isOpen && <button style={btn('red')} onClick={() => voidInvoice(inv.id)}>Void</button>}
                          {inv.hostedUrl && <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" style={{ ...btn('ghost'), textDecoration: 'none' }} title="Preview the page the customer sees">Preview ↗</a>}
                          {inv.pdfUrl && <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--green-muted)', fontWeight: 700 }}>PDF</a>}
                        </div>
                      </div>

                      {/* Expanded line items */}
                      {isExpanded && inv.items?.length > 0 && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(var(--border-rgb),0.12)' }}>
                          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(var(--text-rgb),0.35)', marginBottom: 8 }}>Line Items</div>
                          {inv.items.map((line) => (
                            <div key={line.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', padding: '7px 0', borderBottom: '1px solid rgba(var(--border-rgb),0.06)' }}>
                              <span style={{ color: 'rgba(var(--text-rgb),0.75)', flex: 1 }}>{line.description}</span>
                              <span style={{ fontWeight: 700, marginLeft: 16 }}>{fmt$(line.amount)}</span>
                              {isDraft && (
                                <button
                                  onClick={() => deleteLineItem(inv.id, line.invoiceItem || line.id)}
                                  style={{ marginLeft: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(var(--danger-rgb),0.25)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
                                  ✕
                                </button>
                              )}
                            </div>
                          ))}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, fontWeight: 900, color: isDraft ? 'var(--gold)' : inv.status === 'paid' ? 'var(--green)' : 'var(--warn)' }}>
                            Total: {amount}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </>
        )}
      </PortalLayout>
    </>
  )
}
