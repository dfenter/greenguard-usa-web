import { useState, useEffect } from 'react'
import Head from 'next/head'
import { trackEvent } from '../../lib/analytics'
import PortalLayout from '../../components/PortalLayout'
import { Skeleton } from '../../components/ui'

function fmt$(n) { return n != null ? `$${Number(n).toFixed(2)}` : 'TBD' }

export default function QuotePage({ token, accepted, initialQuote, initialError }) {
  const [quote, setQuote] = useState(initialQuote || null)
  const [error, setError] = useState(initialError || null)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState(null)

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
        body: JSON.stringify({ token, attribution }),
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
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
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
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 10 }}>Service Proposal</div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(1.8rem,3.2vw,2.4rem)', margin: '0 0 8px' }}>
                  {quote.customerName ? `Hi ${quote.customerName.split(' ')[0]},` : 'Your GreenGuard Proposal'}
                </h1>
                <p style={{ fontSize: '1rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
                  Here&apos;s your custom quote for pesticide-free CO₂ mosquito control service.
                </p>
              </div>

              {/* Customer info */}
              {(quote.customerEmail || quote.customerAddress) && (
                <div style={{ ...card, display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                  {quote.customerEmail && (
                    <div><span style={lbl}>Email</span><div style={{ fontWeight: 600 }}>{quote.customerEmail}</div></div>
                  )}
                  {quote.customerAddress && (
                    <div><span style={lbl}>Property</span><div style={{ fontWeight: 600 }}>{quote.customerAddress}</div></div>
                  )}
                </div>
              )}

              {/* Recurring services */}
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
                      {paying ? 'Redirecting to secure checkout…' : canPay(quote) ? '✓ Accept Quote & Pay Securely' : 'Contact us to finalize pricing'}
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
