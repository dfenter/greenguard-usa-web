import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import AdminChat from './AdminChat'

const NAV_LINKS = [
  { href: '/dashboard',          label: 'My Account' },
  { href: '/dashboard/history',  label: 'History' },
  { href: '/dashboard/map',      label: 'Map' },
  { href: '/dashboard/upgrade',  label: 'Upgrade' },
  { href: '/dashboard/settings', label: 'Settings' },
]

// Tech View + My Account intentionally moved OFF the top bar — they
// live on the admin Home page now (keeps the bar clean & focused).
const ADMIN_NAV_LINKS = [
  { href: '/admin/home',         label: 'Home' },
  { href: '/admin/timesheet',    label: 'Timesheet' },
  { href: '/admin/expenses',     label: 'Expenses' },
  { href: '/admin/calendar',     label: 'Calendar' },
  { href: '/admin/clients',      label: 'Clients' },
  { href: '/admin/rounds',       label: 'Rounds' },
  { href: '/admin/inventory',    label: 'Inventory' },
  { href: '/admin/quote',        label: 'Quote' },
  { href: '/admin/invoice',      label: 'Invoice' },
]

// minimal: logo-only header for logged-out contexts (e.g. the quote link page).
export default function PortalLayout({ children, title, isAdmin = false, topPadding, logoHref, minimal = false }) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => setMenuOpen(false), [router.pathname])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--bg-deep)',
        borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingLeft: 'max(20px, env(safe-area-inset-left))',
        paddingRight: 'max(20px, env(safe-area-inset-right))',
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 76, position: 'relative',
        }}>
          <Link href={logoHref || (isAdmin ? '/admin/home' : '/dashboard')} style={{ textDecoration: 'none', lineHeight: 1.15, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>
              <span style={{ display: 'block', fontWeight: 900, fontSize: '1.32rem', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                {process.env.NEXT_PUBLIC_BIZ_NAME || 'GreenGuard USA'}
              </span>
              <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {process.env.NEXT_PUBLIC_BIZ_TAGLINE || 'Smart · Safe · Effective'}
              </span>
            </span>
          </Link>

          {!minimal && (
          <button
            className="hamburger"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Open navigation"
          >
            <span /><span /><span />
          </button>
          )}

          {!minimal && (
          <div className={'nav-links' + (menuOpen ? ' open' : '')} style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', gap: 6, minWidth: 0 }}>
            {/* Customer links — hidden when admin */}
            {!isAdmin && NAV_LINKS.map(({ href, label }) => {
              const active = router.pathname === href
              return (
                <Link key={href} href={href} style={{ fontSize: '1.05rem', fontWeight: active ? 800 : 700, padding: '9px 16px', borderRadius: 'var(--radius-sm)', whiteSpace: 'nowrap', flexShrink: 0, transition: 'background 0.15s var(--ease), color 0.15s var(--ease)', color: active ? 'var(--green)' : 'var(--text)', background: active ? 'rgba(var(--green-rgb),0.12)' : 'transparent', boxShadow: active ? 'inset 0 0 0 1px rgba(var(--green-rgb),0.28)' : 'none' }}>
                  {label}
                </Link>
              )
            })}

            {/* Admin links — hidden when customer */}
            {isAdmin && ADMIN_NAV_LINKS.map(({ href, label }) => {
              const active = router.pathname === href
              return (
                <Link key={href} href={href} style={{ fontSize: '1.05rem', fontWeight: active ? 800 : 700, padding: '9px 14px', borderRadius: 'var(--radius-sm)', whiteSpace: 'nowrap', flexShrink: 0, transition: 'background 0.15s var(--ease), color 0.15s var(--ease)', color: active ? 'var(--gold)' : 'rgba(var(--gold-rgb),0.82)', background: active ? 'rgba(var(--gold-rgb),0.13)' : 'transparent', boxShadow: active ? 'inset 0 0 0 1px rgba(var(--gold-rgb),0.30)' : 'none' }}>
                  {label}
                </Link>
              )
            })}

            <button
              type="button"
              className="nav-signout"
              onClick={async () => {
                try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }) } catch {}
                window.location.href = '/login'
              }}
              style={{ fontSize: '1.05rem', fontWeight: 700, padding: '9px 18px', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0, lineHeight: 1.2, background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 0.15s var(--ease), color 0.15s var(--ease)' }}
            >
              Sign out
            </button>
          </div>
          )}
        </div>
      </nav>

      {/* Page content — on mobile, clear the fixed dock (~70px + iOS safe-area).
          Dock is hidden on tablet/desktop so no extra bottom padding needed there. */}
      <main className={isAdmin ? 'admin-main' : ''} style={{
        flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%',
        paddingTop: topPadding ?? '40px', paddingBottom: topPadding ?? '40px',
        paddingLeft: 'max(20px, env(safe-area-inset-left))',
        paddingRight: 'max(20px, env(safe-area-inset-right))',
      }}>
        {title && (
          <h1 style={isAdmin
            ? { fontSize: 'clamp(1.5rem,3vw,2rem)', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 32 }
            : { fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(1.7rem,3.4vw,2.3rem)', letterSpacing: '0', marginBottom: 32 }}>
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

      {/* Ops assistant — admin/tech only */}
      {isAdmin && <AdminChat />}

      {/* Bottom-docked quick access for admin on mobile/tablet */}
      {isAdmin && <AdminBottomDock pathname={router.pathname} />}
    </div>
  )
}

// The dock is the crew's primary navigation on a phone, so the time clock and
// the day's calendar belong in it.
const DOCK_ITEMS = [
  { href: '/admin/timesheet', label: 'Time',      icon: '⏱' },
  { href: '/admin/calendar',  label: 'Calendar',  icon: '📅' },
  { href: '/admin/rounds',    label: 'Rounds',    icon: '🚐' },
  { href: '/admin/inventory', label: 'Inventory', icon: '📦' },
  { href: '/admin/clients',   label: 'Clients',   icon: '👥' },
]

function AdminBottomDock({ pathname }) {
  return (
    <nav className="admin-dock" aria-label="Admin quick access" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 90,
      background: 'var(--bg-deep)',
      borderTop: '1px solid var(--border)',
      display: 'flex', justifyContent: 'space-around', alignItems: 'stretch',
      padding: '8px 8px env(safe-area-inset-bottom, 8px)',
      boxShadow: '0 -6px 20px rgba(0,0,0,0.30)',
    }}>
      {DOCK_ITEMS.map(({ href, label, icon }) => {
        const active = pathname === href
        return (
          <Link key={href} href={href} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 3, padding: '8px 4px', borderRadius: 'var(--radius-sm)', textDecoration: 'none', minWidth: 0,
            color: active ? 'var(--gold)' : 'rgba(var(--text-rgb),0.62)',
            background: active ? 'rgba(var(--gold-rgb),0.12)' : 'transparent',
            boxShadow: active ? 'inset 0 0 0 1px rgba(var(--gold-rgb),0.30)' : 'none',
            fontWeight: active ? 800 : 700,
            transition: 'background 0.15s var(--ease), color 0.15s var(--ease)',
          }}>
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{icon}</span>
            <span style={{ fontSize: '0.72rem', letterSpacing: '0.03em' }}>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
