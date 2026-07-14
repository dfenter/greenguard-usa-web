import * as Sentry from '@sentry/nextjs'
import Error from 'next/error'
import Head from 'next/head'
import Link from 'next/link'

export default function ErrorPage({ statusCode }) {
  const is500 = !statusCode || statusCode >= 500
  return (
    <>
      <Head><title>{statusCode || 'Error'} · GreenGuard</title></Head>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24, fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif", color: 'var(--text)' }}>
        <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: '1.3rem', letterSpacing: '-0.02em', marginBottom: 32 }}>
            Green<span style={{ color: 'var(--green)' }}>Guard</span> USA
          </div>
          <div style={{ fontSize: '4rem', fontWeight: 900, lineHeight: 1, color: 'var(--gold)', marginBottom: 8 }}>
            {statusCode || '?'}
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12 }}>
            {is500 ? 'Something went wrong on our end.' : 'Page not found.'}
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: 32, lineHeight: 1.6 }}>
            {is500
              ? 'We\'ve been notified and are looking into it. Please try again in a moment.'
              : 'The page you\'re looking for doesn\'t exist or has moved.'}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '12px 24px', borderRadius: 6, background: 'var(--green)', color: 'var(--text-on-accent)', fontWeight: 800, fontSize: '0.9rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Try again
            </button>
            <Link href="/" style={{ padding: '12px 24px', borderRadius: 6, background: 'rgba(var(--green-rgb),0.10)', border: '1px solid var(--border)', color: 'var(--green)', fontWeight: 800, fontSize: '0.9rem', textDecoration: 'none', display: 'inline-block' }}>
              Go home
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}

ErrorPage.getInitialProps = async (contextData) => {
  await Sentry.captureUnderscoreErrorException(contextData)
  const { res, err } = contextData
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}
