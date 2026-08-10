import Head from 'next/head'
import { useState, useEffect } from 'react'
import { getSessionFromRequest } from '../lib/auth'
import { trackEvent } from '../lib/analytics'

export async function getServerSideProps({ req, query }) {
  const session = await getSessionFromRequest(req)
  if (session) return { redirect: { destination: '/dashboard', permanent: false } }
  return { props: { error: query.error || null } }
}

export default function Login({ error }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(true)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [codeError, setCodeError] = useState('')

  useEffect(() => {
    const backup = localStorage.getItem('gg_backup')
    if (!backup) { setRestoring(false); return }
    fetch('/api/auth/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: backup }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          window.location.href = data.dest
        } else {
          localStorage.removeItem('gg_backup')
          setRestoring(false)
        }
      })
      .catch(() => setRestoring(false))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    await fetch('/api/auth/request-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setSent(true)
    setLoading(false)
    trackEvent('login_requested')
  }

  async function handleVerifyCode(e) {
    e.preventDefault()
    setCodeError('')
    setVerifying(true)
    try {
      const r = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: code.trim() }),
      })
      const data = await r.json().catch(() => ({}))
      if (data.ok) {
        // Save a backup so the app can self-restore if iOS evicts the cookie later
        if (data.backupToken) { try { localStorage.setItem('gg_backup', data.backupToken) } catch (_) {} }
        trackEvent('login_code_verified')
        window.location.href = data.dest || '/dashboard'
      } else {
        setCodeError(data.error || 'That code is incorrect or has expired.')
        setVerifying(false)
      }
    } catch (_) {
      setCodeError('Something went wrong. Please try again.')
      setVerifying(false)
    }
  }

  if (restoring) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)',
      }}>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Signing you in…</p>
      </div>
    )
  }

  return (
    <>
      <Head><title>Sign In · {process.env.NEXT_PUBLIC_BIZ_NAME || 'GreenGuard'}</title></Head>
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)',
        padding: '24px',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.7rem', marginBottom: 8 }}>
              {process.env.NEXT_PUBLIC_BIZ_NAME || 'GreenGuard USA'}
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0 }}>
              Customer Portal
            </p>
          </div>

          <div className="card" style={{ border: '1px solid rgba(var(--border-rgb),0.25)' }}>
            {sent ? (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ fontSize: '2rem', marginBottom: 16 }}>✉️</div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 12, color: 'var(--green)' }}>
                  Check your email
                </h2>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  If <strong style={{ color: 'var(--text)' }}>{email}</strong> is linked to a {process.env.NEXT_PUBLIC_BIZ_NAME || 'GreenGuard'} account,
                  you&apos;ll receive a sign-in link within a minute.
                </p>

                <div style={{ margin: '24px 0 0', paddingTop: 20, borderTop: '1px solid rgba(var(--border-rgb),0.2)' }}>
                  <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                    Using the home-screen app?
                  </p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
                    Enter the 6-digit code from that email to sign in right here.
                  </p>
                  <form onSubmit={handleVerifyCode}>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={code}
                      onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setCodeError('') }}
                      placeholder="123456"
                      style={{
                        width: '100%', padding: '13px 14px', borderRadius: 4,
                        border: `1px solid ${codeError ? 'rgba(var(--danger-rgb),0.6)' : 'rgba(var(--border-rgb),0.3)'}`,
                        background: 'var(--bg-card)', color: 'var(--text)',
                        fontSize: '1.4rem', fontWeight: 800, letterSpacing: '0.4em', textAlign: 'center',
                        marginBottom: 12, fontFamily: 'monospace',
                      }}
                    />
                    {codeError && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--danger)', margin: '0 0 12px', lineHeight: 1.4 }}>
                        {codeError}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={verifying || code.length !== 6}
                      className="btn-gold"
                      style={{ width: '100%', padding: '13px', fontSize: '0.95rem', opacity: (verifying || code.length !== 6) ? 0.55 : 1 }}
                    >
                      {verifying ? 'Signing in…' : 'Sign in with code'}
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 900, marginBottom: 6 }}>Sign in</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
                  Enter the email address associated with your GreenGuard service. We&apos;ll send you a sign-in link.
                </p>

                {(error === 'expired' || error === 'used') && (
                  <div style={{
                    background: 'rgba(var(--gold-rgb),0.12)', border: '1px solid rgba(var(--gold-rgb),0.3)',
                    borderRadius: 6, padding: '10px 14px', marginBottom: 16,
                    fontSize: '0.83rem', color: 'var(--gold)', lineHeight: 1.5,
                  }}>
                    That sign-in link has expired or already been used. Enter your email below to get a fresh one.
                  </div>
                )}

                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 6 }}>
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  style={{
                    width: '100%', padding: '11px 14px', borderRadius: 4,
                    border: '1px solid rgba(var(--border-rgb),0.3)',
                    background: 'var(--bg-card)', color: 'var(--text)',
                    fontSize: '0.95rem', marginBottom: 16,

                  }}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-gold"
                  style={{ width: '100%', padding: '13px', fontSize: '0.95rem' }}
                >
                  {loading ? 'Sending…' : 'Send sign-in link'}
                </button>
              </form>
            )}
          </div>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            Not a {process.env.NEXT_PUBLIC_BIZ_NAME || 'GreenGuard'} customer yet?{' '}
            <a href={process.env.NEXT_PUBLIC_BIZ_WEBSITE || 'https://greenguard-usa.com'} style={{ color: 'var(--green-muted)' }}>
              Learn more
            </a>
          </p>
        </div>
      </div>
    </>
  )
}
