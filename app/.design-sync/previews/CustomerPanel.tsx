import { CustomerPanel } from 'greenguard-portal'

const ACTIVE_CUSTOMER = {
  id: 'cust_001',
  name: 'Sarah Johnson',
  email: 'sarah@example.com',
  phone: '(512) 555-0142',
  address: '4821 Shoal Creek Blvd, Austin, TX 78756',
  plan: 'CO₂ Trap Monthly',
  status: 'active',
  nextServiceDate: '2026-06-26',
  joinDate: '2025-03-12',
  notes: 'Back patio is worst area. Gate code: 4821.',
  stripeCustomerId: 'cus_example001',
}

const PAUSED_CUSTOMER = {
  id: 'cust_002',
  name: 'Mike Torres',
  email: 'mike@example.com',
  phone: '(512) 555-0177',
  address: '1103 Barton Hills Dr, Austin, TX 78704',
  plan: 'CO₂ Trap Monthly',
  status: 'paused',
  nextServiceDate: null,
  joinDate: '2025-07-20',
  notes: '',
  stripeCustomerId: 'cus_example002',
}

// transform: translateZ(0) contains position:fixed relative to this ancestor
const PANEL_WRAP = {
  position: 'relative' as const,
  transform: 'translateZ(0)',
  height: 720,
  overflow: 'hidden',
}

// Active customer with full details
export function ActiveCustomer() {
  return (
    <div style={PANEL_WRAP}>
      <CustomerPanel customer={ACTIVE_CUSTOMER} onClose={() => {}} />
    </div>
  )
}

// Paused account — minimal data, status badge reflects paused state
export function PausedAccount() {
  return (
    <div style={PANEL_WRAP}>
      <CustomerPanel customer={PAUSED_CUSTOMER} onClose={() => {}} />
    </div>
  )
}
