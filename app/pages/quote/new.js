import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import { useToast, useConfirm } from '../../components/ui'

// Public self-serve quote builder. Mirrors /admin/quote but with no
// auth, no customer-search panel, no admin actions (send-to-customer,
// generate-link, etc.) — instead a single "Continue to Payment" button
// at the bottom that mints a token via /api/quote/create-link and
// redirects the customer to /quote/[token] to enter card details.
//
// Anything not exported from this file behaves identically to the admin
// version; admin-only branches are guarded by isPublic / hidden by
// returning early.
const IS_PUBLIC = true

export async function getServerSideProps() {
  // No auth, no customer list, no prospect search — public visitor enters
  // their own details. customers prop kept (empty) so the existing
  // CustomerSearch JSX renders an empty/hidden state without crashing.
  return { props: { customers: [], mapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '' } }
}

// ── Multi-select section (matches rounds page style) ──────────────────────────

function MultiSelect({ title, catalog, qtys, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const selectedItems = catalog.filter((item) => (qtys[item.label] || 0) > 0)
  const categories = [...new Set(catalog.map((i) => i.category).filter(Boolean))]
  const total = selectedItems.reduce((s, i) => s + ((qtys[i.label] || 0) * (i.price || 0)), 0)

  useEffect(() => {
    if (!open) return
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler) }
  }, [open])

  return (
    <div ref={ref} style={{ marginBottom: 16, position: 'relative' }}>
      {/* Section header — same style as rounds CatalogSection */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(var(--border-rgb),0.12)', marginBottom: 8 }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)' }}>{title}</span>
        {total > 0 && <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--green)' }}>${total.toFixed(2)}</span>}
      </div>

      {/* Selected items — inline rows matching rounds */}
      {selectedItems.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {selectedItems.map((item) => {
            const qty = qtys[item.label] || 0
            return (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', marginBottom: 4, borderRadius: 8, background: 'rgba(var(--green-rgb),0.06)', border: '1px solid rgba(var(--green-rgb),0.15)' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)' }}>{item.label}</span>
                  {item.price != null && (
                    <span style={{ marginLeft: 6, fontSize: '0.75rem', color: 'var(--green)' }}>
                      ${(item.price * qty).toFixed(2)}{!item.oneTime ? '/mo' : ''}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => onChange(item.label, Math.max(0, qty - 1))}
                    style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(var(--border-rgb),0.3)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, }}>−</button>
                  <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 900, color: 'var(--green)' }}>{qty}</span>
                  <button onClick={() => onChange(item.label, qty + 1)}
                    style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(var(--green-rgb),0.3)', background: 'rgba(var(--green-rgb),0.08)', color: 'var(--green)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, }}>+</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Dropdown trigger */}
      <button onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px dashed rgba(var(--border-rgb),0.3)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{selectedItems.length > 0 ? `+ Add more ${title.toLowerCase()}` : `Select ${title.toLowerCase()}…`}</span>
        <span style={{ fontSize: '0.7rem' }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{ position: 'absolute', left: 0, right: 0, zIndex: 60, background: 'var(--bg-card)', border: '1px solid rgba(var(--border-rgb),0.25)', borderRadius: 10, marginTop: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.14)', maxHeight: 360, overflowY: 'auto' }}>
          <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid rgba(var(--border-rgb),0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{title}</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, }}>×</button>
          </div>
          {categories.map((cat) => (
            <div key={cat}>
              <div style={{ padding: '8px 14px 4px', fontSize: '0.65rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', position: 'sticky', top: 0, background: 'var(--bg-card)' }}>{cat}</div>
              {catalog.filter((i) => i.category === cat).map((item) => {
                const qty = qtys[item.label] || 0
                const selected = qty > 0
                return (
                  <div key={item.label} onClick={() => !selected && onChange(item.label, 1)}
                    style={{ display: 'flex', alignItems: 'center', padding: '11px 14px', borderBottom: '1px solid rgba(var(--border-rgb),0.06)', cursor: selected ? 'default' : 'pointer', background: selected ? 'rgba(var(--green-rgb),0.05)' : 'transparent' }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${selected ? 'var(--green)' : 'rgba(var(--border-rgb),0.3)'}`, background: selected ? 'var(--green)' : 'transparent', marginRight: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--text-on-accent)', fontWeight: 900 }}>
                      {selected ? '✓' : ''}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: selected ? 700 : 600, color: selected ? 'var(--text)' : 'var(--text-muted)' }}>{item.label}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 1 }}>
                        {item.price != null
                          ? <span style={{ color: 'var(--green)' }}>${item.price.toFixed(2)}{!item.oneTime ? '/mo' : ''}</span>
                          : <span style={{ color: 'rgba(var(--gold-rgb),0.5)' }}>price TBD</span>}
                      </div>
                    </div>
                    {selected && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => onChange(item.label, Math.max(0, qty - 1))}
                          style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(var(--border-rgb),0.3)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: '0.95rem', lineHeight: 1, }}>−</button>
                        <span style={{ minWidth: 16, textAlign: 'center', fontWeight: 900, color: 'var(--green)', fontSize: '0.9rem' }}>{qty}</span>
                        <button onClick={() => onChange(item.label, qty + 1)}
                          style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(var(--green-rgb),0.3)', background: 'rgba(var(--green-rgb),0.08)', color: 'var(--green)', cursor: 'pointer', fontSize: '0.95rem', lineHeight: 1, }}>+</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
          <div style={{ padding: '10px 14px', textAlign: 'center' }}>
            <button onClick={() => setOpen(false)} style={{ padding: '8px 24px', borderRadius: 6, border: 'none', background: 'var(--green)', color: 'var(--text-on-accent)', fontWeight: 900, fontSize: '0.85rem', cursor: 'pointer' }}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Customer autocomplete ──────────────────────────────────────────────────────

function CustomerSearch({ customers, onSelect }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const filtered = query.length < 2 ? [] : customers.filter((c) => {
    const q = query.toLowerCase()
    const qDigits = q.replace(/\D/g, '')
    const phone = (c.phone || '').replace(/\D/g, '')
    return (c.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.address || '').toLowerCase().includes(q) ||
      (qDigits.length >= 3 && phone.includes(qDigits))
  }).slice(0, 25)

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 4 }}>
        Find Customer or Prospect
      </label>
      <input
        type="text"
        placeholder="Type name or email to search…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        style={{ width: '100%', padding: '9px 12px', boxSizing: 'border-box', border: '1px solid rgba(var(--border-rgb),0.25)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.88rem' }}
      />
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid rgba(var(--border-rgb),0.25)', borderRadius: 8, zIndex: 50, maxHeight: 240, overflowY: 'auto', marginTop: 4 }}>
          {filtered.map((c) => (
            <div key={c.id} onClick={() => { onSelect(c); setQuery(''); setOpen(false) }}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(var(--border-rgb),0.08)' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(var(--border-rgb),0.08)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.88rem' }}>
                {c.name || c.email}
                {c.source === 'prospect' && (
                  <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.08em', background: 'rgba(var(--info-rgb),0.15)', color: 'var(--info)', borderRadius: 4, padding: '1px 5px' }}>PROSPECT</span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{c.email}{c.address ? ` · ${c.address}` : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// All pricing + line-building lives in lib/quote-pricing.js — the single source
// of truth shared with the server (/api/quote/create-link recomputes from it).
const {
  BG_RENTAL_PRICE, BG_HOOKUP_PER_TRAP, BG_NONCO2_PER_TRAP, STARTER_NONCO2_PER_TRAP, MQ_PRICE, TANK_PRICE,
  serviceAddons, buildServiceLines, buildProductLines, buildAddonLines, buildQuoteOptions, firstAvailableServiceDate,
  isLocalDeliveryAddress, shippingForQtys,
} = require('../../lib/quote-pricing')
const { productsForQuote } = require('../../lib/catalog')
const PRODUCTS = productsForQuote()
const SERVICE_ADDONS = serviceAddons()

// ── Guided service configurator ────────────────────────────────────────────────

// Systems quoted with BOTH a rental and a purchase option (customer picks at
// acceptance). Tank delivery and equipment-only quotes stay single-option.
const DUAL_SYSTEMS = new Set(['biogents-co2', 'biogents-nonco2', 'mosqitter'])

function SystemIcon({ iconPath, emoji }) {
  const [failed, setFailed] = useState(false)
  const showEmoji = !iconPath || failed
  return (
    <div style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
      {showEmoji ? (
        <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{emoji}</span>
      ) : (
        <img
          src={iconPath}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}

function ServiceConfigurator({ onChange, onConfigChange }) {
  const [system, setSystem] = useState(null)        // 'biogents-co2' | 'biogents-nonco2' | 'mosqitter' | 'tank' | 'none'
  const [trapCount, setTrapCount] = useState(1)
  const [mqCount, setMqCount] = useState(1)
  const [mqInstall, setMqInstall] = useState(false)
  const [tankCount, setTankCount] = useState(2)
  const [tankHookup, setTankHookup] = useState(false)
  // The quote always uses the first available service date (today + 5 days) —
  // no picker. Scheduling is confirmed after the customer accepts.
  const minDate = firstAvailableServiceDate()

  useEffect(() => {
    // Lines are built by the shared canonical builder so the on-screen preview
    // is byte-for-byte what the server recomputes in /api/quote/create-link.
    // Dual-plan systems carry no single-plan lines — both options are built
    // from this config by buildQuoteOptions (hookup always included on
    // purchase; every purchase customer is on our CO₂ tank service).
    const cfg = { system, trapCount, onTankService: true, mqCount, mqInstall, tankCount, tankHookup, serviceDate: minDate }
    onChange(DUAL_SYSTEMS.has(system) ? [] : buildServiceLines(cfg))
    if (onConfigChange) onConfigChange(cfg)
  }, [system, trapCount, mqCount, mqInstall, tankCount, tankHookup])

  const Q = { fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: 8, marginTop: 16 }
  const chip = (active) => ({ display: 'inline-block', padding: '7px 16px', borderRadius: 20, border: `1px solid ${active ? 'rgba(var(--green-rgb),0.5)' : 'rgba(var(--border-rgb),0.2)'}`, background: active ? 'rgba(var(--green-rgb),0.1)' : 'transparent', color: active ? 'var(--green)' : 'var(--text-dim)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', marginRight: 8, marginBottom: 8, userSelect: 'none', transition: 'all 0.12s' })
  const trapBtn = (n) => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 8, border: `1px solid ${trapCount === n ? 'rgba(var(--green-rgb),0.5)' : 'rgba(var(--border-rgb),0.2)'}`, background: trapCount === n ? 'rgba(var(--green-rgb),0.12)' : 'transparent', color: trapCount === n ? 'var(--green)' : 'var(--text-dim)', fontWeight: 900, fontSize: '1rem', cursor: 'pointer', marginRight: 8, })

  return (
    <div>
      {/* Q1: System */}
      <div style={Q}>What system for service?</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { val: 'biogents-co2',    label: 'Biogents CO₂',                              icon: '/system-icons/biogents-co2.jpg',    emoji: '🦟' },
          { val: 'biogents-nonco2', label: 'Biogents Non-CO₂',                          icon: '/system-icons/biogents-nonco2.webp', emoji: '🪤' },
          { val: 'mosqitter',       label: 'Mosqitter Grand',                           icon: '/system-icons/mosqitter.jpg',       emoji: '⚙️' },
          { val: 'tank',            label: 'CO₂ Tank Delivery Only',                    icon: '/system-icons/tank.jpeg',            emoji: '🛢️' },
          { val: 'none',            label: 'No Service — Equipment & Add-Ons Only',     icon: null,                                emoji: '🛒' },
        ].map(({ val, label, icon, emoji }) => {
          const active = system === val
          return (
            <div
              key={val}
              onClick={() => { setSystem(val); setMqInstall(false); setTankHookup(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px', borderRadius: 10,
                border: `1px solid ${active ? 'rgba(var(--green-rgb),0.5)' : 'rgba(var(--border-rgb),0.2)'}`,
                background: active ? 'rgba(var(--green-rgb),0.08)' : 'var(--bg-alt)',
                color: active ? 'var(--green)' : 'var(--text-muted)',
                fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                userSelect: 'none', transition: 'all 0.12s', width: '100%', boxSizing: 'border-box',
              }}
            >
              <SystemIcon iconPath={icon} emoji={emoji} />
              <span style={{ flex: 1 }}>{label}</span>
              {active && <span style={{ fontSize: '1.2rem' }}>✓</span>}
            </div>
          )
        })}
      </div>

      {system === 'none' && (
        <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 8, background: 'rgba(var(--info-rgb),0.06)', border: '1px solid rgba(var(--info-rgb),0.2)', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          No recurring service selected. Use the <strong>Add-Ons</strong> and <strong>Products</strong> sections below to build a one-time equipment-only quote.
        </div>
      )}

      {/* Biogents CO₂ — trap count. No rental/purchase question: the quote
          carries BOTH options and the customer compares them side by side. */}
      {system === 'biogents-co2' && (
        <>
          <div style={Q}>How many traps?</div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} onClick={() => setTrapCount(n)} style={trapBtn(n)}>{n}</button>
            ))}
            {BG_RENTAL_PRICE[trapCount] && (
              <span style={{ fontSize: '0.85rem', color: 'var(--green)', fontWeight: 900, marginLeft: 14 }}>
                from ${BG_RENTAL_PRICE[trapCount].toFixed(2)}/mo
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginLeft: 6 }}>(${(BG_RENTAL_PRICE[trapCount] / trapCount).toFixed(2)}/trap rental)</span>
              </span>
            )}
          </div>
          <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--text-muted)', padding: '8px 12px', borderRadius: 6, background: 'rgba(var(--info-rgb),0.06)', border: '1px solid rgba(var(--info-rgb),0.15)', lineHeight: 1.5 }}>
            Your quote includes both paths: monthly rental (trap, tank, timer, bait and CO₂ refills included) and equipment purchase with monthly CO₂ tank exchange, hookup and maintenance.
          </div>
        </>
      )}

      {/* Biogents Non-CO₂ — trap count; quote carries rental + purchase options */}
      {system === 'biogents-nonco2' && (
        <>
          <div style={Q}>How many traps?</div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} onClick={() => setTrapCount(n)} style={trapBtn(n)}>{n}</button>
            ))}
            <span style={{ fontSize: '0.85rem', color: 'var(--green)', fontWeight: 900, marginLeft: 14 }}>
              from ${(BG_NONCO2_PER_TRAP * trapCount).toFixed(2)}/mo
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginLeft: 6 }}>(no CO₂ tanks)</span>
            </span>
          </div>
          <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--text-muted)', padding: '8px 12px', borderRadius: 6, background: 'rgba(var(--info-rgb),0.06)', border: '1px solid rgba(var(--info-rgb),0.15)', lineHeight: 1.5 }}>
            Your quote includes both paths: starter rental (${STARTER_NONCO2_PER_TRAP}/trap/mo, trap and attractant included) and trap purchase with ${BG_NONCO2_PER_TRAP}/trap/mo maintenance.
          </div>
        </>
      )}

      {/* Mosqitter — unit count + install; quote carries rental + purchase options */}
      {system === 'mosqitter' && (
        <>
          <div style={Q}>How many units?</div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} onClick={() => setMqCount(n)} style={{ ...trapBtn(n), border: `1px solid ${mqCount === n ? 'rgba(var(--green-rgb),0.5)' : 'rgba(var(--border-rgb),0.2)'}`, background: mqCount === n ? 'rgba(var(--green-rgb),0.12)' : 'transparent', color: mqCount === n ? 'var(--green)' : 'var(--text-dim)' }}>{n}</button>
            ))}
            <span style={{ fontSize: '0.82rem', color: 'var(--green)', fontWeight: 900, marginLeft: 14 }}>
              from ${(MQ_PRICE.service * mqCount).toFixed(2)}/mo
            </span>
          </div>
          <div style={Q}>Installation needed?</div>
          <div>
            <span onClick={() => setMqInstall(true)} style={chip(mqInstall)}>Yes, +${(MQ_PRICE.install * mqCount).toFixed(2)} one-time</span>
            <span onClick={() => setMqInstall(false)} style={chip(!mqInstall)}>No</span>
          </div>
          <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--text-muted)', padding: '8px 12px', borderRadius: 6, background: 'rgba(var(--info-rgb),0.06)', border: '1px solid rgba(var(--info-rgb),0.15)', lineHeight: 1.5 }}>
            Your quote includes both paths: all-in rental (${MQ_PRICE.rental}/mo per unit) and equipment purchase with ${MQ_PRICE.service}/mo per unit full service.
          </div>
        </>
      )}

      {/* Tank delivery — count + hookup */}
      {system === 'tank' && (
        <>
          <div style={Q}>How many tanks per delivery?</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(TANK_PRICE).map(([n, price]) => (
              <span key={n} onClick={() => setTankCount(Number(n))} style={{ ...chip(tankCount === Number(n)), padding: '7px 14px', textAlign: 'center' }}>
                {n} tank{Number(n) > 1 ? 's' : ''}<br/>
                <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>${price.toFixed(2)}/mo</span>
              </span>
            ))}
          </div>
          <div style={Q}>Add tank hookup &amp; maintenance?</div>
          <div>
            <span onClick={() => setTankHookup(true)} style={chip(tankHookup)}>Yes — +$10/tank/mo</span>
            <span onClick={() => setTankHookup(false)} style={chip(!tankHookup)}>No</span>
          </div>
          {tankHookup && (
            <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'rgba(var(--gold-rgb),0.7)', padding: '8px 12px', borderRadius: 6, background: 'rgba(var(--gold-rgb),0.06)', border: '1px solid rgba(var(--gold-rgb),0.15)' }}>
              $10/tank/mo × {tankCount} tank{tankCount > 1 ? 's' : ''} = ${(BG_HOOKUP_PER_TRAP * tankCount).toFixed(2)}/mo added
            </div>
          )}
        </>
      )}

      {/* First available service date — shown, not chosen. Scheduling is
          confirmed with the customer after they accept the quote. */}
      {system && system !== 'none' && (
        <>
          <div style={{ ...Q, marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(var(--border-rgb),0.12)' }}>First available service date</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(var(--green-rgb),0.3)', background: 'rgba(var(--green-rgb),0.06)' }}>
            <span style={{ fontSize: '1.1rem' }}>📅</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)' }}>
                {new Date(minDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>We confirm your exact time window after you approve the quote.</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Dual-option preview card (rental vs purchase) ──────────────────────────────

function OptionPreview({ title, tagline, opt, accent, localDelivery }) {
  const lines = [...opt.serviceLines, ...opt.productLines, ...opt.addonLines]
  return (
    <div style={{ borderRadius: 10, border: `1px solid rgba(var(--${accent}-rgb),0.3)`, padding: '12px 14px', marginBottom: 10, background: `rgba(var(--${accent}-rgb),0.04)` }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: `var(--${accent})`, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 8 }}>{tagline}</div>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '0.78rem' }}>
          <span style={{ color: 'var(--text-muted)', flex: 1, paddingRight: 8 }}>{l.label}</span>
          <span style={{ fontWeight: 700, color: `var(--${accent})`, whiteSpace: 'nowrap' }}>${(l.amount || 0).toFixed(2)}{l.recurring ? '/mo' : ''}</span>
        </div>
      ))}
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid rgba(var(--${accent}-rgb),0.2)`, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Monthly</span>
          <span style={{ fontWeight: 900, color: `var(--${accent})` }}>${opt.recurringTotal.toFixed(2)}/mo</span>
        </div>
        {localDelivery ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>🚚 Delivery</span>
            <span style={{ fontWeight: 800, color: 'var(--green)' }}>Free Local Delivery</span>
          </div>
        ) : opt.shippingTotal > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>🚚 Shipping</span>
            <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>${opt.shippingTotal.toFixed(2)}</span>
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Due today (incl. tax)</span>
          <span style={{ fontWeight: 900, color: 'var(--gold)' }}>${opt.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function QuoteBuilder({ customers, mapsKey }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [serviceLines, setServiceLines] = useState([])
  const [productQtys, setProductQtys] = useState({})
  const [addonQtys, setAddonQtys] = useState({})
  const [serviceConfig, setServiceConfig] = useState(null)
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const [checkoutError, setCheckoutError] = useState(null)
  const taxRate = 8.25
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapPin, setMapPin] = useState(null)
  const [machPins, setMachPins] = useState([])
  const [placingPin, setPlacingPin] = useState(false)
  const [mapView, setMapView] = useState('satellite') // 'satellite' | 'street'
  const streetRef = useRef(null)
  const streetObj = useRef(null)
  const mapRef = useRef(null)
  const mapObj = useRef(null)
  const pinRef = useRef(null)
  const geocodeTimer = useRef(null)
  const machPinMarkersRef = useRef(new Map())
  const placingPinRef = useRef(false)

  // Load Maps API script once
  useEffect(() => {
    if (!mapsKey) return
    if (window.google?.maps) { setMapLoaded(true); return }
    if (document.querySelector('script[data-gg-maps]')) {
      const poll = setInterval(() => { if (window.google?.maps) { setMapLoaded(true); clearInterval(poll) } }, 100)
      return () => clearInterval(poll)
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=marker`
    script.setAttribute('data-gg-maps', '1')
    script.async = true
    script.onload = () => setMapLoaded(true)
    document.head.appendChild(script)
  }, [mapsKey])

  // Initialize satellite map once script is ready
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mapObj.current) return
    mapObj.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: 30.2672, lng: -97.7431 },
      zoom: 15,
      mapTypeId: 'satellite',
      tilt: 0,
      disableDefaultUI: true,
      zoomControl: true,
      scaleControl: true,
    })
    pinRef.current = new window.google.maps.Marker({
      position: { lat: 30.2672, lng: -97.7431 },
      map: mapObj.current,
      draggable: true,
      visible: false,
    })
    mapObj.current.addListener('click', (e) => {
      if (!placingPinRef.current) return
      const lat = e.latLng.lat()
      const lng = e.latLng.lng()
      setMachPins((prev) => [...prev, { id: Date.now(), lat, lng }])
      setPlacingPin(false)
    })
  }, [mapLoaded])

  // Keep placingPinRef in sync so the map click listener reads current state
  useEffect(() => { placingPinRef.current = placingPin }, [placingPin])

  // Initialize Street View panorama lazily when user switches to it
  useEffect(() => {
    if (!mapLoaded || mapView !== 'street' || !streetRef.current || streetObj.current) return
    const pos = mapPin || { lat: 30.2672, lng: -97.7431 }
    streetObj.current = new window.google.maps.StreetViewPanorama(streetRef.current, {
      position: pos,
      pov: { heading: 0, pitch: 0 },
      zoom: 1,
      addressControl: false,
      fullscreenControl: false,
      enableCloseButton: false,
    })
  }, [mapLoaded, mapView, mapPin])

  // When the pin moves, sync Street View position too
  useEffect(() => {
    if (!mapPin || !streetObj.current) return
    streetObj.current.setPosition(mapPin)
  }, [mapPin])

  // Update map cursor during placement mode
  useEffect(() => {
    if (!mapObj.current) return
    mapObj.current.setOptions({ draggableCursor: placingPin ? 'crosshair' : null })
  }, [placingPin])

  // Sync machine pin markers to Google Maps
  useEffect(() => {
    if (!mapObj.current) return
    const currentIds = new Set(machPins.map((p) => p.id))
    machPinMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) { marker.setMap(null); machPinMarkersRef.current.delete(id) }
    })
    machPins.forEach((pin, idx) => {
      if (machPinMarkersRef.current.has(pin.id)) {
        const m = machPinMarkersRef.current.get(pin.id)
        m.setPosition({ lat: pin.lat, lng: pin.lng })
        m.setLabel({ text: String(idx + 1), color: '#ffffff', fontWeight: 'bold', fontSize: '11px' })
      } else {
        const marker = new window.google.maps.Marker({
          position: { lat: pin.lat, lng: pin.lng },
          map: mapObj.current,
          label: { text: String(idx + 1), color: '#ffffff', fontWeight: 'bold', fontSize: '11px' },
          icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 13, fillColor: '#0b57d0', fillOpacity: 1, strokeColor: '#444746', strokeWeight: 2 },
          title: `Trap ${idx + 1}`,
          draggable: true,
        })
        marker.addListener('dragend', (ev) => {
          setMachPins((prev) => prev.map((p) => p.id === pin.id ? { ...p, lat: ev.latLng.lat(), lng: ev.latLng.lng() } : p))
        })
        machPinMarkersRef.current.set(pin.id, marker)
      }
    })
  }, [machPins])

  // Debounce geocode when address changes
  useEffect(() => {
    clearTimeout(geocodeTimer.current)
    if (!mapLoaded || !customerAddress || customerAddress.length < 6) return
    geocodeTimer.current = setTimeout(() => {
      new window.google.maps.Geocoder().geocode({ address: customerAddress }, (results, status) => {
        if (status === 'OK' && results[0]) {
          const loc = results[0].geometry.location
          setMapPin({ lat: loc.lat(), lng: loc.lng() })
        }
      })
    }, 700)
    return () => clearTimeout(geocodeTimer.current)
  }, [customerAddress, mapLoaded])

  // Pan to pin when geocode resolves
  useEffect(() => {
    if (!mapPin || !mapObj.current || !pinRef.current) return
    pinRef.current.setPosition(mapPin)
    pinRef.current.setVisible(true)
    mapObj.current.panTo(mapPin)
    mapObj.current.setZoom(19)
  }, [mapPin])

  async function copyQuoteLink() {
    const res = await fetch('/api/quote/create-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Send config + selections only — the server recomputes all prices.
      body: JSON.stringify({ customerName, customerEmail, customerAddress, serviceConfig, productQtys, addonQtys, serviceDate: serviceConfig?.serviceDate || null, notes }),
    })
    const { url } = await res.json()
    await navigator.clipboard.writeText(url).catch(() => confirm({ title: 'Copy this link', input: { defaultValue: url }, confirmLabel: 'Done', alert: true }))
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 4000)
  }

  async function payNow() {
    setCheckingOut(true)
    setCheckoutError(null)
    try {
      // Mint the quote token, then send the customer to their quote page where
      // both options are compared and they choose rental or purchase to pay.
      const linkRes = await fetch('/api/quote/create-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send config + selections only — the server recomputes all prices.
        body: JSON.stringify({ customerName, customerEmail, customerAddress, serviceConfig, productQtys, addonQtys, notes }),
      })
      const data = await linkRes.json()
      if (!data.url) throw new Error(data.error || 'Could not generate your quote')
      window.location.href = data.url
    } catch (e) {
      setCheckoutError(e.message)
      setCheckingOut(false)
    }
  }

  function handleSelectCustomer(c) {
    setCustomerName(c.name); setCustomerEmail(c.email)
    setCustomerPhone(c.phone); setCustomerAddress(c.address)
  }

  function setQty(setter, label, n) {
    setter((prev) => {
      const result = { ...prev }
      if (n <= 0) delete result[label]; else result[label] = n
      return result
    })
  }

  // Same shared builders the server uses, so preview == server recomputation.
  // Purchase equipment is no longer auto-added to the shared product picker —
  // it lives inside the purchase option built by buildQuoteOptions.
  const productLines = buildProductLines(productQtys)
  const addonLines = buildAddonLines(addonQtys)
  // Austin metro (786xx/787xx) ships free — mirrors the server's rule so the
  // preview matches what create-link recomputes.
  const localDelivery = isLocalDeliveryAddress(customerAddress)
  const quoteOptions = buildQuoteOptions({ serviceConfig, productQtys, addonQtys, localDelivery })

  const allLines = [...serviceLines, ...productLines, ...addonLines]
  const recurringTotal = allLines.filter((l) => l.recurring).reduce((s, l) => s + (l.amount || 0), 0)
  const oneTimeTotal = allLines.filter((l) => !l.recurring).reduce((s, l) => s + (l.amount || 0), 0)
  const subtotal = recurringTotal + oneTimeTotal
  const taxAmount = taxRate > 0 ? Math.round(subtotal * taxRate) / 100 : 0
  const shippingTotal = localDelivery ? 0 : shippingForQtys(productQtys)
  const grandTotal = subtotal + taxAmount + shippingTotal
  const hasRecurring = serviceLines.some((l) => l.recurring)
  const hasOneTime = allLines.some((l) => !l.recurring)
  const canProceed = quoteOptions ? true : allLines.some((l) => l.amount > 0)

  async function sendQuote() {
    if (!customerEmail) return
    setSending(true)
    await fetch('/api/admin/send-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: customerEmail, name: customerName, customerAddress, lineItems: allLines, serviceLines, addonLines, productLines, options: quoteOptions, total: subtotal, recurringTotal, oneTimeTotal, taxRate: taxRate, taxAmount, serviceDate: serviceConfig?.serviceDate || null, notes, machPins: machPins.map(({ lat, lng }) => ({ lat, lng })) }),
    })
    setSending(false); setSent(true)
    setTimeout(() => setSent(false), 5000)
  }

  const input = { width: '100%', padding: '9px 12px', boxSizing: 'border-box', border: '1px solid rgba(var(--border-rgb),0.25)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.88rem' }
  const lbl = { display: 'block', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 4 }

  return (
    <>
      <Head>
        <title>Get a Quote · GreenGuard USA</title>
        <meta name="description" content="Build your own mosquito control quote and pay online — pesticide-free CO2 traps and monthly delivery for the Austin area." />
      </Head>
      <PortalLayout>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Quote Builder</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>Input your address to estimate the number of traps required for your property.</p>
        </div>

        <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 28, alignItems: 'start' }}>
          <div>
            {/* Customer search is admin-only — public visitors fill in
                their own info directly. */}
            {!IS_PUBLIC && <CustomerSearch customers={customers} onSelect={handleSelectCustomer} />}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 4 }}>
              <div><label style={lbl}>Name</label><input style={input} placeholder="Full name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></div>
              <div><label style={lbl}>Email</label><input style={input} type="email" placeholder="customer@email.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} /></div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={lbl}>Property Address</label>
              <input style={input} placeholder="123 Oak St, Austin TX 78701" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
              {mapsKey && (
                <>
                  <div style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', border: `1px solid ${placingPin ? 'rgba(var(--gold-rgb),0.5)' : 'rgba(var(--border-rgb),0.2)'}`, height: 360, position: 'relative', transition: 'border-color 0.15s' }}>
                    {/* Satellite map — always mounted so it keeps its state */}
                    <div ref={mapRef} style={{ height: '100%', width: '100%', display: mapView === 'satellite' ? 'block' : 'none' }} />
                    {/* Street view — mounted on first switch */}
                    {mapView === 'street' && (
                      <div ref={streetRef} style={{ height: '100%', width: '100%' }} />
                    )}
                    {!mapPin && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)', color: 'var(--text-dim)', fontSize: '0.8rem', fontWeight: 600, pointerEvents: 'none' }}>
                        Type an address to see {mapView === 'satellite' ? 'satellite' : 'street'} view
                      </div>
                    )}
                    {placingPin && mapView === 'satellite' && (
                      <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', background: 'rgba(var(--gold-rgb),0.9)', color: 'var(--text-on-accent)', padding: '5px 14px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 800, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                        Click map to place trap
                      </div>
                    )}
                    {/* Satellite / Street toggle */}
                    {mapPin && (
                      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.3)', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
                        <button onClick={() => setMapView('satellite')}
                          style={{ padding: '5px 12px', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.72rem', background: mapView === 'satellite' ? 'var(--gold)' : 'var(--bg-card)', color: mapView === 'satellite' ? 'var(--text-on-accent)' : 'var(--text)' }}>
                          Satellite
                        </button>
                        <button onClick={() => setMapView('street')}
                          style={{ padding: '5px 12px', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.72rem', background: mapView === 'street' ? 'var(--gold)' : 'var(--bg-card)', color: mapView === 'street' ? 'var(--text-on-accent)' : 'var(--text)' }}>
                          Street
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Trap placement controls */}
                  {mapPin && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {!placingPin ? (
                          <button onClick={() => setPlacingPin(true)}
                            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(var(--green-rgb),0.3)', background: 'transparent', color: 'var(--green)', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', }}>
                            + Place Trap Location
                          </button>
                        ) : (
                          <button onClick={() => setPlacingPin(false)}
                            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(var(--border-rgb),0.25)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', }}>
                            Cancel
                          </button>
                        )}
                        {machPins.map((pin, idx) => (
                          <div key={pin.id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(var(--green-rgb),0.06)', border: '1px solid rgba(var(--green-rgb),0.2)', borderRadius: 20, padding: '4px 10px 4px 6px', fontSize: '0.78rem' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: 'var(--green)', color: 'var(--text-on-accent)', fontWeight: 900, fontSize: '0.68rem', flexShrink: 0 }}>{idx + 1}</span>
                            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Trap {idx + 1}</span>
                            <button onClick={() => setMachPins((prev) => prev.filter((p) => p.id !== pin.id))}
                              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: 0, marginLeft: 2 }}>×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Services — guided configurator */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(var(--border-rgb),0.12)', marginBottom: 8, marginTop: 20 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)' }}>Services</span>
            </div>
            <div className="card" style={{ marginBottom: 8 }}>
              <ServiceConfigurator onChange={setServiceLines} onConfigChange={setServiceConfig} />
            </div>

            {/* Products (auto-populated from service config) */}
            <MultiSelect
              title="Products to Purchase"
              catalog={PRODUCTS}
              qtys={productQtys}
              onChange={(label, n) => setQty(setProductQtys, label, n)}
            />

            {/* Service add-ons */}
            <MultiSelect
              title="Add-Ons"
              catalog={SERVICE_ADDONS}
              qtys={addonQtys}
              onChange={(label, n) => setQty(setAddonQtys, label, n)}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(var(--border-rgb),0.12)', marginBottom: 8, marginTop: 20 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)' }}>Notes</span>
            </div>
            <textarea rows={3} style={{ ...input, resize: 'vertical' }} placeholder="Expiry, discounts, special terms…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {/* Quote preview */}
          <div style={{ position: 'sticky', top: 72 }}>
            <div className="card">
              <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 16 }}>Quote Preview</div>

              {customerName && <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: 2 }}>{customerName}</div>}
              {customerEmail && <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 2 }}>{customerEmail}</div>}
              {customerAddress && <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 12 }}>{customerAddress}</div>}

              {quoteOptions && (
                <div style={{ borderTop: '1px solid rgba(var(--border-rgb),0.12)', paddingTop: 12 }}>
                  <OptionPreview title="Option 1 · Monthly Rental" tagline="Everything included, no upfront equipment" opt={quoteOptions.rental} accent="green" localDelivery={localDelivery} />
                  <OptionPreview title="Option 2 · Purchase & Service" tagline="Own the equipment, we keep it running" opt={quoteOptions.purchase} accent="info" localDelivery={localDelivery} />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                    The customer compares both options on their quote page and pays for the one they choose. Tax 8.25% (Austin, TX) included in totals.
                  </div>
                </div>
              )}

              {!quoteOptions && (
              <div style={{ borderTop: '1px solid rgba(var(--border-rgb),0.12)', paddingTop: 12 }}>
                {allLines.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem', fontStyle: 'italic' }}>Select a service to begin</p>}

                {/* Recurring lines */}
                {allLines.filter((l) => l.recurring).length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 6 }}>Monthly recurring</div>
                    {allLines.filter((l) => l.recurring).map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.82rem', borderBottom: '1px solid rgba(var(--border-rgb),0.06)' }}>
                        <span style={{ color: 'var(--text-muted)', flex: 1, paddingRight: 8 }}>{item.label}</span>
                        <span style={{ fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>{item.amount != null ? `$${item.amount.toFixed(2)}/mo` : 'TBD'}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* One-time lines */}
                {allLines.filter((l) => !l.recurring).length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 6 }}>One-time</div>
                    {allLines.filter((l) => !l.recurring).map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.82rem', borderBottom: '1px solid rgba(var(--border-rgb),0.06)' }}>
                        <span style={{ color: 'var(--text-muted)', flex: 1, paddingRight: 8 }}>{item.label}</span>
                        <span style={{ fontWeight: 700, color: 'var(--info)', whiteSpace: 'nowrap' }}>{item.amount != null ? `$${item.amount.toFixed(2)}` : 'TBD'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}

              {/* Tax — fixed 8.25% Austin rate */}
              {!quoteOptions && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                Tax: {taxRate}% (Austin, TX)
              </div>
              )}

              {!quoteOptions && allLines.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '2px solid rgba(var(--border-rgb),0.2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {hasRecurring && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700 }}>Monthly subtotal</span>
                      <span style={{ fontWeight: 900, color: 'var(--green)' }}>${recurringTotal.toFixed(2)}/mo</span>
                    </div>
                  )}
                  {hasOneTime && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700 }}>One-time subtotal</span>
                      <span style={{ fontWeight: 900, color: 'var(--info)' }}>${oneTimeTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {shippingTotal > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontWeight: 600 }}>🚚 Shipping</span>
                      <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>${shippingTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {localDelivery && shippingTotal === 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontWeight: 600 }}>🚚 Delivery</span>
                      <span style={{ fontWeight: 800, color: 'var(--green)' }}>Free Local Delivery</span>
                    </div>
                  )}
                  {taxAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontWeight: 600 }}>Tax ({taxRate}%)</span>
                      <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>${taxAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {taxAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid rgba(var(--border-rgb),0.15)' }}>
                      <span style={{ fontSize: '0.9rem', color: 'var(--text)', fontWeight: 800 }}>Total due</span>
                      <span style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--gold)' }}>${grandTotal.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              {notes && <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 12, borderTop: '1px solid rgba(var(--border-rgb),0.1)', paddingTop: 10 }}>{notes}</p>}

              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Pay Now — opens Stripe checkout directly */}
                <button
                  onClick={payNow}
                  disabled={checkingOut || !canProceed}
                  style={{ padding: '13px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 900, fontSize: '0.95rem', background: checkingOut || !canProceed ? 'rgba(var(--green-rgb),0.15)' : 'var(--green)', color: checkingOut || !canProceed ? 'var(--text-dim)' : 'var(--text-on-accent)', opacity: checkingOut ? 0.7 : 1 }}>
                  {checkingOut ? 'Preparing your quote…' : quoteOptions ? '✓ View My Quote & Choose an Option' : '✓ View My Quote & Pay'}
                </button>
                {checkoutError && <div style={{ fontSize: '0.78rem', color: 'var(--danger)', textAlign: 'center' }}>{checkoutError}</div>}

                {/* Admin-only secondary actions: Email Quote + Share Link.
                    Public visitors only see Approve & Pay Now and Print/PDF. */}
                {!IS_PUBLIC && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {sent ? (
                      <div style={{ flex: 1, padding: '9px', borderRadius: 6, background: 'rgba(var(--green-rgb),0.08)', border: '1px solid rgba(var(--green-rgb),0.2)', color: 'var(--green)', fontSize: '0.82rem', fontWeight: 700, textAlign: 'center' }}>Sent ✓</div>
                    ) : (
                      <button onClick={sendQuote} disabled={sending || !customerEmail}
                        style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', cursor: customerEmail ? 'pointer' : 'not-allowed', fontWeight: 800, fontSize: '0.82rem', background: customerEmail ? 'var(--gold)' : 'rgba(var(--gold-rgb),0.2)', color: customerEmail ? 'var(--text-on-accent)' : 'var(--text-dim)', opacity: sending ? 0.7 : 1 }}>
                        {sending ? 'Sending…' : 'Email Quote'}
                      </button>
                    )}
                    <button onClick={copyQuoteLink} style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid rgba(var(--info-rgb),0.3)', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', background: linkCopied ? 'rgba(var(--info-rgb),0.1)' : 'transparent', color: linkCopied ? 'var(--info)' : 'rgba(var(--info-rgb),0.7)' }}>
                      {linkCopied ? '✓ Copied!' : '🔗 Share Link'}
                    </button>
                  </div>
                )}
                <button onClick={() => window.print()} style={{ padding: '9px', borderRadius: 8, border: '1px solid rgba(var(--border-rgb),0.25)', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', background: 'transparent', color: 'var(--text-muted)' }}>
                  Print / PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      </PortalLayout>
    </>
  )
}
