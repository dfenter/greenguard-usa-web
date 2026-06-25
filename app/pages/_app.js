import '../styles/globals.css'
import React, { useEffect } from 'react'
import Head from 'next/head'
import Script from 'next/script'
import { useRouter } from 'next/router'
import { SpeedInsights } from '@vercel/speed-insights/next'

const PREFETCH_ROUTES = [
  '/admin/home', '/admin/tech', '/admin/rounds', '/admin/inventory',
  '/admin/clients', '/admin/quote', '/admin/invoice', '/admin/invoices',
  '/admin/route', '/admin/analytics', '/admin/books', '/admin/books/chat',
  '/admin/books/upload', '/admin/booking', '/admin/upgrade',
  '/dashboard', '/dashboard/billing', '/dashboard/co2', '/dashboard/equipment',
  '/dashboard/history', '/dashboard/map', '/dashboard/schedule',
  '/dashboard/settings', '/dashboard/upgrade',
  '/prospect',
]

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0d1a10, #1a2e1f)', padding: 24, fontFamily: 'Inter, sans-serif', color: '#d4e6ca', textAlign: 'center' }}>
          <div style={{ maxWidth: 400 }}>
            <div style={{ fontWeight: 900, fontSize: '1.3rem', marginBottom: 24 }}>{process.env.NEXT_PUBLIC_BIZ_NAME || 'GreenGuard USA'}</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Something went wrong.</div>
            <p style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.5)', marginBottom: 24 }}>Please refresh the page to continue.</p>
            <button onClick={() => window.location.reload()} style={{ padding: '12px 24px', borderRadius: 6, background: '#c9a84c', color: '#0d1a10', fontWeight: 800, fontSize: '0.9rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              Refresh
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App({ Component, pageProps }) {
  const router = useRouter()

  useEffect(() => {
    PREFETCH_ROUTES.forEach(route => router.prefetch(route))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Register the PWA service worker (production only) for installability,
  // faster static loads, and an offline fallback page.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {})
    window.addEventListener('load', register)
    return () => window.removeEventListener('load', register)
  }, [])

  return (
    <ErrorBoundary>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      {GA_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">{`
            window.dataLayer=window.dataLayer||[];
            function gtag(){dataLayer.push(arguments);}
            gtag('js',new Date());
            gtag('config','${GA_ID}');
          `}</Script>
        </>
      )}
      <Component {...pageProps} />
      <SpeedInsights />
    </ErrorBoundary>
  )
}
