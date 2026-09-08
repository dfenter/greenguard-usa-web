import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import PortalLayout from '../PortalLayout'
import GtmChat from './GtmChat'
import { PRODUCTS, DEFAULT_PRODUCT } from '../../lib/gtm-products'

// SparkBridge's nav here includes Training/Site pages/Partners, which exist
// as pages today but are not (yet) part of PRODUCTS.sparkbridge.nav in
// lib/gtm-products.js. Kept as an override so SparkBridge behavior is
// unchanged; ops uses PRODUCTS.ops.nav as-is.
const SPARKBRIDGE_NAV = [
  { href: '/gtm',            label: 'Dashboard' },
  { href: '/gtm/plan',       label: 'Plan' },
  { href: '/gtm/timeline',   label: 'Timeline' },
  { href: '/gtm/training',   label: 'Training' },
  { href: '/gtm/targets',    label: 'Targets' },
  { href: '/gtm/outreach',   label: 'Outreach' },
  { href: '/gtm/discovery',  label: 'Discovery' },
  { href: '/gtm/objections', label: 'Objections' },
  { href: '/gtm/competitive', label: 'Competitive' },
  { href: '/gtm/reports',    label: 'Reports' },
  { href: '/gtm/site',       label: 'Site pages' },
  { href: '/gtm/partners',   label: 'Partners' },
  { href: '/gtm/internal',   label: 'Internal' },
]

const SWITCHER_OPTIONS = [
  { key: 'sparkbridge', label: 'SparkBridge', href: '/gtm' },
  { key: 'ops', label: 'One Person Show', href: '/gtm/ops' },
]

const STORAGE_KEY = 'gtm-product'

export default function GtmLayout({ children, title, session, progressPct, product = DEFAULT_PRODUCT }) {
  const router = useRouter()
  const nav = product === 'sparkbridge' ? SPARKBRIDGE_NAV : (PRODUCTS[product]?.nav || SPARKBRIDGE_NAV)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, product)
    } catch {
      // ignore storage failures (private mode, disabled storage)
    }
  }, [product])

  return (
    <PortalLayout title={title} isAdmin={false} floatingAssistant={false} logoHref="/gtm">
      <div className="gtm-shell">
        <aside className="gtm-nav" aria-label="GTM navigation">
          <div className="gtm-switcher" role="tablist" aria-label="GTM product">
            {SWITCHER_OPTIONS.map((opt) => (
              <Link
                key={opt.key}
                href={opt.href}
                role="tab"
                aria-selected={product === opt.key}
                style={{
                  display: 'block',
                  padding: '8px 10px',
                  borderRadius: 8,
                  fontSize: '0.82rem',
                  fontWeight: product === opt.key ? 800 : 600,
                  color: product === opt.key ? 'var(--gold)' : 'var(--text)',
                  background: product === opt.key ? 'rgba(120,88,0,0.10)' : 'transparent',
                  boxShadow: product === opt.key ? 'inset 0 0 0 1px var(--border-gold)' : 'none',
                  textDecoration: 'none',
                  textAlign: 'center',
                }}
              >
                {opt.label}
              </Link>
            ))}
          </div>
          <div className="gtm-nav-sep" />
          {nav.map(({ href, label }) => {
            const active = router.pathname === href
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: 'block',
                  padding: '9px 14px',
                  borderRadius: 8,
                  fontSize: '0.95rem',
                  fontWeight: active ? 800 : 600,
                  color: active ? 'var(--gold)' : 'var(--text)',
                  background: active ? 'rgba(120,88,0,0.10)' : 'transparent',
                  boxShadow: active ? 'inset 0 0 0 1px var(--border-gold)' : 'none',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </Link>
            )
          })}
        </aside>

        <div className="gtm-main">
          <div className="gtm-topbar">
            <h1 style={{ fontSize: '1.4rem', fontWeight: 900, margin: 0 }}>{title}</h1>
            <div className="gtm-topbar-right">
              {session?.email && <span className="gtm-email">{session.email}</span>}
              {typeof progressPct === 'number' && (
                <span className="gtm-progress">{Math.round(progressPct)}%</span>
              )}
            </div>
          </div>

          {children}

          <GtmChat />
        </div>
      </div>

      <style jsx>{`
        .gtm-shell {
          display: flex;
          gap: 24px;
          align-items: flex-start;
        }
        .gtm-nav {
          flex: 0 0 190px;
          position: sticky;
          top: 96px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          background: var(--bg-card);
          border: 1px solid var(--border-gold);
          border-radius: 12px;
          padding: 10px;
        }
        .gtm-switcher {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin-bottom: 4px;
        }
        .gtm-nav-sep {
          height: 1px;
          background: var(--border-gold);
          opacity: 0.4;
          margin: 6px 2px 8px;
        }
        .gtm-main {
          flex: 1;
          min-width: 0;
        }
        .gtm-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .gtm-topbar-right {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        .gtm-progress {
          font-weight: 800;
          color: var(--gold);
          border: 1px solid var(--border-gold);
          border-radius: 999px;
          padding: 2px 10px;
        }
        @media (max-width: 780px) {
          .gtm-shell {
            flex-direction: column;
          }
          .gtm-nav {
            position: static;
            flex-direction: row;
            flex-wrap: wrap;
            width: 100%;
          }
        }
      `}</style>
    </PortalLayout>
  )
}
