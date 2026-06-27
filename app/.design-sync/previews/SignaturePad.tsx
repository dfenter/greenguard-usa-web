import { SignaturePad } from 'greenguard-portal'

// Default — empty pad waiting for customer signature
export function Default() {
  return (
    <div style={{ padding: 16, maxWidth: 420 }}>
      <SignaturePad label="Customer signature" />
    </div>
  )
}

// Custom label for invoice acknowledgment context
export function ServiceAcknowledgment() {
  return (
    <div style={{ padding: 16, maxWidth: 420 }}>
      <SignaturePad label="Sign to acknowledge service was completed" />
    </div>
  )
}
