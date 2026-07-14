module.exports = {
  id:        'greenguard',
  name:      'GreenGuard USA',
  nameShort: 'GreenGuard USA',  // brand is always "GreenGuard USA" in customer comms/alerts, never bare "GreenGuard"
  nameParts: { before: 'Green', accent: 'Guard', after: ' USA' },
  tagline:   'Smart · Safe · Effective',

  phone:     '512-560-4129',
  phoneTel:  '+15125604129',
  email:     'admin@greenguard-usa.com',
  city:      'Austin, TX',
  website:   'https://greenguard-usa.com',
  calSlug:   'greenguard-usa',
  assessmentSlug: 'property-assessment',

  taxRate:   8.25,
  taxLabel:  'Austin, TX',

  colors: {
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
    ok:           '#176f2b',
    danger:       '#b3261e',
    info:         '#0b57d0',
    warn:         '#8a5300',
    textOnAccent: '#ffffff',
  },

  pwa: { appTitle: 'GreenGuard', manifest: '/manifest.json' },

  // HubSpot system_type → customer-facing display label
  systemLabels: {
    'Biogents-CO2':    'Biogents CO₂ Trap',
    'Biogents-NonCO2': 'Biogents (Non-CO₂)',
    'Biogents-Owned':  'Biogents (Owned)',
    'Mosqitter-Grand': 'Mosqitter Grand',
    'Mosqitter':       'Mosqitter Grand',
    'Mosqitter-Rental':'Mosqitter Grand Rental',
    'Mosqitter-Owned': 'Mosqitter Grand',
    'MQ-RENT':         'Mosqitter Grand',
    'Tank-Only':       'CO₂ Tank Only',
  },

  // HubSpot system_type + trapCount → product image path
  systemImages: {
    'Mosqitter-Grand':  '/images/trap-mosqitter.webp',
    'Mosqitter':        '/images/trap-mosqitter.webp',
    'Mosqitter-Rental': '/images/trap-mosqitter.webp',
    'Mosqitter-Owned':  '/images/trap-mosqitter.webp',
    'MQ-RENT':          '/images/trap-mosqitter.webp',
    'Biogents-NonCO2':  '/images/mosquitairenoco2.webp',
    'Biogents-CO2-1':   '/images/mosquitairesingle.jpg',
    'Biogents-CO2-2':   '/images/mosquitairedouble.webp',
    'Biogents-CO2-3':   '/images/biogentstriple.webp',
  },

  // Stamped in Cal.com event summaries — used to filter/parse GCal events
  reviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJx8wLC4K11wwRbfe7hhZiHXs',

  bookingTag: 'GreenGuard USA',

  gemini: {
    companyDescription: 'GreenGuard USA, an Austin-based pesticide-free CO₂ mosquito trap service',
    signOff:   'GreenGuard USA',
    techLabel: 'your GreenGuard technician',
  },
}
