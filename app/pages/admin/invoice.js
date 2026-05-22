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

function fmt$(cents) { return `$${(cents / 100).toFixed(2)}` }
function fmtDate(unix) { return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }

const STATUS_COLOR = { paid: '#7dffaa', open: '#ffb060', draft: '#c9a84c', void: 'rgba(212,230,202,0.35)' }

export default function InvoiceEditor() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false)
  const [selectedSku, setSelectedSku] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (router.isReady && router.query.email) {
      setEmail(router.query.email)
      loadCustomer(router.query.email)
    }
  }, [router.isReady]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!selectedSku || !data) return
    setAdding(true)
    const res = await fetch('/api/admin/invoice-items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', customerId: data.customer.id, sku: selectedSku }),
    })
    setAdding(false)
    if (res.ok) { setMsg('Item added'); loadCustomer() }
    else { const j = await res.json(); setMsg(`Error: ${j.error}`) }
  }

  async function removeItem(itemId) {
    const res = await fetch('/api/admin/invoice-items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', itemId }),
    })
    if (res.ok) { setMsg('Item removed'); loadCustomer() }
  }

  async function sendInvoice(invoiceId) {
    setSending(true)
    const res = await fetch('/api/admin/invoice-items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send', customerId: data.customer.id, invoiceId }),
    })
    setSending(false)
    if (res.ok) { setMsg('Invoice sent to customer'); loadCustomer() }
    else { const j = await res.json(); setMsg(`Error: ${j.error}`) }
  }

  const input = { padding: '9px 12px', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.88rem', fontFamily: 'Nunito Sans, sans-serif', outline: 'none' }
  const btn = (v) => ({ padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.8rem', fontFamily: 'Nunito Sans, sans-serif', ...(v === 'gold' ? { background: '#c9a84c', color: '#0d1a10' } : v === 'green' ? { background: '#7dffaa', color: '#0d1a10' } : v === 'red' ? { background: 'rgba(255,100,100,0.12)', color: '#ff8080', border: '1px solid rgba(255,100,100,0.2)' } : { background: 'rgba(122,171,130,0.1)', color: '#7aab82', border: '1px solid rgba(122,171,130,0.2)' }) })
  const SECTION = { fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 12, marginTop: 28 }

  return (
    <>
      <Head><title>Invoice Editor · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <div style={{ marginBottom: 24 }}>
          <span className="tag">Admin</span>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Invoice Editor</h1>
          <p style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.45)', margin: 0 }}>Find a customer and manage their invoices</p>
        </div>

        {/* Customer lookup */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          <input style={{ ...input, flex: '1 1 280px' }} type="email" placeholder="customer@email.com" value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadCustomer()} />
          <button style={btn('gold')} onClick={() => loadCustomer()} disabled={loading}>{loading ? 'Loading…' : 'Load Customer'}</button>
        </div>

        {error && <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(255,100,100,0.08)', border: '1px solid rgba(255,100,100,0.2)', color: '#ff8080', fontSize: '0.85rem', marginBottom: 20 }}>{error}</div>}
        {msg && <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(125,255,170,0.06)', border: '1px solid rgba(125,255,170,0.2)', color: '#7dffaa', fontSize: '0.85rem', marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>{msg} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: '#7dffaa', cursor: 'pointer' }}>×</button></div>}

        {data && (
          <>
            {/* Customer info */}
            <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>{data.customer.name || data.customer.email}</div>
                <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.5)', marginTop: 2 }}>{data.customer.email}</div>
                {data.customer.phone && <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.5)' }}>{data.customer.phone}</div>}
                {data.subscription && (
                  <div style={{ marginTop: 8, fontSize: '0.82rem', color: '#7dffaa', fontWeight: 700 }}>
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
              <p style={{ fontSize: '0.75rem', color: 'rgba(212,230,202,0.35)', margin: '10px 0 0' }}>
                Items are added as pending invoice items and included on the next invoice you send.
              </p>
            </div>

            {/* Pending items */}
            {data.pendingItems?.length > 0 && (
              <>
                <div style={SECTION}>Pending Items (not yet invoiced)</div>
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                    <thead><tr style={{ borderBottom: '1px solid rgba(122,171,130,0.15)' }}>
                      {['Description', 'Amount', ''].map((h) => (
                        <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {data.pendingItems.map((item) => (
                        <tr key={item.id} style={{ borderBottom: '1px solid rgba(122,171,130,0.08)' }}>
                          <td style={{ padding: '10px 14px' }}>{item.description}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 700 }}>{fmt$(item.amount)}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <button style={btn('red')} onClick={() => removeItem(item.id)}>Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(122,171,130,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.5)' }}>{data.pendingItems.length} pending item{data.pendingItems.length !== 1 ? 's' : ''}</span>
                    <button style={btn('gold')} onClick={() => sendInvoice(null)} disabled={sending}>{sending ? 'Sending…' : 'Create & Send Invoice'}</button>
                  </div>
                </div>
              </>
            )}

            {/* Invoice history */}
            {data.invoices?.length > 0 && (
              <>
                <div style={SECTION}>Invoice History</div>
                {data.invoices.map((inv) => (
                  <div key={inv.id} className="card" style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <span style={{ fontWeight: 800 }}>{inv.number}</span>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: STATUS_COLOR[inv.status] || 'rgba(212,230,202,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{inv.status}</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.45)' }}>{fmtDate(inv.created)}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontWeight: 900, fontSize: '1rem' }}>
                          {fmt$(inv.status === 'open' ? inv.amountDue : inv.amountPaid || inv.amountDue)}
                        </span>
                        {inv.status === 'draft' && (
                          <button style={btn('gold')} onClick={() => sendInvoice(inv.id)} disabled={sending}>{sending ? 'Sending…' : 'Finalize & Send'}</button>
                        )}
                        {inv.hostedUrl && <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" style={{ ...btn('ghost'), textDecoration: 'none' }}>View</a>}
                        {inv.pdfUrl && <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: '#7aab82', fontWeight: 700 }}>PDF</a>}
                      </div>
                    </div>
                    {inv.items?.length > 0 && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(122,171,130,0.1)' }}>
                        {inv.items.map((line) => (
                          <div key={line.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'rgba(212,230,202,0.55)', padding: '2px 0' }}>
                            <span>{line.description}</span>
                            <span>{fmt$(line.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </PortalLayout>
    </>
  )
}
