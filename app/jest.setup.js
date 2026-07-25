process.env.JWT_SECRET = 'test-secret-for-jest-that-is-exactly-32ch'
process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder'
process.env.CALCOM_WEBHOOK_SECRET = 'test-calcom-secret'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'

// No test may reach a live outbound channel. next/jest loads app/.env, so the
// real Resend/Gmail/Twilio/KV credentials are present in the jest environment
// unless we strip them here. On 2026-07-25 an unmocked lib/email in
// stripe-webhook.test.js used those credentials to send five real welcome
// emails per run to the fixture address bob@example.com, bouncing each one
// back into the admin inbox. Removing the credentials makes a forgotten
// jest.mock() fail loudly inside the test instead of putting mail on the wire.
for (const key of [
  'RESEND_API_KEY',
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
  // Without these, notify-queue.sendLocalFirst skips the shared production
  // queue entirely rather than enqueuing test jobs the live Mac daemon would
  // pick up and actually send.
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
]) {
  delete process.env[key]
}
