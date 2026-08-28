module.exports = {
  id:        'lawnpro',
  name:      'LawnPro Services',
  nameShort: 'LawnPro',
  nameParts: { before: 'Lawn', accent: 'Pro', after: ' Services' },
  tagline:   'Perfect Lawn · Every Visit',

  phone:     '512-555-0100',   // placeholder demo tenant
  phoneTel:  '+15125550100',
  email:     'admin@lawnpro-austin.com',
  city:      'Austin, TX',
  website:   'https://lawnpro-austin.com',
  calSlug:   'lawnpro',
  assessmentSlug: 'lawn-assessment',

  taxRate:   8.25,

  ownerEmail: 'admin@lawnpro-austin.com',
  calendarId: 'admin@lawnpro-austin.com',
  alertsFrom: 'LawnPro Alerts <admin@lawnpro-austin.com>',
  industry:   'lawn-care business',
  depot: { line1: '1519 Parkway', city: 'Austin', state: 'TX', zip: '78703', lat: 30.2672, lng: -97.7431,
           full: '1519 Parkway, Austin, TX 78703' },
  taxRateDecimal: 0.0825,
  taxLabel:  'Austin, TX',

  colors: {
    bg:          '#0f1f0d',
    bgDeep:      '#081508',
    bgCard:      'rgba(15,31,13,0.9)',
    bgAlt:       '#0b1a09',
    border:      'rgba(92,184,92,0.2)',
    borderGold:  'rgba(232,180,74,0.35)',
    accent:      '#6ddd3a',
    accentMuted: '#4a8c35',
    gold:        '#e8b44a',
    text:        '#d4ecca',
    textMuted:   'rgba(212,236,202,0.6)',
    textDim:     'rgba(212,236,202,0.35)',
    themeColor:  '#0f1f0d',
    ok:           '#0f7a35',
    danger:       '#b3261e',
    info:         '#0b57d0',
    warn:         '#9a4a00',
    textOnAccent: '#102015',
  },

  pwa: { appTitle: 'LawnPro', manifest: '/manifest.json' },

  systemLabels: {
    'Push-Mower':   'Push Mower',
    'Riding-Mower': 'Riding Mower',
    'Zero-Turn':    'Zero-Turn Mower',
  },

  systemImages: {
    'Zero-Turn':    '/images/lawn-zeroturn.webp',
    'default':      '/images/lawn-default.webp',
  },

  bookingTag: 'LawnPro Services',

  gemini: {
    companyDescription: 'LawnPro Services, an Austin-based residential lawn care and landscaping company',
    signOff:   'LawnPro Services',
    techLabel: 'your LawnPro technician',
  },
}
