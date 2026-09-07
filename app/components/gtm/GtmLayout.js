import Link from 'next/link'
import { useRouter } from 'next/router'
import PortalLayout from '../PortalLayout'

const GTM_NAV = [
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

export default function GtmLayout({ children, title, session, progressPct }) {
  const router = useRouter()

  return (
    <PortalLayout title={title} isAdmin={false} floatingAssistant={false} logoHref="/gtm">
      <div className="gtm-shell">
        <aside className="gtm-nav" aria-label="GTM navigation">
          {GTM_NAV.map(({ href, label }) => {
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

          {/* Wave 2: GtmChat floating assistant mounts here. */}
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
