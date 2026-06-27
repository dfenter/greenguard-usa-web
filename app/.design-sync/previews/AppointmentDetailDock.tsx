import { AppointmentDetailDock } from 'greenguard-portal'

// Component expects event.start as a plain ISO string, not { dateTime: '...' }
const SAMPLE_DETAILS = {
  email: 'sarah@example.com',
  event: {
    id: 'gcal_evt_001',
    summary: 'Sarah Johnson: Biogents CO₂ Trap (GreenGuard USA)',
    location: '4821 Shoal Creek Blvd, Austin, TX 78756',
    description: 'Gate code: 4821. Mosquitoes worst near back patio.',
    start: '2026-06-18T10:00:00-05:00',
    end: '2026-06-18T10:30:00-05:00',
  },
  contact: {
    properties: {
      firstname: 'Sarah',
      lastname: 'Johnson',
      phone: '(512) 555-0142',
      address: '4821 Shoal Creek Blvd, Austin, TX 78756',
      email: 'sarah@example.com',
    },
  },
  upcomingBookings: [
    { id: 'apt_002', start: '2026-07-16T10:00:00-05:00', summary: 'Sarah Johnson: CO₂ Trap (GreenGuard USA)' },
  ],
  pastBookings: [
    { id: 'apt_000', start: '2026-05-14T09:00:00-05:00', summary: 'Sarah Johnson: CO₂ Trap (GreenGuard USA)' },
    { id: 'apt_prev1', start: '2026-04-10T10:00:00-05:00', summary: 'Sarah Johnson: CO₂ Trap (GreenGuard USA)' },
  ],
}

// transform: translateZ(0) contains position:fixed relative to this ancestor
const PANEL_WRAP = {
  position: 'relative' as const,
  transform: 'translateZ(0)',
  height: 680,
  overflow: 'hidden',
}

// Loading skeleton
export function Loading() {
  return (
    <div style={PANEL_WRAP}>
      <AppointmentDetailDock loading={true} onClose={() => {}} />
    </div>
  )
}

// Full appointment data with history and notes
export function WithDetails() {
  return (
    <div style={PANEL_WRAP}>
      <AppointmentDetailDock details={SAMPLE_DETAILS} onClose={() => {}} />
    </div>
  )
}

// New customer — no appointment history
export function NewCustomer() {
  return (
    <div style={PANEL_WRAP}>
      <AppointmentDetailDock
        details={{
          ...SAMPLE_DETAILS,
          event: {
            id: 'gcal_evt_002',
            summary: 'Alex Rivera: Biogents CO₂ Trap (GreenGuard USA)',
            location: '902 W 12th St, Austin, TX 78703',
            start: '2026-06-26T09:00:00-05:00',
            end: '2026-06-26T09:30:00-05:00',
          },
          contact: {
            properties: {
              firstname: 'Alex',
              lastname: 'Rivera',
              phone: '(512) 555-0199',
              address: '902 W 12th St, Austin, TX 78703',
              email: 'alex@example.com',
            },
          },
          upcomingBookings: [],
          pastBookings: [],
        }}
        onClose={() => {}}
      />
    </div>
  )
}
