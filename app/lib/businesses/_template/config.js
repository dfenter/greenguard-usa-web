// Starter tenant config for OPS (One Person Show). Copy this directory to
// app/lib/businesses/<your-id>/ (or run `ops init <id>`) and fill in every
// placeholder below. Fields mirror app/lib/businesses/greenguard/config.js —
// keep the same keys/shape so the rest of the app keeps working.
//
// Identity/policy fields here can also be overridden by a sibling
// business.yaml file (see business.yaml.example) — YAML wins over this file
// at runtime, which is handy for `ops init` and non-developer edits.
module.exports = {
  id:        '_template',              // must match the directory name under lib/businesses/
  name:      'Acme Home Services',      // full display name
  nameShort: 'Acme',                    // short brand name used in tight UI / SMS
  nameParts: { before: 'Ac', accent: 'me', after: ' Home Services' }, // for styled brand headers (accent color split)
  tagline:   'Your Tagline Here',

  phone:     '512-555-0100',            // human-readable phone
  phoneTel:  '+15125550100',            // tel: link format (E.164)
  email:     'admin@acme-example.com',  // primary business inbox
  city:      'Austin, TX',
  website:   'https://acme-example.com',
  calSlug:   'acme',                    // Cal.com team/user slug
  assessmentSlug: 'free-assessment',    // Cal.com event-type slug for the free-look/assessment booking

  taxRate:   8.25,                      // display percent (e.g. shown as "8.25%")

  // ── v0.2 tenant fields (One Person Show) ────────────────────────────────
  ownerEmail: 'admin@acme-example.com', // owner login + default ADMIN_EMAIL fallback
  calendarId: 'admin@acme-example.com', // Google Calendar id (source of truth for appointments)
  alertsFrom: 'Acme Alerts <admin@acme-example.com>',
  industry:   'home services business', // used in AI prompts ("a <industry> in <city>")
  depot: {                              // your dispatch origin point, used for routing
    line1: '123 Main St', city: 'Austin', state: 'TX', zip: '78701', lat: 30.2672, lng: -97.7431,
    full: '123 Main St, Austin, TX 78701',
  },
  taxRateDecimal: 0.0825,               // same rate as taxRate, expressed as a decimal (used in math)
  taxLabel:  'Austin, TX',              // shown near tax line items

  colors: {                             // brand palette used across the portal UI
    bg:           '#f5f5f7',
    bgDeep:       '#ffffff',
    bgCard:       '#ffffff',
    bgAlt:        '#eef2ef',
    border:       'rgba(27,94,32,0.65)',
    borderGold:   'rgba(120,88,0,0.60)',
    accent:       '#1b5e20',
    accentMuted:  '#3f6e47',
    gold:         '#785800',
    text:         '#111111',
    textMuted:    'rgba(17,17,17,0.78)',
    textDim:      'rgba(17,17,17,0.62)',
    themeColor:   '#f5f5f7',
    ok:           '#0f7a35',
    danger:       '#b3261e',
    info:         '#0b57d0',
    warn:         '#9a4a00',
    textOnAccent: '#ffffff',
  },

  pwa: { appTitle: 'Acme', manifest: '/manifest.json' },

  // HubSpot system_type → customer-facing display label. Replace with your
  // own equipment/system categories, or leave a single generic entry.
  systemLabels: {
    'Standard-Service': 'Standard Service',
  },

  // HubSpot system_type + trapCount(-like key) → product image path
  systemImages: {
    'Standard-Service': '/images/placeholder.webp',
    'default':          '/images/placeholder.webp',
  },

  reviewUrl: 'https://g.page/r/REPLACE_ME/review', // Google review short link

  bookingTag: 'Acme Home Services',     // stamped in Cal.com event summaries — used to filter/parse GCal events

  gemini: {                             // used to steer AI-generated customer copy
    companyDescription: 'Acme Home Services, an Austin-based home services company',
    signOff:   'Acme Home Services',
    techLabel: 'your Acme technician',
  },
}
