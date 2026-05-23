import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'

const NAV_LINKS = [
  { href: '/dashboard', label: 'My Account' },
]

const ADMIN_NAV_LINKS = [
  { href: '/admin/home',         label: '🏠 Home' },
  { href: '/admin/analytics',    label: 'Analytics' },
  { href: '/admin/clients',      label: 'Clients' },
  { href: '/admin/rounds',       label: 'Customer Rounds' },
  { href: '/admin/inventory',    label: 'Daily Rounds' },
  { href: '/admin/quote',        label: 'Quote' },
  { href: '/admin/invoice',      label: 'Invoice' },
  { href: '/admin/route',        label: 'Route Plan' },
  { href: '/admin/tech',         label: 'Tech View' },
  { href: '/dashboard?preview=1', label: 'My Account ↗', customer: true },
]

export default function PortalLayout({ children, title, isAdmin = false }) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => setMenuOpen(false), [router.pathname])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(10,26,13,0.95)', backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(122,171,130,0.2)',
        padding: '0 24px',
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 72, position: 'relative',
        }}>
          <Link href="/dashboard" style={{ textDecoration: 'none', lineHeight: 1.1, flexShrink: 0 }}>
            <div style={{ fontWeight: 900, fontSize: '1.1rem', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
              Green<span style={{ color: '#7dffaa' }}>Guard</span> USA
            </div>
            <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.4)', whiteSpace: 'nowrap' }}>
              Smart · Safe · Effective
            </div>
          </Link>

          <button
            className="hamburger"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Open navigation"
          >
            <span /><span /><span />
          </button>

          <div className={'nav-links' + (menuOpen ? ' open' : '')} style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {/* Customer links — hidden when admin */}
            {!isAdmin && NAV_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} style={{ fontSize: '1rem', fontWeight: 700, padding: '6px 14px', borderRadius: 4, whiteSpace: 'nowrap', color: router.pathname === href ? '#7dffaa' : 'rgba(212,230,202,0.85)', background: router.pathname === href ? 'rgba(125,255,170,0.08)' : 'transparent' }}>
                {label}
              </Link>
            ))}

            {/* Admin links — hidden when customer */}
            {isAdmin && ADMIN_NAV_LINKS.map(({ href, label, customer }) => (
              <Link key={href} href={href} style={{ fontSize: '1rem', fontWeight: 700, padding: '6px 10px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0, color: customer ? 'rgba(125,255,170,0.6)' : router.pathname === href ? '#c9a84c' : 'rgba(201,168,76,0.8)', background: router.pathname === href ? 'rgba(201,168,76,0.08)' : 'transparent', borderLeft: customer ? '1px solid rgba(125,255,170,0.15)' : 'none', marginLeft: customer ? 4 : 0 }}>
                {label}
              </Link>
            ))}

            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/auth/logout" style={{ marginLeft: 8, fontSize: '0.9rem', fontWeight: 700, padding: '6px 12px', borderRadius: 4, color: 'rgba(212,230,202,0.5)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              Sign out
            </a>
          </div>
        </div>
      </nav>

      {/* Page content — extra bottom padding when admin so dock doesn't overlap */}
      <main style={{ flex: 1, maxWidth: 1100, margin: '0 auto', padding: isAdmin ? '40px 24px 100px' : '40px 24px', width: '100%' }}>
        {title && (
          <h1 style={{ fontSize: 'clamp(1.5rem,3vw,2rem)', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 32 }}>
            {title}
          </h1>
        )}
        {children}
      </main>

      <footer style={{
        borderTop: '1px solid rgba(122,171,130,0.12)',
        padding: isAdmin ? '20px 24px 84px' : '20px 24px',
        textAlign: 'center',
        fontSize: '0.78rem',
        color: 'rgba(212,230,202,0.35)',
      }}>
        © {new Date().getFullYear()} GreenGuard USA · Austin, TX
      </footer>

      {/* Bottom-docked quick access for admin on mobile/tablet */}
      {isAdmin && <AdminBottomDock pathname={router.pathname} />}
    </div>
  )
}

const DOCK_ITEMS = [
  { href: '/admin/clients',   label: 'Clients',  icon: '👥' },
  { href: '/admin/rounds',    label: 'Rounds',   icon: '🚐' },
  { href: '/admin/inventory', label: 'Daily',    icon: '📋' },
  { href: '/admin/quote',     label: 'Quote',    icon: '📝' },
  { href: '/admin/route',     label: 'Route',    icon: '🗺️' },
]

function AdminBottomDock({ pathname }) {
  return (
    <nav className="admin-dock" aria-label="Admin quick access" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 90,
      background: 'rgba(10,26,13,0.96)', backdropFilter: 'blur(12px)',
      borderTop: '1px solid rgba(201,168,76,0.25)',
      display: 'flex', justifyContent: 'space-around', alignItems: 'stretch',
      padding: '6px 8px env(safe-area-inset-bottom, 6px)',
      boxShadow: '0 -4px 12px rgba(0,0,0,0.25)',
    }}>
      {DOCK_ITEMS.map(({ href, label, icon }) => {
        const active = pathname === href
        return (
          <Link key={href} href={href} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 2, padding: '8px 4px', borderRadius: 8, textDecoration: 'none', minWidth: 0,
            color: active ? '#c9a84c' : 'rgba(212,230,202,0.55)',
            background: active ? 'rgba(201,168,76,0.10)' : 'transparent',
            fontWeight: active ? 800 : 600,
          }}>
            <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{icon}</span>
            <span style={{ fontSize: '0.65rem', letterSpacing: '0.04em' }}>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
