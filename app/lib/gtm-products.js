// Product dimension for the GTM portal. SparkBridge is the original/default
// product and its config here is copied EXACTLY from prior hardcoded values
// so its behavior is unchanged when no product is specified. "ops" (One
// Person Show) is a second product coexisting alongside it.
const DEFAULT_PRODUCT = 'sparkbridge'

const PRODUCTS = {
  sparkbridge: {
    key: 'sparkbridge',
    label: 'SparkBridge',
    bundleDir: '/Users/lucille/Github/SparkBridge/docs/gtm/mba-handoff',
    sheetId: '1-Fm2-s7BJkM6HGokTDFOHnVUw4I0mbW-YqkYiuvywBI',
    scoreFields: [
      ['s1', 'Ignition practice'],
      ['s2', 'Multi-site'],
      ['s3', 'MQTT'],
      ['s4', 'Vertical fit'],
      ['s5', 'Enterprise'],
      ['s6', 'Pain'],
      ['s7', 'Sophistication'],
    ],
    tierThresholds: { a: 25, b: 18 },
    kpis: ['targetsApproved', 'firstTouches', 'replies', 'calls', 'reviews', 'partners', 'pilots'],
    hubspot: {
      pipelineLabel: 'SparkBridge Partners',
      pipelineId: null,
    },
    nav: [
      { href: '/gtm', label: 'Dashboard' },
      { href: '/gtm/plan', label: 'Plan' },
      { href: '/gtm/timeline', label: 'Timeline' },
      { href: '/gtm/targets', label: 'Targets' },
      { href: '/gtm/outreach', label: 'Outreach' },
      { href: '/gtm/discovery', label: 'Discovery' },
      { href: '/gtm/objections', label: 'Objections' },
      { href: '/gtm/competitive', label: 'Competitive' },
      { href: '/gtm/reports', label: 'Reports' },
      { href: '/gtm/program', label: 'Program' },
      { href: '/gtm/positioning', label: 'Positioning' },
      { href: '/gtm/internal', label: 'Internal' },
    ],
  },
  ops: {
    key: 'ops',
    label: 'One Person Show',
    bundleDir: '/Users/lucille/Documents/GreenGuard/company-run-by-claude/gtm',
    sheetId: '19e0zoteFXw_wNo9GKXW5eoQ6-m4OFntNWU6ZrFA385A',
    scoreFields: [
      ['s1', 'Recurring cadence'],
      ['s2', 'Google/Stripe fit'],
      ['s3', 'Size band'],
      ['s4', 'Office pain'],
      ['s5', 'Owner-operated'],
      ['s6', 'Review volume'],
      ['s7', 'Reachability'],
    ],
    tierThresholds: { a: 25, b: 18 },
    kpis: ['targetsApproved', 'firstTouches', 'replies', 'calls', 'reviews', 'partners', 'pilots'],
    hubspot: {
      pipelineLabel: 'OPS Operators',
      pipelineId: null,
    },
    nav: [
      { href: '/gtm/ops', label: 'Dashboard' },
      { href: '/gtm/ops/plan', label: 'Plan' },
      { href: '/gtm/ops/timeline', label: 'Timeline' },
      { href: '/gtm/ops/targets', label: 'Targets' },
      { href: '/gtm/ops/outreach', label: 'Outreach' },
      { href: '/gtm/ops/discovery', label: 'Discovery' },
      { href: '/gtm/ops/objections', label: 'Objections' },
      { href: '/gtm/ops/competitive', label: 'Competitive' },
      { href: '/gtm/ops/reports', label: 'Reports' },
      { href: '/gtm/ops/program', label: 'Program' },
      { href: '/gtm/ops/positioning', label: 'Positioning' },
      { href: '/gtm/ops/internal', label: 'Internal' },
    ],
  },
}

function isValidProduct(p) {
  return typeof p === 'string' && Object.prototype.hasOwnProperty.call(PRODUCTS, p)
}

// Accepts either a string, or a request-like object with query/body.product.
// Never throws. Unknown/missing/malformed input falls back to the default.
function resolveProduct(reqOrString) {
  try {
    let candidate = null
    if (typeof reqOrString === 'string') {
      candidate = reqOrString
    } else if (reqOrString && typeof reqOrString === 'object') {
      candidate = (reqOrString.query && reqOrString.query.product) || (reqOrString.body && reqOrString.body.product) || null
    }
    if (isValidProduct(candidate)) return candidate
    return DEFAULT_PRODUCT
  } catch {
    return DEFAULT_PRODUCT
  }
}

function tierFor(product, total) {
  const key = isValidProduct(product) ? product : DEFAULT_PRODUCT
  const { a, b } = PRODUCTS[key].tierThresholds
  if (total >= a) return 'A'
  if (total >= b) return 'B'
  return 'C'
}

function scoreFieldsFor(product) {
  const key = isValidProduct(product) ? product : DEFAULT_PRODUCT
  return PRODUCTS[key].scoreFields
}

module.exports = {
  PRODUCTS,
  DEFAULT_PRODUCT,
  isValidProduct,
  resolveProduct,
  tierFor,
  scoreFieldsFor,
}
