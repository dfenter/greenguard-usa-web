import Head from 'next/head'
import { useState } from 'react'
import { getSessionFromRequest } from '../lib/auth'

export async function getServerSideProps({ req, query }) {
  const session = await getSessionFromRequest(req)
  if (session) return { redirect: { destination: '/dashboard', permanent: false } }
  return { props: { error: query.error || null } }
}

export default function Login({ error }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

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
  }

  return (
    <>
      <Head><title>Sign In · GreenGuard</title></Head>
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #0d1a10, #1a2e1f)',
        padding: '24px',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontWeight: 900, fontSize: '1.3rem', letterSpacing: '-0.02em', marginBottom: 8 }}>
              Green<span style={{ color: '#7dffaa' }}>Guard</span> USA
            </div>
            <p style={{ fontSize: '0.88rem', color: 'rgba(212,230,202,0.6)', margin: 0 }}>
              Customer Portal
            </p>
          </div>

          <div className="card" style={{ border: '1px solid rgba(122,171,130,0.25)' }}>
            {sent ? (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ fontSize: '2rem', marginBottom: 16 }}>✉️</div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 12, color: '#7dffaa' }}>
                  Check your email
                </h2>
                <p style={{ fontSize: '0.88rem', color: 'rgba(212,230,202,0.65)', lineHeight: 1.6 }}>
                  If <strong style={{ color: '#d4e6ca' }}>{email}</strong> is linked to a GreenGuard account,
                  you&apos;ll receive a sign-in link within a minute.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 900, marginBottom: 6 }}>Sign in</h2>
                <p style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.6)', marginBottom: 24, lineHeight: 1.5 }}>
                  Enter the email address associated with your GreenGuard service. We&apos;ll send you a sign-in link.
                </p>

                {(error === 'expired' || error === 'used') && (
                  <div style={{
                    background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)',
                    borderRadius: 6, padding: '10px 14px', marginBottom: 16,
                    fontSize: '0.83rem', color: '#c9a84c', lineHeight: 1.5,
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
                    border: '1px solid rgba(122,171,130,0.3)',
                    background: 'rgba(255,255,255,0.05)', color: '#d4e6ca',
                    fontSize: '0.95rem', outline: 'none', marginBottom: 16,
                    fontFamily: 'Nunito Sans, sans-serif',
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

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.8rem', color: 'rgba(212,230,202,0.35)' }}>
            Not a GreenGuard customer yet?{' '}
            <a href="https://greenguard-usa.com" style={{ color: '#7aab82' }}>
              Learn more
            </a>
          </p>
        </div>
      </div>
    </>
  )
}

