const { withSentryConfig } = require('@sentry/nextjs')
const biz = require('./lib/business.config')

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https: https://maps.gstatic.com https://maps.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://api.stripe.com https://maps.googleapis.com https://*.sentry.io https://vitals.vercel-insights.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://www.google.com",
  "worker-src blob:",
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BIZ_NAME:     biz.name,
    NEXT_PUBLIC_BIZ_TAGLINE:  biz.tagline,
    NEXT_PUBLIC_BIZ_CITY:     biz.city,
    NEXT_PUBLIC_BIZ_PHONE:    biz.phone,
    NEXT_PUBLIC_BIZ_PHONTEL:  biz.phoneTel,
    NEXT_PUBLIC_BIZ_EMAIL:    biz.email,
    NEXT_PUBLIC_BIZ_WEBSITE:  biz.website,
    NEXT_PUBLIC_BIZ_CAL_SLUG: biz.calSlug,
    NEXT_PUBLIC_BIZ_ID:           biz.id,
    NEXT_PUBLIC_BIZ_SYSTEM_LABELS:  JSON.stringify(biz.systemLabels),
    NEXT_PUBLIC_BIZ_SYSTEM_IMAGES:  JSON.stringify(biz.systemImages),
    NEXT_PUBLIC_BIZ_REVIEW_URL:     biz.reviewUrl || '',
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',            value: 'DENY' },
          { key: 'X-Content-Type-Options',      value: 'nosniff' },
          { key: 'Referrer-Policy',             value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',          value: 'camera=(), microphone=(), geolocation=(self)' },
          { key: 'Strict-Transport-Security',   value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy',     value: CSP },
        ],
      },
    ]
  },
}

module.exports = withSentryConfig(nextConfig, {
  org: 'greenguard-usa',
  project: 'portal',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: {
    automaticVercelMonitors: true,
    treeshake: { removeDebugLogging: true },
  },
})
