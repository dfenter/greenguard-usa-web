import { useState, useEffect } from 'react'
import Head from 'next/head'

function fmt$(n) { return n != null ? `$${Number(n).toFixed(2)}` : 'TBD' }

export default function QuotePage({ token }) {
  const [quote, setQuote] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`/api/admin/quote-link?token=${token}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setQuote(d) })
      .catch(() => setError('Failed to load quote'))
  }, [token])

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
              </div>

              {/* Notes */}
              {quote.notes && (
                <div style={{ ...card, borderColor: 'rgba(122,171,130,0.12)' }}>
                  <span style={lbl}>Notes</span>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(212,230,202,0.6)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{quote.notes}</p>
                </div>
              )}

              {/* CTA */}
              <div style={{ textAlign: 'center', marginTop: 40 }}>
                <a href="https://cal.com/greenguard-usa/property-assessment" target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-block', padding: '16px 40px', borderRadius: 8, background: '#c9a84c', color: '#0d1a10', fontWeight: 900, fontSize: '1rem', textDecoration: 'none', marginBottom: 16 }}>
                  Schedule Your Free Consultation →
                </a>
                <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.35)', marginTop: 10 }}>
                  Questions? Call or text <a href="tel:+15125604129" style={{ color: 'rgba(212,230,202,0.5)' }}>512-560-4129</a>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(212,230,202,0.2)', marginTop: 28 }}>
                  This quote is valid for 30 days · GreenGuard USA · Austin, TX
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export async function getServerSideProps({ params }) {
  return { props: { token: params.token } }
}
