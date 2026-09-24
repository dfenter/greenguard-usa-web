import Head from 'next/head'
import { useState } from 'react'

// Public page: re-send the combined SparkBridge license key for one gateway.
// The key is only ever emailed to the address the licences were bought with.

const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 4,
  border: '1px solid rgba(var(--border-rgb),0.3)',
  background: 'var(--bg-card)', color: 'var(--text)',
  fontSize: '0.95rem', marginBottom: 16,
}
const labelStyle = { display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 6 }

export default function SparkBridgeLicence() {
  const [email, setEmail] = useState('')
  const [gateway, setGateway] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/api/sparkbridge/reissue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, gateway }),
      })
      const data = await r.json().catch(() => ({}))
      if (r.ok) setMessage(data.message || 'Request received.')
      else setError(data.error || 'Something went wrong. Please try again.')
    } catch (_) {
      setError('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  return (
    <>
      <Head><title>SparkBridge license key · GreenGuard</title></Head>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '24px' }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.7rem', marginBottom: 8 }}>
            SparkBridge license key
          </div>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
            Every SparkBridge product bought with the same email address and the same Ignition gateway name
            is covered by one combined key, the <code>sparkbridge-license.key</code> file on that gateway.
          </p>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
            Enter both below and we will email the current combined key to the address the licences were bought with.
            A new key replaces the old file on that gateway. Keys bought without a gateway name are re-issued by
            replying to your license email.
          </p>

          {message ? (
            <p style={{ fontSize: '0.92rem', color: 'var(--green)', lineHeight: 1.6 }}>{message}</p>
          ) : (
            <form onSubmit={handleSubmit}>
              <label style={labelStyle} htmlFor="sb-email">Email address used at checkout</label>
              <input id="sb-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                required maxLength={254} placeholder="you@example.com" style={inputStyle} />
              <label style={labelStyle} htmlFor="sb-gateway">Ignition gateway name</label>
              <input id="sb-gateway" type="text" value={gateway} onChange={(e) => setGateway(e.target.value)}
                required maxLength={100} placeholder="Ignition-Gateway" style={inputStyle} />
              {error && (
                <p style={{ fontSize: '0.8rem', color: 'var(--danger)', margin: '0 0 12px', lineHeight: 1.4 }}>{error}</p>
              )}
              <button type="submit" disabled={loading} className="btn-gold"
                style={{ width: '100%', padding: '13px', fontSize: '0.95rem', opacity: loading ? 0.55 : 1 }}>
                {loading ? 'Sending…' : 'Email my combined key'}
              </button>
            </form>
          )}

          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 24, lineHeight: 1.5 }}>
            Questions: write to admin@greenguard-usa.com.
          </p>
        </div>
      </div>
    </>
  )
}
