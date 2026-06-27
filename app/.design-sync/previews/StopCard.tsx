import { StopCard } from 'greenguard-portal'

const BASE_STOP = {
  customerName: 'Sarah Johnson',
  email: 'sarah@example.com',
  phone: '(512) 555-0142',
  address: '4821 Shoal Creek Blvd, Austin, TX 78756',
  serviceType: 'Biogents CO₂ Trap',
  start: '2026-06-18T10:00:00-05:00',
  end: '2026-06-18T10:30:00-05:00',
}

// Upcoming stop — not yet started
export function Pending() {
  return (
    <div style={{ padding: 16, maxWidth: 520 }}>
      <StopCard stop={BASE_STOP} number={1} />
    </div>
  )
}

// Active — tech is currently on site
export function Active() {
  return (
    <div style={{ padding: 16, maxWidth: 520 }}>
      <StopCard
        stop={BASE_STOP}
        number={2}
        active={true}
        checkIn="2026-06-18T10:03:00-05:00"
      />
    </div>
  )
}

// Done — service completed
export function Done() {
  return (
    <div style={{ padding: 16, maxWidth: 520 }}>
      <StopCard
        stop={BASE_STOP}
        number={3}
        done={true}
        checkIn="2026-06-18T10:03:00-05:00"
        checkOut="2026-06-18T10:28:00-05:00"
      />
    </div>
  )
}

// Cancelled stop
export function Cancelled() {
  return (
    <div style={{ padding: 16, maxWidth: 520 }}>
      <StopCard stop={{ ...BASE_STOP, customerName: 'Mike Torres' }} number={4} cancelled={true} />
    </div>
  )
}
