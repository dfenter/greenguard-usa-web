import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'

const NAV_LINKS = [
  { href: '/dashboard',          label: 'My Account' },
  { href: '/dashboard/history',  label: 'History' },
  { href: '/dashboard/settings', label: 'Settings' },
]

const ADMIN_NAV_LINKS = [
  { href: '/admin/home',         label: '🏠 Home' },
  { href: '/admin/calendar',     label: 'Calendar' },
  { href: '/admin/clients',      label: 'Clients' },
  { href: '/admin/rounds',       label: 'Customer Rounds' },
  { href: '/admin/inventory',    label: 'Inventory' },
  { href: '/admin/quote',        label: 'Quote' },
  { href: '/admin/invoice',      label: 'Invoice' },
  { href: '/admin/tech',         label: 'Tech View' },
  { href: '/dashboard?preview=1', label: 'My Account ↗', customer: true },
]

export default function PortalLayout({ children, title, isAdmin = false, topPadding }) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => setMenuOpen(false), [router.pathname])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--bg-deep)', backdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 72, position: 'relative',
        }}>
          <Link href={isAdmin ? '/admin/home' : '/dashboard'} style={{ textDecoration: 'none', lineHeight: 1.1, flexShrink: 0 }}>
            <div style={{ fontWeight: 900, fontSize: '1.3rem', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
              {process.env.NEXT_PUBLIC_BIZ_NAME || 'GreenGuard USA'}
            </div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {process.env.NEXT_PUBLIC_BIZ_TAGLINE || 'Smart · Safe · Effective'}
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
              <Link key={href} href={href} style={{ fontSize: '1.05rem', fontWeight: 700, padding: '8px 16px', borderRadius: 4, whiteSpace: 'nowrap', color: router.pathname === href ? 'var(--green)' : 'var(--text)', background: router.pathname === href ? 'rgba(var(--green-rgb),0.08)' : 'transparent' }}>
                {label}
              </Link>
            ))}

            {/* Admin links — hidden when customer */}
            {isAdmin && ADMIN_NAV_LINKS.map(({ href, label, customer }) => (
              <Link key={href} href={href} style={{ fontSize: '1.05rem', fontWeight: 700, padding: '8px 12px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0, color: customer ? 'rgba(var(--green-rgb),0.6)' : router.pathname === href ? 'var(--gold)' : 'rgba(var(--gold-rgb),0.8)', background: router.pathname === href ? 'rgba(var(--gold-rgb),0.08)' : 'transparent', borderLeft: customer ? '1px solid rgba(var(--green-rgb),0.15)' : 'none', marginLeft: customer ? 4 : 0 }}>
                {label}
              </Link>
            ))}

            <button
              type="button"
              onClick={async () => {
                try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }) } catch {}
                window.location.href = '/login'
              }}
              style={{ marginLeft: 8, fontSize: '1rem', fontWeight: 700, padding: '8px 14px', borderRadius: 4, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0, background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      {/* Page content — on mobile, clear the fixed dock (~70px + iOS safe-area).
          Dock is hidden on tablet/desktop so no extra bottom padding needed there. */}
      <main className={isAdmin ? 'admin-main' : ''} style={{
        flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%',
        padding: `${topPadding ?? '40px'} 24px`,
      }}>
        {title && (
          <h1 style={{ fontSize: 'clamp(1.5rem,3vw,2rem)', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 32 }}>
            {title}
          </h1>
        )}
        {children}
      </main>

      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '20px 24px',
        textAlign: 'center',
        fontSize: '0.78rem',
        color: 'var(--text-dim)',
      }}>
        © {new Date().getFullYear()} {process.env.NEXT_PUBLIC_BIZ_NAME || 'GreenGuard USA'} · {process.env.NEXT_PUBLIC_BIZ_CITY || 'Austin, TX'}
      </footer>

      {/* Bottom-docked quick access for admin on mobile/tablet */}
      {isAdmin && <AdminBottomDock pathname={router.pathname} />}
    </div>
  )
}

const DOCK_ITEMS = [
  { href: '/admin/inventory', label: 'Inventory', icon: '📦' },
  { href: '/admin/calendar',  label: 'Calendar',  icon: '📅' },
  { href: '/admin/clients',   label: 'Clients',   icon: '👥' },
  { href: '/admin/rounds',    label: 'Rounds',    icon: '🚐' },
  { href: '/admin/quote',     label: 'Quote',     icon: '📝' },
]

function AdminBottomDock({ pathname }) {
  return (
    <nav className="admin-dock" aria-label="Admin quick access" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 90,
      background: 'var(--bg-deep)', backdropFilter: 'blur(12px)',
      borderTop: '1px solid rgba(var(--gold-rgb),0.25)',
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
            color: active ? 'var(--gold)' : 'rgba(var(--text-rgb),0.55)',
            background: active ? 'rgba(var(--gold-rgb),0.10)' : 'transparent',
            fontWeight: active ? 800 : 600,
          }}>
            <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>{icon}</span>
            <span style={{ fontSize: '0.78rem', letterSpacing: '0.04em' }}>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
