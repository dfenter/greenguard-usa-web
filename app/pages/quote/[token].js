import { useState, useEffect } from 'react'
import Head from 'next/head'
import { trackEvent } from '../../lib/analytics'
import PortalLayout from '../../components/PortalLayout'
import { Skeleton } from '../../components/ui'

function fmt$(n) { return n != null ? `$${Number(n).toFixed(2)}` : 'TBD' }

function fmtDate(s) {
  if (!s) return null
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

// Infer which system photo to show from the quote's line labels.
function systemPhoto(quote) {
  const labels = [
    ...(quote.serviceLines || []),
    ...(quote.options?.rental?.serviceLines || []),
  ].map((l) => l.label || '').join(' ')
  if (/mosqitter/i.test(labels)) return { src: '/system-icons/mosqitter.jpg', alt: 'Mosqitter Grand mosquito control system' }
  if (/non-co/i.test(labels)) return { src: '/system-icons/biogents-nonco2.webp', alt: 'Biogents non-CO₂ mosquito trap' }
  if (/tank/i.test(labels) && !/trap|rental/i.test(labels)) return { src: '/system-icons/tank.jpeg', alt: 'CO₂ tank delivery service' }
  return { src: '/system-icons/biogents-co2.jpg', alt: 'Biogents CO₂ mosquito trap' }
}

// ── Option card (rental vs purchase comparison) ────────────────────────────────

function OptionCard({ id, title, tagline, opt, selected, onSelect, badge, photo, localDelivery }) {
  const oneTime = [...opt.serviceLines, ...opt.productLines, ...opt.addonLines].filter((l) => !l.recurring)
  const recurring = [...opt.serviceLines, ...opt.productLines, ...opt.addonLines].filter((l) => l.recurring)
  return (
    <div
      onClick={() => onSelect(id)}
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id) } }}
      style={{
        flex: '1 1 280px', cursor: 'pointer', position: 'relative',
        borderRadius: 14, overflow: 'hidden',
        border: selected ? '2px solid var(--green)' : '1px solid rgba(var(--border-rgb),0.2)',
        background: 'var(--bg-card)',
        boxShadow: selected ? '0 12px 36px rgba(23,111,43,0.18)' : '0 2px 10px rgba(0,0,0,0.05)',
        transition: 'box-shadow 0.15s, border-color 0.15s, transform 0.15s',
        transform: selected ? 'translateY(-2px)' : 'none',
      }}
    >
      {badge && (
        <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 2, background: 'var(--gold)', color: 'var(--text-on-accent)', fontSize: '0.62rem', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 20 }}>
          {badge}
        </div>
      )}
      {photo && (
        <div style={{ height: 130, overflow: 'hidden', background: '#122419' }}>
          <img src={photo.src} alt={photo.alt} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.92 }} />
        </div>
      )}
      <div style={{ padding: '18px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, border: `2px solid ${selected ? 'var(--green)' : 'rgba(var(--border-rgb),0.4)'}`, background: selected ? 'var(--green)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-on-accent)', fontSize: '0.7rem', fontWeight: 900 }}>{selected ? '✓' : ''}</span>
          <span style={{ fontSize: '1.05rem', fontWeight: 900, letterSpacing: '-0.01em' }}>{title}</span>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>{tagline}</div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: '1.9rem', fontWeight: 900, color: 'var(--green)', letterSpacing: '-0.03em' }}>{fmt$(opt.recurringTotal)}</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontWeight: 700 }}>/month</span>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>
          {fmt$(opt.total)} due today <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>(first month{opt.oneTimeTotal > 0 ? ' + equipment' : ''}, tax included)</span>
        </div>
        {localDelivery ? (
          <div style={{ display: 'inline-block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--green)', background: 'rgba(var(--green-rgb),0.08)', border: '1px solid rgba(var(--green-rgb),0.25)', borderRadius: 20, padding: '4px 12px', marginBottom: 14 }}>
            🚚 Free Local Delivery
          </div>
        ) : opt.shippingTotal > 0 ? (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600, marginBottom: 14 }}>
            🚚 Includes {fmt$(opt.shippingTotal)} shipping
          </div>
        ) : (
          <div style={{ marginBottom: 8 }} />
        )}

        {recurring.length > 0 && (
          <div style={{ marginBottom: oneTime.length ? 10 : 0 }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', margin: '0 0 6px' }}>Monthly service</div>
            {recurring.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', borderBottom: '1px solid rgba(var(--border-rgb),0.07)', fontSize: '0.82rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{l.label}</span>
                <span style={{ fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>{fmt$(l.amount)}/mo</span>
              </div>
            ))}
          </div>
        )}
        {oneTime.length > 0 && (
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', margin: '0 0 6px' }}>Yours to keep (one-time)</div>
            {oneTime.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', borderBottom: '1px solid rgba(var(--border-rgb),0.07)', fontSize: '0.82rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{l.label}</span>
                <span style={{ fontWeight: 700, color: 'var(--info)', whiteSpace: 'nowrap' }}>{fmt$(l.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function QuotePage({ token, accepted, initialQuote, initialError }) {
  const [quote, setQuote] = useState(initialQuote || null)
  const [error, setError] = useState(initialError || null)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState(null)
  // Dual-option quotes: which plan the customer has selected to pay for.
  const [selectedOption, setSelectedOption] = useState('rental')

  useEffect(() => {
    let active = true
    fetch(`/api/admin/quote-link?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (!active) return
        if (d.error) {
          // SSR already rendered a verified quote; a refresh failure should not
          // blank it or turn a transient API outage into a quote error screen.
          if (!initialQuote) setError(d.error)
        }
        else {
          setQuote(d)
          if (!initialQuote) trackEvent('quote_viewed', { value: d.total ?? 0, currency: 'USD' })
        }
      })
      .catch(() => { if (!initialQuote) setError('Failed to load quote') })
    return () => { active = false }
  }, [token, initialQuote])

  useEffect(() => {
    if (initialQuote) trackEvent('quote_viewed', { value: initialQuote.total ?? 0, currency: 'USD' })
  }, [initialQuote])

  useEffect(() => {
    if (!accepted || !quote) return
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'purchase', {
        transaction_id: token,
        value: quote.total ?? 0,
        currency: 'USD',
      })
      // Google Ads conversion
      window.gtag('event', 'conversion', {
        send_to: 'AW-16913987571',
        value: quote.total ?? 0,
        currency: 'USD',
        transaction_id: token,
      })
    }
    if (typeof window.fbq === 'function') {
      window.fbq('track', 'Purchase', {
        value: quote.total ?? 0,
        currency: 'USD',
        content_name: 'GreenGuard Quote',
      })
    }
  }, [accepted, quote, token])

  async function handleAcceptPay() {
    setPaying(true)
    setPayError(null)
    trackEvent('begin_checkout', { value: quote?.total ?? 0, currency: 'USD' })
    // Collect attribution from sessionStorage so webhook can fire proper conversions
    const attrKeys = ['gclid','gbraid','wbraid','fbclid','utm_source','utm_medium','utm_campaign','utm_content','ref']
    const attribution = {}
    attrKeys.forEach(k => {
      const v = typeof window !== 'undefined' ? sessionStorage.getItem('gg_' + k) : null
      if (v) attribution[k] = v
    })
    // Capture GA4 client_id from _ga cookie for server-side purchase attribution
    if (typeof document !== 'undefined') {
      const gaCookie = document.cookie.split('; ').find(c => c.startsWith('_ga='))
      if (gaCookie) {
        const parts = gaCookie.split('=')[1].split('.')
        if (parts.length >= 4) attribution.ga_client_id = parts.slice(2).join('.')
      }
      // Capture GA4 session_id (_ga_<stream> = GS1.1.<session_id>.<n>...) so the
      // webhook MP purchase attaches to this session instead of Unassigned
      const gaSess = document.cookie.split('; ').find(c => c.startsWith('_ga_K2R5H2Z23X='))
      if (gaSess) {
        const sid = gaSess.split('=')[1].split('.')[2]
        if (sid) attribution.ga_session_id = sid
      }
      // Capture Meta browser cookies (_fbp, _fbc) to raise CAPI Purchase match rate
      const fbp = document.cookie.split('; ').find(c => c.startsWith('_fbp='))
      if (fbp) attribution.fbp = fbp.split('=').slice(1).join('=')
      const fbc = document.cookie.split('; ').find(c => c.startsWith('_fbc='))
      if (fbc) attribution.fbc = fbc.split('=').slice(1).join('=')
    }
    try {
      const res = await fetch('/api/quote/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, attribution, option: quote?.options ? selectedOption : undefined }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setPayError(data.error || 'Could not start checkout. Please call us.')
        setPaying(false)
      }
    } catch {
      setPayError('Network error. Please try again or call 512-560-4129.')
      setPaying(false)
    }
  }

  // Can pay if at least one line item has a known amount
  function canPay(q) {
    if (q.options) return true
    const lines = [...(q.serviceLines || []), ...(q.addonLines || []), ...(q.productLines || [])]
    return lines.some(l => l.amount > 0)
  }

  const card = { background: 'var(--bg-card)', border: '1px solid rgba(var(--border-rgb),0.18)', borderRadius: 12, padding: 28, marginBottom: 20 }
  const lbl = { fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(var(--gold-rgb),0.7)', marginBottom: 8, display: 'block' }

  return (
    <>
      <Head>
        <title>{quote ? `Quote for ${quote.customerName || 'You'} · GreenGuard USA` : 'GreenGuard USA Quote'}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <PortalLayout minimal logoHref="https://www.greenguard-usa.com">
        <div style={{ maxWidth: quote?.options ? 920 : 680, margin: '0 auto' }}>
          {error && (
            <div style={{ padding: 28, borderRadius: 12, background: 'rgba(var(--danger-rgb),0.08)', border: '1px solid rgba(var(--danger-rgb),0.2)', color: 'var(--danger)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 8 }}>Quote Not Found</div>
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>{error}. This link may have expired or been invalidated. Contact us for a new quote.</p>
            </div>
          )}

          {!quote && !error && (
            <div style={{ padding: 60 }}><Skeleton lines={5} height={18} /></div>
          )}

          {quote && (
            <>
              {/* Title */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 10 }}>Service Proposal</div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(1.8rem,3.2vw,2.4rem)', margin: '0 0 8px' }}>
                  {quote.customerName ? `Hi ${quote.customerName.split(' ')[0]},` : 'Your GreenGuard Proposal'}
                </h1>
                <p style={{ fontSize: '1rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
                  {quote.options
                    ? 'Here is your quote for pesticide-free mosquito control. There are two ways to get started: pick the one that fits and you are on the schedule.'
                    : 'Here’s your custom quote for pesticide-free CO₂ mosquito control service.'}
                </p>
              </div>

              {/* Customer info + first available service date */}
              {(quote.customerEmail || quote.customerAddress || quote.serviceDate) && (
                <div style={{ ...card, display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  {quote.customerEmail && (
                    <div><span style={lbl}>Email</span><div style={{ fontWeight: 600 }}>{quote.customerEmail}</div></div>
                  )}
                  {quote.customerAddress && (
                    <div><span style={lbl}>Property</span><div style={{ fontWeight: 600 }}>{quote.customerAddress}</div></div>
                  )}
                  {quote.serviceDate && (
                    <div>
                      <span style={lbl}>First Available Service</span>
                      <div style={{ fontWeight: 800, color: 'var(--green)' }}>{fmtDate(quote.serviceDate)}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 2 }}>We confirm your exact time window after you approve.</div>
                    </div>
                  )}
                </div>
              )}

              {/* Rental vs Purchase comparison */}
              {quote.options && (() => {
                const photo = systemPhoto(quote)
                const { rental, purchase } = quote.options
                const monthlySavings = rental.recurringTotal - purchase.recurringTotal
                const breakEvenMonths = monthlySavings > 0 ? Math.ceil(purchase.oneTimeTotal / monthlySavings) : null
                return (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, margin: '4px 0 14px' }}>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.4rem', margin: 0 }}>Two ways to get protected</h2>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Same equipment, same service standard, your choice.</span>
                    </div>
                    <div role="radiogroup" aria-label="Choose rental or purchase" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'stretch' }}>
                      <OptionCard
                        id="rental"
                        title="Monthly Rental"
                        tagline="We provide and maintain everything: trap, CO₂ tank, timer, bait and refills. Cancel anytime, nothing to buy."
                        opt={rental}
                        selected={selectedOption === 'rental'}
                        onSelect={setSelectedOption}
                        badge="Most popular"
                        photo={photo}
                        localDelivery={quote.localDelivery}
                      />
                      <OptionCard
                        id="purchase"
                        title="Purchase & Service"
                        tagline="Own your equipment outright. We deliver fresh CO₂ every month, hook it up and keep it catching."
                        opt={purchase}
                        selected={selectedOption === 'purchase'}
                        onSelect={setSelectedOption}
                        photo={photo}
                        localDelivery={quote.localDelivery}
                      />
                    </div>
                    {breakEvenMonths && breakEvenMonths > 1 && breakEvenMonths < 61 && (
                      <div style={{ marginTop: 14, padding: '12px 16px', borderRadius: 10, background: 'rgba(var(--gold-rgb),0.07)', border: '1px solid rgba(var(--gold-rgb),0.25)', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                        <strong style={{ color: 'var(--gold)' }}>Worth knowing:</strong> purchasing costs {fmt$(rental.recurringTotal - purchase.recurringTotal)} less per month, so the equipment pays for itself in about {breakEvenMonths} months. Renting keeps your upfront cost at one month of service.
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Recurring services */}
              {!quote.options && (
              <>
              {null}
              {quote.serviceLines?.filter(l => l.recurring).length > 0 && (
                <div style={card}>
                  <span style={lbl}>Monthly Service</span>
                  {quote.serviceLines.filter(l => l.recurring).map((line, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(var(--border-rgb),0.08)', fontSize: '0.92rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{line.label}</span>
                      <span style={{ fontWeight: 800, color: 'var(--green)' }}>{line.amount != null ? `${fmt$(line.amount)}/mo` : 'TBD'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Add-ons (recurring) */}
              {quote.addonLines?.filter(l => l.recurring).length > 0 && (
                <div style={card}>
                  <span style={lbl}>Monthly Add-Ons</span>
                  {quote.addonLines.filter(l => l.recurring).map((line, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(var(--border-rgb),0.08)', fontSize: '0.92rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{line.label}</span>
                      <span style={{ fontWeight: 700, color: 'var(--green)' }}>{line.amount != null ? `${fmt$(line.amount)}/mo` : 'TBD'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* One-time */}
              {[...(quote.serviceLines || []), ...(quote.addonLines || []), ...(quote.productLines || [])].filter(l => !l.recurring).length > 0 && (
                <div style={card}>
                  <span style={lbl}>One-Time</span>
                  {[...(quote.serviceLines || []), ...(quote.addonLines || []), ...(quote.productLines || [])].filter(l => !l.recurring).map((line, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(var(--border-rgb),0.08)', fontSize: '0.92rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{line.label}</span>
                      <span style={{ fontWeight: 700, color: 'var(--info)' }}>{line.amount != null ? fmt$(line.amount) : 'TBD'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Totals */}
              <div style={{ ...card, background: 'rgba(var(--gold-rgb),0.05)', border: '1px solid rgba(var(--gold-rgb),0.2)' }}>
                {quote.recurringTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>Monthly recurring</span>
                    <span style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--green)' }}>{fmt$(quote.recurringTotal)}/mo</span>
                  </div>
                )}
                {quote.oneTimeTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>One-time</span>
                    <span style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--info)' }}>{fmt$(quote.oneTimeTotal)}</span>
                  </div>
                )}
                {quote.shippingTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-dim)' }}>🚚 Shipping</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{fmt$(quote.shippingTotal)}</span>
                  </div>
                )}
                {quote.localDelivery && !(quote.shippingTotal > 0) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-dim)' }}>🚚 Delivery</span>
                    <span style={{ fontWeight: 800, color: 'var(--green)' }}>Free Local Delivery</span>
                  </div>
                )}
                {quote.taxAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-dim)' }}>Tax ({quote.taxRate}%)</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{fmt$(quote.taxAmount)}</span>
                  </div>
                )}
                {(quote.shippingTotal > 0 || quote.taxAmount > 0) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid rgba(var(--gold-rgb),0.25)' }}>
                    <span style={{ fontWeight: 800, color: 'var(--text)' }}>Total due</span>
                    <span style={{ fontWeight: 900, fontSize: '1.15rem', color: 'var(--gold)' }}>{fmt$((quote.recurringTotal || 0) + (quote.oneTimeTotal || 0) + (quote.taxAmount || 0) + (quote.shippingTotal || 0))}</span>
                  </div>
                )}
              </div>
              </>
              )}

              {/* Notes */}
              {quote.notes && (
                <div style={{ ...card, borderColor: 'rgba(var(--border-rgb),0.12)' }}>
                  <span style={lbl}>Notes</span>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{quote.notes}</p>
                </div>
              )}

              {/* CTA */}
              <div style={{ marginTop: 40 }}>

                {/* Success banner — shown after returning from Stripe */}
                {accepted && (
                  <div style={{ marginBottom: 28, padding: '24px 28px', borderRadius: 12, background: 'rgba(var(--green-rgb),0.07)', border: '1px solid rgba(var(--green-rgb),0.3)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🎉</div>
                    <div style={{ fontWeight: 900, fontSize: '1.05rem', color: 'var(--green)', marginBottom: 10 }}>Payment confirmed. Welcome to GreenGuard!</div>
                    <p style={{ margin: '0 0 16px', fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      Check your email — we&apos;ve sent you a sign-in link to access your customer account and book your installation time.
                    </p>
                    <a href="https://cal.com/greenguard-usa/property-assessment" target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 8, background: 'var(--gold)', color: 'var(--text-on-accent)', fontWeight: 800, fontSize: '0.9rem', textDecoration: 'none' }}>
                      Book Your Installation Time →
                    </a>
                    <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                      Questions? Call <a href="tel:+15125604129" style={{ color: 'var(--text-dim)' }}>512-560-4129</a>
                    </div>
                  </div>
                )}

                {/* Accept & Pay */}
                {!accepted && (
                  <div style={{ marginBottom: 20 }}>
                    <button
                      onClick={handleAcceptPay}
                      disabled={paying || !canPay(quote)}
                      style={{
                        width: '100%', padding: '18px', borderRadius: 10, border: 'none',
                        background: paying || !canPay(quote) ? 'rgba(var(--green-rgb),0.15)' : 'var(--green)',
                        color: paying || !canPay(quote) ? 'var(--text-dim)' : 'var(--text-on-accent)',
                        fontWeight: 900, fontSize: '1.05rem',
                        cursor: paying || !canPay(quote) ? 'not-allowed' : 'pointer',
                        letterSpacing: '-0.01em',
                        transition: 'opacity 0.15s',
                        opacity: paying ? 0.7 : 1,
                      }}
                    >
                      {paying
                        ? 'Redirecting to secure checkout…'
                        : !canPay(quote)
                          ? 'Contact us to finalize pricing'
                          : quote.options
                            ? `✓ Start with ${selectedOption === 'rental' ? 'Monthly Rental' : 'Purchase & Service'} · Pay ${fmt$(quote.options[selectedOption].total)}`
                            : '✓ Accept Quote & Pay Securely'}
                    </button>
                    {canPay(quote) && !paying && (
                      <div style={{ textAlign: 'center', marginTop: 8, fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <span>🔒</span> Secured by Stripe
                      </div>
                    )}
                    {payError && (
                      <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(var(--danger-rgb),0.08)', border: '1px solid rgba(var(--danger-rgb),0.2)', color: 'var(--danger)', fontSize: '0.85rem', textAlign: 'center' }}>
                        {payError}
                      </div>
                    )}
                    {quote.recurringTotal > 0 && (
                      <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--text-dim)', textAlign: 'center' }}>
                        Monthly recurring items are billed as your first month&apos;s payment. Ongoing invoices are sent after each service visit.
                      </div>
                    )}
                  </div>
                )}

                <div style={{ textAlign: 'center' }}>
                  <a href="https://cal.com/greenguard-usa/property-assessment" target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-block', padding: '12px 32px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(var(--gold-rgb),0.4)', color: 'var(--gold)', fontWeight: 700, fontSize: '0.9rem', textDecoration: 'none', marginBottom: 16 }}>
                    Schedule a Free Consultation First →
                  </a>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                    Questions? Call or text <a href="tel:+15125604129" style={{ color: 'var(--text-dim)' }}>512-560-4129</a>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 20 }}>
                    This quote is valid for 30 days · GreenGuard USA · Austin, TX
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </PortalLayout>
    </>
  )
}

export async function getServerSideProps({ params, query }) {
  const { verifyAndSanitizeQuoteToken } = require('../../lib/quote-link')
  let initialQuote = null
  let initialError = null
  try {
    initialQuote = await verifyAndSanitizeQuoteToken(params.token)
  } catch {
    initialError = 'Invalid or expired quote link'
  }
  return { props: { token: params.token, accepted: query.accepted === '1', initialQuote, initialError } }
}
