import Head from 'next/head'
import { useState, useRef } from 'react'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { SKU_PRICES, isSubscriptionSKU, calculateRevenue } from '../../lib/sku-engine'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session || session.email !== (process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com')) {
    return { redirect: { destination: '/dashboard', permanent: false } }
  }
  return { props: { isAdmin: true } }
}

const SYSTEM_OPTIONS = [
  { label: 'Biogents CO₂ — 1 Trap', skus: ['BG1'], monthly: true },
  { label: 'Biogents CO₂ — 2 Traps', skus: ['BG2'], monthly: true },
  { label: 'Biogents CO₂ — 3 Traps', skus: ['BG3'], monthly: true },
  { label: 'Mosqitter Rental', skus: ['MQ-RENT'], monthly: true },
  { label: 'Mosqitter Service Only', skus: ['MQ-SVC'], monthly: true },
  { label: 'Mosqitter Installation', skus: ['MQ-INST'], monthly: false },
  { label: 'Owned Biogents Service', skus: ['OWN-BG'], monthly: true },
  { label: 'Owned Mosqitter Service', skus: ['OWN-MQ'], monthly: true },
]

const ADDON_OPTIONS = [
  { sku: 'TIMER-INSTALL', label: 'Timer Installation', oneTime: true },
  { sku: 'BAIT', label: 'Mosquito Attractant', oneTime: true },
  { sku: 'BG-SWEETSCENT', label: 'BG Sweet Scent', oneTime: false },
  { sku: 'CO2-ADDON', label: 'CO₂ Add-on', oneTime: false },
  { sku: 'BARRIER', label: 'Barrier Treatment', oneTime: true },
  { sku: 'WKD-SURCH', label: 'Weekend Surcharge', oneTime: true },
]

const TANK_OPTIONS = [
  { value: '', label: 'No tank exchange' },
  { value: 'TANK1', label: '1 tank ($89.99)' },
  { value: 'TANK2', label: '2 tanks ($159.99)' },
  { value: 'TANK3', label: '3 tanks ($249.99)' },
  { value: 'TANK4', label: '4 tanks ($279.99)' },
  { value: 'TANK6', label: '6 tanks ($399.99)' },
  { value: 'TANK10', label: '10 tanks ($889.98)' },
]

const SKU_LABELS = {
  BG1: 'Biogents CO₂ 1-Trap Rental', BG2: 'Biogents CO₂ 2-Trap Rental', BG3: 'Biogents CO₂ 3-Trap Rental',
  'MQ-RENT': 'Mosqitter Rental', 'MQ-SVC': 'Mosqitter Service', 'MQ-INST': 'Mosqitter Installation',
  'OWN-BG': 'Owned Biogents Service', 'OWN-MQ': 'Owned Mosqitter Service',
  'TIMER-INSTALL': 'Timer Installation', BAIT: 'Mosquito Attractant', 'BG-SWEETSCENT': 'BG Sweet Scent',
  'CO2-ADDON': 'CO₂ Add-on', BARRIER: 'Barrier Treatment', 'WKD-SURCH': 'Weekend Surcharge',
  TANK1: 'Tank Exchange (1)', TANK2: 'Tank Exchange (2)', TANK3: 'Tank Exchange (3)',
  TANK4: 'Tank Exchange (4)', TANK6: 'Tank Exchange (6)', TANK10: 'Tank Exchange (10)',
}

function buildQuoteItems(systemIdx, addons, tankSku) {
  const sys = SYSTEM_OPTIONS[systemIdx]
  const items = []
  for (const sku of sys.skus) {
    items.push({ sku, label: SKU_LABELS[sku] || sku, price: SKU_PRICES[sku] || 0, recurring: sys.monthly })
  }
  if (tankSku && SKU_PRICES[tankSku]) {
    items.push({ sku: tankSku, label: SKU_LABELS[tankSku] || tankSku, price: SKU_PRICES[tankSku], recurring: false })
  }
  for (const sku of addons) {
    const opt = ADDON_OPTIONS.find((o) => o.sku === sku)
    items.push({ sku, label: SKU_LABELS[sku] || sku, price: SKU_PRICES[sku] || 0, recurring: !opt?.oneTime })
  }
  return items
}

