module.exports = {
  id:        'poolpro',
  name:      'PoolPro Services',
  nameShort: 'PoolPro',
  nameParts: { before: 'Pool', accent: 'Pro', after: ' Services' },
  tagline:   'Resort-Quality · Every Week',

  phone:     '',           // TODO: set before launch
  phoneTel:  '',
  email:     'admin@poolpro-austin.com',   // TODO: set before launch
  city:      'Austin, TX',
  website:   'https://poolpro-austin.com', // TODO: set before launch
  calSlug:   'poolpro',
  assessmentSlug: 'free-water-analysis',

  taxRate:   8.25,

  ownerEmail: 'admin@poolpro-austin.com',
  calendarId: 'admin@poolpro-austin.com',
  alertsFrom: 'PoolPro Services Alerts <admin@poolpro-austin.com>',
  industry:   'pool-service business',
  depot: { line1: '1519 Parkway', city: 'Austin', state: 'TX', zip: '78703', lat: 30.2672, lng: -97.7431,
           full: '1519 Parkway, Austin, TX 78703' },
  taxRateDecimal: 0.0825,
  taxLabel:  'Austin, TX',

  colors: {
    bg:          '#06111f',
    bgDeep:      '#030a14',
    bgCard:      'rgba(8,20,38,0.95)',
    bgAlt:       '#040e1a',
    border:      'rgba(90,140,200,0.18)',
    borderGold:  'rgba(200,168,90,0.4)',
    accent:      '#4d9de0',
    accentMuted: '#2e6fa8',
    gold:        '#c8a45a',
    text:        '#ddeeff',
    textMuted:   'rgba(221,238,255,0.58)',
    textDim:     'rgba(221,238,255,0.32)',
    themeColor:  '#06111f',
    ok:           '#0f7a35',
    danger:       '#b3261e',
    info:         '#0b57d0',
    warn:         '#9a4a00',
    textOnAccent: '#102015',
  },

  pwa: { appTitle: 'PoolPro', manifest: '/manifest.json' },

  systemLabels: {
    'Saltwater':   'Salt Water System',
    'Chlorine':    'Chlorine System',
    'Cartridge':   'Cartridge Filter',
    'DE-Filter':   'D.E. Filter',
    'Sand-Filter': 'Sand Filter',
  },

  systemImages: {
    'Saltwater':   '/images/pool-salt.webp',
    'Chlorine':    '/images/pool-chlorine.webp',
    'default':     '/images/pool-default.webp',
  },

  bookingTag: 'PoolPro Services',

  gemini: {
    companyDescription: 'PoolPro Services, an Austin-based residential pool care company',
    signOff:   'PoolPro Services',
    techLabel: 'your PoolPro technician',
  },
}
