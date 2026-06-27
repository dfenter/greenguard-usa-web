import { CustomerMap } from 'greenguard-portal'

const SAMPLE_CUSTOMERS = [
  {
    id: 'c1',
    name: 'Sarah Johnson',
    email: 'sarah@example.com',
    address: '4821 Shoal Creek Blvd, Austin, TX 78756',
    lat: 30.3344,
    lng: -97.7431,
    status: 'active',
    plan: 'CO₂ Trap Monthly',
  },
  {
    id: 'c2',
    name: 'Mike Torres',
    email: 'mike@example.com',
    address: '1103 Barton Hills Dr, Austin, TX 78704',
    lat: 30.2449,
    lng: -97.7714,
    status: 'active',
    plan: 'CO₂ Trap Monthly',
  },
  {
    id: 'c3',
    name: 'Linda Okafor',
    email: 'linda@example.com',
    address: '2108 Manor Rd, Austin, TX 78722',
    lat: 30.2706,
    lng: -97.7131,
    status: 'past_due',
    plan: 'CO₂ Trap Monthly',
  },
]

// Dark background wrapper makes the no-key placeholder visible against brand dark theme
const DARK_WRAP = { background: '#0d1a10', borderRadius: 12, padding: 16 }

// No API key — shows graceful fallback placeholder
export function NoKey() {
  return (
    <div style={DARK_WRAP}>
      <CustomerMap customers={SAMPLE_CUSTOMERS} height={360} />
    </div>
  )
}

// Compact mode — shorter height for sidebar use
export function CompactNoKey() {
  return (
    <div style={DARK_WRAP}>
      <CustomerMap customers={SAMPLE_CUSTOMERS} height={220} compact={true} />
    </div>
  )
}

// Empty customer list
export function EmptyList() {
  return (
    <div style={DARK_WRAP}>
      <CustomerMap customers={[]} height={300} />
    </div>
  )
}