function QuoteTable({ items }) {
  const monthlyTotal = items.filter((i) => i.recurring).reduce((s, i) => s + i.price, 0)
  const oneTimeTotal = items.filter((i) => !i.recurring).reduce((s, i) => s + i.price, 0)
  const firstServiceTotal = monthlyTotal + oneTimeTotal

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(122,171,130,0.2)',
      borderRadius: 10, padding: '24px', maxWidth: 540,
    }}>
      <div style={{ fontWeight: 900, fontSize: '1.05rem', marginBottom: 4, color: '#7dffaa' }}>GreenGuard USA — Service Quote</div>
      <div style={{ height: 1, background: 'rgba(122,171,130,0.2)', margin: '12px 0' }} />
      {items.map((item) => (
        <div key={item.sku} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: 8 }}>
          <span style={{ color: 'rgba(212,230,202,0.85)' }}>
            {item.label}
          </span>
          <span style={{ fontWeight: 700, color: '#c9a84c', whiteSpace: 'nowrap', marginLeft: 16 }}>
            ${item.price.toFixed(2)}{item.recurring ? '/mo' : ''}
          </span>
        </div>
      ))}
      <div style={{ height: 1, background: 'rgba(122,171,130,0.2)', margin: '12px 0' }} />
      {monthlyTotal > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: 6 }}>
          <span style={{ color: 'rgba(212,230,202,0.6)' }}>Monthly recurring</span>
          <span style={{ fontWeight: 700 }}>${monthlyTotal.toFixed(2)}/mo</span>
        </div>
      )}
      {oneTimeTotal > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: 6 }}>
          <span style={{ color: 'rgba(212,230,202,0.6)' }}>One-time at first service</span>
          <span style={{ fontWeight: 700 }}>${oneTimeTotal.toFixed(2)}</span>
        </div>
      )}
      <div style={{ height: 1, background: 'rgba(122,171,130,0.2)', margin: '12px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1rem' }}>
        <span>Total due at first service</span>
        <span style={{ color: '#7dffaa' }}>${firstServiceTotal.toFixed(2)}</span>
      </div>
    </div>
  )
}

export default function QuotePage({ isAdmin }) {
  const [systemIdx, setSystemIdx] = useState(0)
  const [tankSku, setTankSku] = useState('')
  const [addons, setAddons] = useState([])
  const [custName, setCustName] = useState('')
  const [custEmail, setCustEmail] = useState('')
  const [quote, setQuote] = useState(null)
  const [emailStatus, setEmailStatus] = useState(null)

  function toggleAddon(sku) {
    setAddons((prev) => prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku])
  }

  function generateQuote(e) {
    e.preventDefault()
    setQuote(buildQuoteItems(systemIdx, addons, tankSku))
    setEmailStatus(null)
  }

  async function emailQuote() {
    if (!custEmail || !quote) return
    setEmailStatus('sending')
    try {
      const res = await fetch('/api/admin/send-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: custEmail, name: custName, items: quote }),
      })
      setEmailStatus(res.ok ? 'sent' : 'error')
    } catch {
      setEmailStatus('error')
    }
  }

  return (
    <>
      <Head><title>Quote Generator · GreenGuard Admin</title></Head>
      <PortalLayout title="Quote Generator" isAdmin={isAdmin}>
        <div style={{ display: 'grid', gap: 32, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', maxWidth: 900, alignItems: 'start' }}>
          {/* Form */}
          <form onSubmit={generateQuote}>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 6, color: 'rgba(212,230,202,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Customer Name</label>
              <input
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                placeholder="Optional"
                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 6, color: '#d4e6ca', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 6, color: 'rgba(212,230,202,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Customer Email</label>
              <input
                type="email"
                value={custEmail}
                onChange={(e) => setCustEmail(e.target.value)}
                placeholder="For emailing quote"
                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 6, color: '#d4e6ca', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 6, color: 'rgba(212,230,202,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>System Type</label>
              <select
                value={systemIdx}
                onChange={(e) => setSystemIdx(Number(e.target.value))}
                style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 6, color: '#d4e6ca', fontSize: '0.9rem' }}
              >
                {SYSTEM_OPTIONS.map((opt, i) => (
                  <option key={i} value={i}>{opt.label} — ${(SKU_PRICES[opt.skus[0]] || 0).toFixed(2)}{opt.monthly ? '/mo' : ''}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 6, color: 'rgba(212,230,202,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tank Exchange</label>
              <select
                value={tankSku}
                onChange={(e) => setTankSku(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 6, color: '#d4e6ca', fontSize: '0.9rem' }}
              >
                {TANK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 10, color: 'rgba(212,230,202,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Add-ons</label>
              <div style={{ display: 'grid', gap: 8 }}>
                {ADDON_OPTIONS.map(({ sku, label, oneTime }) => (
                  <label key={sku} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.88rem' }}>
                    <input
                      type="checkbox"
                      checked={addons.includes(sku)}
                      onChange={() => toggleAddon(sku)}
                      style={{ accentColor: '#7dffaa', width: 16, height: 16 }}
                    />
                    <span>{label}</span>
                    <span style={{ marginLeft: 'auto', color: '#c9a84c', fontWeight: 700 }}>
                      ${(SKU_PRICES[sku] || 0).toFixed(2)}{!oneTime ? '/mo' : ''}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className="btn-gold">Generate Quote</button>
          </form>

          {/* Quote output */}
          {quote && (
            <div>
              <QuoteTable items={quote} />
              <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                <button onClick={() => window.print()} className="btn-outline" style={{ fontSize: '0.85rem' }}>
                  Print
                </button>
                {custEmail && (
                  <button
                    onClick={emailQuote}
                    disabled={emailStatus === 'sending' || emailStatus === 'sent'}
                    className="btn-outline"
                    style={{ fontSize: '0.85rem' }}
                  >
                    {emailStatus === 'sending' ? 'Sending…' : emailStatus === 'sent' ? '✓ Sent' : `Email to ${custEmail}`}
                  </button>
                )}
              </div>
              {emailStatus === 'error' && (
                <div style={{ marginTop: 10, color: '#ff8888', fontSize: '0.85rem' }}>Failed to send email.</div>
              )}
            </div>
          )}
        </div>
      </PortalLayout>
    </>
  )
}
