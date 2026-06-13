import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { getSessionFromRequest, createSessionToken } from '../lib/auth'

export async function getServerSideProps({ req, res, query }) {
  const session = await getSessionFromRequest(req, res)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  const next = query.next || '/dashboard'
  // Validate next is a relative path to prevent open redirect
  const dest = next.startsWith('/') ? next : '/dashboard'
  // Generate a backup token for localStorage — lets the standalone PWA restore its
  // cookie if iOS evicts it between sessions (cookie store is isolated from Safari)
  const backupToken = await createSessionToken(session.email, session.stripeCustomerId)
  return { props: { dest, backupToken } }
}

export default function AuthSuccess({ dest, backupToken }) {
  const router = useRouter()
  const [count, setCount] = useState(3)

  useEffect(() => {
    if (backupToken) {
      try { localStorage.setItem('gg_backup', backupToken) } catch (_) {}
    }
    const interval = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          clearInterval(interval)
          router.replace(dest)
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [dest, router, backupToken])

  return (
    <>
      <Head><title>Signed In · GreenGuard</title></Head>
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0d1a10, #1a2e1f)',
        padding: '24px',
      }}>
        <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: 20 }}>✅</div>
          <h1 style={{
            fontWeight: 900,
            fontSize: '1.5rem',
            color: '#7dffaa',
            marginBottom: 12,
          }}>
            You&apos;re signed in!
          </h1>
          <p style={{
            color: 'rgba(212,230,202,0.65)',
            fontSize: '0.95rem',
            marginBottom: 36,
            lineHeight: 1.5,
          }}>
            Opening your dashboard in {count}…
          </p>

          <a
            href={dest}
            style={{
              display: 'block',
              background: '#7dffaa',
              color: '#0d1a10',
              fontWeight: 900,
              fontSize: '1.1rem',
              padding: '18px 24px',
              borderRadius: 8,
              textDecoration: 'none',
              letterSpacing: '-0.01em',
            }}
          >
            Open Dashboard
          </a>

          <p style={{
            marginTop: 20,
            fontSize: '0.78rem',
            color: 'rgba(212,230,202,0.3)',
          }}>
            Redirecting automatically in {count} second{count !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </>
  )
}
