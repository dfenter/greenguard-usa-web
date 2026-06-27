import { PortalLayout } from 'greenguard-portal'

// Technician view — standard nav for field tech
export function TechnicianNav() {
  return (
    <PortalLayout title="Today's Route" isAdmin={false} logoHref="/">
      <div style={{ padding: '24px 20px', color: 'var(--text)' }}>
        <h2 style={{ margin: '0 0 8px', color: 'var(--green)', fontSize: '1.1rem', fontWeight: 700 }}>Page content area</h2>
        <p style={{ margin: 0, opacity: 0.6, fontSize: '0.9rem' }}>Route cards and stop list appear here.</p>
      </div>
    </PortalLayout>
  )
}

// Admin view — nav shows extra admin links and the bottom dock
export function AdminNav() {
  return (
    <PortalLayout title="Admin Dashboard" isAdmin={true} logoHref="/">
      <div style={{ padding: '24px 20px', color: 'var(--text)' }}>
        <h2 style={{ margin: '0 0 8px', color: 'var(--green)', fontSize: '1.1rem', fontWeight: 700 }}>Admin content area</h2>
        <p style={{ margin: 0, opacity: 0.6, fontSize: '0.9rem' }}>Customer list, route plan, analytics appear here.</p>
      </div>
    </PortalLayout>
  )
}

// Custom top padding — for pages that need offset below a sticky header
export function WithTopPadding() {
  return (
    <PortalLayout title="Rounds" isAdmin={false} topPadding={80} logoHref="/">
      <div style={{ padding: '24px 20px', color: 'var(--text)' }}>
        <p style={{ margin: 0, opacity: 0.6, fontSize: '0.9rem' }}>Content pushed down 80px from top.</p>
      </div>
    </PortalLayout>
  )
}
