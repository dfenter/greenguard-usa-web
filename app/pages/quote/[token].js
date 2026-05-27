import { useState, useEffect } from 'react'
import Head from 'next/head'

function fmt$(n) { return n != null ? `$${Number(n).toFixed(2)}` : 'TBD' }

export default function QuotePage({ token, accepted }) {
  const [quote, setQuote] = useState(null)
  const [error, setError] = useState(null)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState(null)

  useEffect(() => {
    fetch(`/api/admin/quote-link?token=${token}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setQuote(d) })
      .catch(() => setError('Failed to load quote'))
  }, [token])

  useEffect(() => {
    if (!accepted || !quote) return
    if (typeof window.gtag !== 'function') return
    window.gtag('event', 'purchase', {
      transaction_id: token,
      value: quote.total ?? 0,
      currency: 'USD',
    })
  }, [accepted, quote])

  async function handleAcceptPay() {
    setPaying(true)
    setPayError(null)
    try {
      const res = await fetch('/api/quote/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
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

  const card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(122,171,130,0.18)', borderRadius: 12, padding: 28, marginBottom: 20 }
  const lbl = { fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.7)', marginBottom: 8, display: 'block' }

  return (
    <>
      <Head>
        <title>{quote ? `Quote for ${quote.customerName || 'You'} · GreenGuard USA` : 'GreenGuard USA Quote'}</title>
        <meta name="robots" content="noindex" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>
      <div style={{ minHeight: '100vh', background: '#0d1a10', color: '#d4e6ca', fontFamily: "'Nunito Sans', sans-serif", padding: '0 0 80px' }}>
        {/* Header */}
        <div style={{ background: 'rgba(13,26,16,0.95)', borderBottom: '1px solid rgba(122,171,130,0.15)', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>
              Green<span style={{ color: '#7dffaa' }}>Guard</span> USA
            </div>
            <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)' }}>Smart · Safe · Effective</div>
          </div>
          <a href="https://www.greenguard-usa.com" style={{ fontSize: '0.8rem', color: 'rgba(212,230,202,0.45)', textDecoration: 'none' }}>greenguard-usa.com</a>
        </div>

        <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px' }}>
          {error && (
            <div style={{ padding: 28, borderRadius: 12, background: 'rgba(255,100,100,0.08)', border: '1px solid rgba(255,100,100,0.2)', color: '#ff8080', textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 8 }}>Quote Not Found</div>
              <p style={{ margin: 0, color: 'rgba(212,230,202,0.55)' }}>{error}. This link may have expired or been invalidated. Contact us for a new quote.</p>
            </div>
          )}

          {!quote && !error && (
            <div style={{ textAlign: 'center', padding: 60, color: 'rgba(212,230,202,0.35)' }}>Loading your quote…</div>
          )}

          {quote && (
            <>
              {/* Title */}
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 10 }}>Service Proposal</div>
                <h1 style={{ fontSize: 'clamp(1.6rem,3vw,2.2rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
                  {quote.customerName ? `Hi ${quote.customerName.split(' ')[0]},` : 'Your GreenGuard Proposal'}
                </h1>
                <p style={{ fontSize: '1rem', color: 'rgba(212,230,202,0.55)', margin: 0, lineHeight: 1.6 }}>
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
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(122,171,130,0.08)', fontSize: '0.92rem' }}>
                      <span style={{ color: 'rgba(212,230,202,0.75)' }}>{line.label}</span>
                      <span style={{ fontWeight: 800, color: '#7dffaa' }}>{line.amount != null ? `${fmt$(line.amount)}/mo` : 'TBD'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Add-ons (recurring) */}
              {quote.addonLines?.filter(l => l.recurring).length > 0 && (
                <div style={card}>
                  <span style={lbl}>Monthly Add-Ons</span>
                  {quote.addonLines.filter(l => l.recurring).map((line, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(122,171,130,0.08)', fontSize: '0.92rem' }}>
                      <span style={{ color: 'rgba(212,230,202,0.75)' }}>{line.label}</span>
                      <span style={{ fontWeight: 700, color: '#7dffaa' }}>{line.amount != null ? `${fmt$(line.amount)}/mo` : 'TBD'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* One-time */}
              {[...(quote.serviceLines || []), ...(quote.addonLines || []), ...(quote.productLines || [])].filter(l => !l.recurring).length > 0 && (
                <div style={card}>
                  <span style={lbl}>One-Time</span>
                  {[...(quote.serviceLines || []), ...(quote.addonLines || []), ...(quote.productLines || [])].filter(l => !l.recurring).map((line, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(122,171,130,0.08)', fontSize: '0.92rem' }}>
                      <span style={{ color: 'rgba(212,230,202,0.75)' }}>{line.label}</span>
                      <span style={{ fontWeight: 700, color: '#5bc4ff' }}>{line.amount != null ? fmt$(line.amount) : 'TBD'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Totals */}
              <div style={{ ...card, background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.2)' }}>
                {quote.recurringTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontWeight: 700, color: 'rgba(212,230,202,0.6)' }}>Monthly recurring</span>
                    <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#7dffaa' }}>{fmt$(quote.recurringTotal)}/mo</span>
                  </div>
                )}
                {quote.oneTimeTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontWeight: 700, color: 'rgba(212,230,202,0.6)' }}>One-time</span>
                    <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#5bc4ff' }}>{fmt$(quote.oneTimeTotal)}</span>
                  </div>
                )}
                {quote.taxAmount > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, paddingTop: 8, borderTop: '1px solid rgba(122,171,130,0.12)' }}>
                      <span style={{ fontWeight: 600, color: 'rgba(212,230,202,0.5)' }}>Tax ({quote.taxRate}%)</span>
                      <span style={{ fontWeight: 700, color: 'rgba(212,230,202,0.7)' }}>{fmt$(quote.taxAmount)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid rgba(201,168,76,0.25)' }}>
                      <span style={{ fontWeight: 800, color: '#d4e6ca' }}>Total due</span>
                      <span style={{ fontWeight: 900, fontSize: '1.15rem', color: '#c9a84c' }}>{fmt$((quote.recurringTotal || 0) + (quote.oneTimeTotal || 0) + quote.taxAmount)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Notes */}
              {quote.notes && (
                <div style={{ ...card, borderColor: 'rgba(122,171,130,0.12)' }}>
                  <span style={lbl}>Notes</span>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(212,230,202,0.6)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{quote.notes}</p>
                </div>
              )}

              {/* CTA */}
              <div style={{ marginTop: 40 }}>

                {/* Success banner — shown after returning from Stripe */}
                {accepted && (
                  <div style={{ marginBottom: 28, padding: '20px 24px', borderRadius: 12, background: 'rgba(125,255,170,0.07)', border: '1px solid rgba(125,255,170,0.3)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🎉</div>
                    <div style={{ fontWeight: 900, fontSize: '1.05rem', color: '#7dffaa', marginBottom: 6 }}>You&apos;re all set!</div>
                    <p style={{ margin: 0, fontSize: '0.88rem', color: 'rgba(212,230,202,0.6)', lineHeight: 1.6 }}>
                      Payment confirmed. We&apos;ll reach out within 24 hours to schedule your first service visit. Welcome to GreenGuard!
                    </p>
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
                        background: paying || !canPay(quote) ? 'rgba(125,255,170,0.15)' : 'linear-gradient(135deg,#7dffaa,#4dd98a)',
                        color: paying || !canPay(quote) ? 'rgba(212,230,202,0.4)' : '#0d1a10',
                        fontWeight: 900, fontSize: '1.05rem', fontFamily: "'Nunito Sans', sans-serif",
                        cursor: paying || !canPay(quote) ? 'not-allowed' : 'pointer',
                        letterSpacing: '-0.01em',
                        transition: 'opacity 0.15s',
                        opacity: paying ? 0.7 : 1,
                      }}
                    >
                      {paying ? 'Redirecting to secure checkout…' : canPay(quote) ? '✓ Accept Quote & Pay Securely' : 'Contact us to finalize pricing'}
                    </button>
                    {canPay(quote) && !paying && (
                      <div style={{ textAlign: 'center', marginTop: 8, fontSize: '0.75rem', color: 'rgba(212,230,202,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <span>🔒</span> Secured by Stripe
                      </div>
                    )}
                    {payError && (
                      <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,100,100,0.08)', border: '1px solid rgba(255,100,100,0.2)', color: '#ff8080', fontSize: '0.85rem', textAlign: 'center' }}>
                        {payError}
                      </div>
                    )}
                    {quote.recurringTotal > 0 && (
                      <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'rgba(212,230,202,0.35)', textAlign: 'center' }}>
                        Monthly recurring items are billed as your first month&apos;s payment. Ongoing invoices are sent after each service visit.
                      </div>
                    )}
                  </div>
                )}

                <div style={{ textAlign: 'center' }}>
                  <a href="https://cal.com/greenguard-usa/property-assessment" target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-block', padding: '12px 32px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(201,168,76,0.4)', color: '#c9a84c', fontWeight: 700, fontSize: '0.9rem', textDecoration: 'none', marginBottom: 16 }}>
                    Schedule a Free Consultation First →
                  </a>
                  <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.35)' }}>
                    Questions? Call or text <a href="tel:+15125604129" style={{ color: 'rgba(212,230,202,0.5)' }}>512-560-4129</a>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(212,230,202,0.2)', marginTop: 20 }}>
                    This quote is valid for 30 days · GreenGuard USA · Austin, TX
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export async function getServerSideProps({ params, query }) {
  return { props: { token: params.token, accepted: query.accepted === '1' } }
}
