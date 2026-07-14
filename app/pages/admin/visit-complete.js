import Head from 'next/head'
import { useState } from 'react'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { SKU_PRICES, isSubscriptionSKU } from '../../lib/sku-engine'

export async function getServerSideProps({ req, query }) {
  const session = await getSessionFromRequest(req)
  if (!session || session.email !== (process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com')) {
    return { redirect: { destination: '/dashboard', permanent: false } }
  }
  return { props: { isAdmin: true, prefillEmail: query.email || '' } }
}

const ONE_TIME_SKUS = Object.entries(SKU_PRICES)
  .filter(([sku]) => !isSubscriptionSKU(sku) && sku !== 'ASSESS' && sku !== 'CHK')
  .map(([sku, price]) => ({ sku, price }))

const SKU_LABELS = {
  'TRAP-MAINT-1': 'Trap Maintenance (1 trap)',
  'TRAP-MAINT-2': 'Trap Maintenance (2 traps)',
  'TRAP-INSTALL': 'Trap Installation',
  'TIMER-INSTALL': 'Timer Installation',
  'CO2-ADDON': 'CO₂ Add-on',
  'WKD-SURCH': 'Weekend Surcharge',
  BAIT: 'Generic Bait Pack',
  'BG-SWEETSCENT': 'BG Sweet Scent',
  BARRIER: 'Barrier Treatment',
  'TANK-STRAPS': 'Tank Straps',
  'MQ-INST': 'Mosqitter Installation',
  'MQ-TSHOOT': 'Mosqitter Troubleshoot',
  'NONCO2-UNIT': 'Non-CO₂ Unit',
  TANK1: 'Tank Exchange (1 tank)',
  TANK2: 'Tank Exchange (2 tanks)',
  TANK3: 'Tank Exchange (3 tanks)',
  TANK4: 'Tank Exchange (4 tanks)',
  TANK6: 'Tank Exchange (6 tanks)',
  TANK10: 'Tank Exchange (10 tanks)',
  'OWN-BG': 'Owned BG Service (per trap)',
  'OWN-MQ': 'Owned Mosqitter Service',
  'OWN-NONCO2': 'Owned Non-CO₂ Service',
}

const SKU_GROUPS = [
  {
    label: 'Trap Maintenance',
    skus: ['TRAP-MAINT-1', 'TRAP-MAINT-2', 'TRAP-INSTALL'],
  },
  {
    label: 'Tank Exchange',
    skus: ['TANK1', 'TANK2', 'TANK3', 'TANK4', 'TANK6', 'TANK10'],
  },
  {
    label: 'Add-ons',
    skus: ['TIMER-INSTALL', 'CO2-ADDON', 'BAIT', 'BG-SWEETSCENT', 'BARRIER', 'TANK-STRAPS', 'WKD-SURCH'],
  },
  {
    label: 'Service',
    skus: ['MQ-INST', 'MQ-TSHOOT', 'OWN-BG', 'OWN-MQ', 'OWN-NONCO2', 'NONCO2-UNIT'],
  },
]

export default function VisitComplete({ isAdmin, prefillEmail }) {
  const [email, setEmail] = useState(prefillEmail || '')
  const [customer, setCustomer] = useState(null)
  const [loadingCustomer, setLoadingCustomer] = useState(false)
  const [customerError, setCustomerError] = useState(null)

  const [selectedSkus, setSelectedSkus] = useState([])
  const [trapMaintCount, setTrapMaintCount] = useState(1)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  async function lookupCustomer(e) {
    e.preventDefault()
    setLoadingCustomer(true)
    setCustomer(null)
    setCustomerError(null)
    setSelectedSkus([])
    setResult(null)
    try {
      const res = await fetch(`/api/admin/clients?email=${encodeURIComponent(email)}`)
      if (!res.ok) throw new Error('Not found')
      const data = await res.json()
      setCustomer(data)
    } catch {
      setCustomerError('Customer not found — check the email address.')
    } finally {
      setLoadingCustomer(false)
    }
  }

  function toggleSku(sku) {
    setSelectedSkus((prev) =>
      prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku]
    )
  }

  // Build effective SKU list — always use the trap count dropdown to pick the right maint SKU
  function effectiveSkus() {
    return selectedSkus.map((s) => {
      if (s === 'TRAP-MAINT-1' || s === 'TRAP-MAINT-2') {
        return trapMaintCount === 2 ? 'TRAP-MAINT-2' : 'TRAP-MAINT-1'
      }
      return s
    })
  }

  function totalAmount() {
    return effectiveSkus().reduce((sum, sku) => sum + (SKU_PRICES[sku] ?? 0), 0)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!customer) return
    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/complete-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: customer.email,
          skus: effectiveSkus(),
          notes,
        }),
      })
      const data = await res.json()
      setResult(res.ok ? { success: true, ...data } : { success: false, error: data.error })
    } catch {
      setResult({ success: false, error: 'Network error' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Head><title>Log Visit · GreenGuard Admin</title></Head>
      <PortalLayout title="Log Visit" isAdmin={isAdmin}>

        {/* Customer lookup */}
        <form onSubmit={lookupCustomer} style={{ display: 'flex', gap: 10, marginBottom: 28, maxWidth: 480 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Customer email"
            required
            style={{
              flex: 1, padding: '10px 14px', background: 'var(--bg-card)',
              border: '1px solid rgba(var(--green-rgb),0.25)', borderRadius: 6,
              color: 'var(--text)', fontSize: '0.9rem',
            }}
          />
          <button type="submit" className="btn-gold" disabled={loadingCustomer} style={{ fontSize: '0.85rem' }}>
            {loadingCustomer ? 'Looking up…' : 'Look up'}
          </button>
        </form>

        {customerError && (
          <div style={{ color: 'var(--danger)', marginBottom: 20, fontSize: '0.9rem' }}>{customerError}</div>
        )}

        {customer && (
          <>
            {/* Customer summary */}
            <div className="card" style={{ maxWidth: 560, marginBottom: 24 }}>
              <span className="tag">Customer</span>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', marginTop: 8 }}>{customer.name || customer.email}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 2 }}>{customer.email}</div>
              {customer.address && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 2 }}>{customer.address}</div>}
              <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                {customer.systemType && <span>System: <strong style={{ color: 'var(--text)' }}>{customer.systemType}</strong></span>}
                {customer.trapCount && <span>Traps: <strong style={{ color: 'var(--text)' }}>{customer.trapCount}</strong></span>}
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              {/* SKU Groups */}
              {SKU_GROUPS.map((group) => (
                <div key={group.label} style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                    {group.label}
                  </div>
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                    {group.skus.map((sku) => {
                      if (!SKU_PRICES[sku] && SKU_PRICES[sku] !== 0) return null
                      const checked = selectedSkus.includes(sku)
                      return (
                        <label
                          key={sku}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 14px',
                            background: checked ? 'rgba(var(--green-rgb),0.08)' : 'var(--bg-alt)',
                            border: `1px solid ${checked ? 'rgba(var(--green-rgb),0.30)' : 'rgba(var(--green-rgb),0.15)'}`,
                            borderRadius: 6, cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSku(sku)}
                            style={{ accentColor: 'var(--green)', width: 16, height: 16 }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{SKU_LABELS[sku] || sku}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                              ${SKU_PRICES[sku].toFixed(2)}
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Trap maintenance count */}
              {(selectedSkus.includes('TRAP-MAINT-1') || selectedSkus.includes('TRAP-MAINT-2')) && (
                <div style={{ marginBottom: 20, maxWidth: 240 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
                    Number of traps maintained
                  </label>
                  <select
                    value={trapMaintCount}
                    onChange={(e) => setTrapMaintCount(Number(e.target.value))}
                    style={{
                      width: '100%', padding: '10px 12px',
                      background: 'var(--bg-card)',
                      border: '1px solid rgba(var(--green-rgb),0.25)',
                      borderRadius: 6, color: 'var(--text)', fontSize: '0.9rem',
                    }}
                  >
                    <option value={1}>1 trap — $29.99</option>
                    <option value={2}>2 traps — $49.99</option>
                  </select>
                </div>
              )}

              {/* Notes */}
              <div style={{ marginBottom: 20, maxWidth: 560 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
                  Visit notes (saved to HubSpot)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Any observations, issues, or follow-ups from this visit…"
                  style={{
                    width: '100%', padding: '12px 14px',
                    background: 'var(--bg-card)',
                    border: '1px solid rgba(var(--green-rgb),0.25)',
                    borderRadius: 6, color: 'var(--text)', fontSize: '0.9rem',
                    fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Total + submit */}
              {selectedSkus.length > 0 && (
                <div style={{
                  background: 'rgba(var(--gold-rgb),0.08)', border: '1px solid rgba(var(--gold-rgb),0.20)',
                  borderRadius: 8, padding: '14px 18px', marginBottom: 20, maxWidth: 400,
                }}>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginBottom: 6 }}>Items to invoice</div>
                  {effectiveSkus().map((sku) => (
                    <div key={sku} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: 4 }}>
                      <span>{SKU_LABELS[sku] || sku}</span>
                      <span style={{ color: 'var(--gold)', fontWeight: 700 }}>${(SKU_PRICES[sku] || 0).toFixed(2)}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid rgba(var(--gold-rgb),0.20)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                    <span>Total</span>
                    <span style={{ color: 'var(--gold)' }}>${totalAmount().toFixed(2)}</span>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || selectedSkus.length === 0}
                className="btn-gold"
              >
                {submitting ? 'Submitting…' : 'Complete Visit & Add to Invoice'}
              </button>
            </form>

            {result && (
              <div style={{
                marginTop: 20, padding: '14px 18px',
                background: result.success ? 'rgba(var(--green-rgb),0.08)' : 'rgba(var(--danger-rgb),0.10)',
                border: `1px solid ${result.success ? 'rgba(var(--green-rgb),0.25)' : 'rgba(var(--danger-rgb),0.30)'}`,
                borderRadius: 8, fontSize: '0.9rem',
                color: result.success ? 'var(--ok)' : 'var(--danger)',
                fontWeight: 700,
              }}>
                {result.success
                  ? `✓ Visit logged — ${result.invoiceItemsAdded} item(s) added to next invoice. HubSpot updated.`
                  : `Error: ${result.error}`}
              </div>
            )}
          </>
        )}
      </PortalLayout>
    </>
  )
}
