import * as Sentry from '@sentry/nextjs'
import Error from 'next/error'
import Head from 'next/head'
import Link from 'next/link'

export default function ErrorPage({ statusCode }) {
  const is500 = !statusCode || statusCode >= 500
  return (
    <>
      <Head><title>{statusCode || 'Error'} · GreenGuard</title></Head>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0d1a10, #1a2e1f)', padding: 24, fontFamily: 'Inter, sans-serif', color: '#d4e6ca' }}>
        <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: '1.3rem', letterSpacing: '-0.02em', marginBottom: 32 }}>
            Green<span style={{ color: '#7dffaa' }}>Guard</span> USA
          </div>
          <div style={{ fontSize: '4rem', fontWeight: 900, lineHeight: 1, color: '#c9a84c', marginBottom: 8 }}>
            {statusCode || '?'}
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12 }}>
            {is500 ? 'Something went wrong on our end.' : 'Page not found.'}
          </div>
          <p style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.5)', marginBottom: 32, lineHeight: 1.6 }}>
            {is500
              ? 'We\'ve been notified and are looking into it. Please try again in a moment.'
              : 'The page you\'re looking for doesn\'t exist or has moved.'}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '12px 24px', borderRadius: 6, background: '#c9a84c', color: '#0d1a10', fontWeight: 800, fontSize: '0.9rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Try again
            </button>
            <Link href="/" style={{ padding: '12px 24px', borderRadius: 6, background: 'rgba(125,255,170,0.08)', border: '1px solid rgba(125,255,170,0.2)', color: '#7dffaa', fontWeight: 800, fontSize: '0.9rem', textDecoration: 'none', display: 'inline-block' }}>
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
