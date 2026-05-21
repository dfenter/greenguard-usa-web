import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/schedule', label: 'Schedule' },
  { href: '/dashboard/equipment', label: 'My System' },
  { href: '/dashboard/billing', label: 'Billing' },
  { href: '/dashboard/co2', label: 'CO₂ Status' },
  { href: '/dashboard/map', label: 'My Map' },
]

const ADMIN_NAV_LINKS = [
  { href: '/admin/clients', label: 'Clients' },
  { href: '/admin/visit-complete', label: 'Log Visit' },
  { href: '/admin/quote', label: 'Quote' },
  { href: '/admin/inventory', label: 'Inventory' },
  { href: '/admin/map', label: 'Install Map' },
  { href: '/admin/booking', label: 'New Booking' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/route', label: 'Route Plan' },
  { href: '/admin/tank-calendar', label: 'Tanks' },
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
          height: 56, position: 'relative',
        }}>
          <Link href="/dashboard" style={{ fontWeight: 900, fontSize: '1rem', letterSpacing: '-0.02em' }}>
            Green<span style={{ color: '#7dffaa' }}>Guard</span>
          </Link>

          <button
            className="hamburger"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Open navigation"
          >
            <span /><span /><span />
          </button>

          <div className={'nav-links' + (menuOpen ? ' open' : '')}>
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  padding: '6px 12px',
                  borderRadius: 4,
                  color: router.pathname === href ? '#7dffaa' : 'rgba(212,230,202,0.7)',
                  background: router.pathname === href ? 'rgba(125,255,170,0.08)' : 'transparent',
                  transition: 'color 0.15s',
                }}
              >
                {label}
              </Link>
            ))}
            {isAdmin && (
              <>
                <span style={{ width: 1, height: 18, background: 'rgba(122,171,130,0.2)', margin: '0 4px' }} />
                {ADMIN_NAV_LINKS.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      padding: '6px 12px',
                      borderRadius: 4,
                      color: router.pathname === href ? '#c9a84c' : 'rgba(201,168,76,0.65)',
                      background: router.pathname === href ? 'rgba(201,168,76,0.08)' : 'transparent',
                      transition: 'color 0.15s',
                    }}
                  >
                    {label}
                  </Link>
                ))}
              </>
            )}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/api/auth/logout"
              style={{
                marginLeft: 8,
                fontSize: '0.78rem',
                fontWeight: 700,
                padding: '6px 12px',
                borderRadius: 4,
                color: 'rgba(212,230,202,0.45)',
              }}
            >
              Sign out
            </a>
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main style={{ flex: 1, maxWidth: 1100, margin: '0 auto', padding: '40px 24px', width: '100%' }}>
        {title && (
          <h1 style={{ fontSize: 'clamp(1.5rem,3vw,2rem)', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 32 }}>
            {title}
          </h1>
        )}
        {children}
      </main>

      <footer style={{
        borderTop: '1px solid rgba(122,171,130,0.12)',
        padding: '20px 24px',
        textAlign: 'center',
        fontSize: '0.78rem',
        color: 'rgba(212,230,202,0.35)',
      }}>
        © {new Date().getFullYear()} GreenGuard USA · Austin, TX
      </footer>
    </div>
  )
}
