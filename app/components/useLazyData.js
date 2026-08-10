import { useState, useEffect } from 'react'
import PortalLayout from './PortalLayout'

// Client-side data loader. Pages keep a tiny auth-only getServerSideProps and
// fetch their heavy data from a per-page API endpoint via this hook, so the
// shell paints instantly and data fills in. Returns { data, loading, error, reload }.
export function useLazyData(url) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    let timedOut = false
    const controller = new AbortController()
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 15000)
    setData(null)
    setError(null)
    fetch(url, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setError(timedOut ? 'Request timed out' : (e.message || 'Failed to load')) })
      .finally(() => clearTimeout(timer))
    return () => { alive = false; clearTimeout(timer); controller.abort() }
  }, [url, nonce])

  return { data, loading: data === null && !error, error, reload: () => setNonce((n) => n + 1) }
}

// Standard full-page loading shell for admin pages while their data loads.
export function LazyLoading({ isAdmin = true, label = 'Loading…' }) {
  return (
    <PortalLayout isAdmin={isAdmin}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: 'var(--text-dim)', fontSize: '0.9rem', fontWeight: 600 }}>
        <span className="lazy-spinner" style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(var(--green-rgb),0.20)', borderTopColor: 'var(--green)', display: 'inline-block', marginRight: 10, animation: 'spin 0.7s linear infinite' }} />
        {label}
      </div>
    </PortalLayout>
  )
}

// Standard full-page error shell with a retry.
export function LazyError({ isAdmin = true, error, onRetry }) {
  return (
    <PortalLayout isAdmin={isAdmin}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 12 }}>
        <div style={{ color: 'var(--danger)', fontSize: '0.9rem', fontWeight: 700 }}>Couldn’t load this page.</div>
        <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>{error}</div>
        {onRetry && (
          <button onClick={onRetry} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: 'var(--gold)', color: 'var(--text-on-accent)', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' }}>
            Retry
          </button>
        )}
      </div>
    </PortalLayout>
  )
}
