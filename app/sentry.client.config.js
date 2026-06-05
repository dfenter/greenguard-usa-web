import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,

  beforeSend(event, hint) {
    const msg = hint?.originalException?.message || event?.exception?.values?.[0]?.value || ''

    // GTM/GA4 loads the legacy gapi client.js internally on some pages.
    // When it fails (network, CSP, cold-start) Sentry captures it as an app
    // crash even though it's a third-party script. Filter it out.
    if (msg.includes('Jsloader error') && msg.includes('apis.google.com')) return null

    // Generic script load failures from third-party tags — not actionable
    if (msg.includes('Error while loading script') && !msg.includes('portal.greenguard')) return null

    return event
  },
})
