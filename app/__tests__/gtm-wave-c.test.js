// Wave C: shared page components + OPS UI. Since this repo's jest config
// runs in a plain node environment (no DOM / testing-library), these tests
// verify behavior at the level the rest of the GTM test suite already
// uses: pure logic (gtm-products helpers) plus source-shape assertions on
// the shared components proving each one threads `product` through every
// fetch/content lookup rather than hardcoding sparkbridge.
const fs = require('fs')
const path = require('path')
const { PRODUCTS, scoreFieldsFor, tierFor } = require('../lib/gtm-products')

function readComponent(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'components', 'gtm', 'pages', name), 'utf8')
}

function readPage(...segments) {
  return fs.readFileSync(path.join(__dirname, '..', 'pages', 'gtm', ...segments), 'utf8')
}

describe('GtmLayout: product-driven nav + switcher', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'components', 'gtm', 'GtmLayout.js'), 'utf8')

  test('accepts a product prop defaulting to sparkbridge', () => {
    expect(src).toMatch(/product\s*=\s*DEFAULT_PRODUCT/)
  })

  test('renders a switcher linking /gtm and /gtm/ops', () => {
    expect(src).toMatch(/href:\s*'\/gtm'/)
    expect(src).toMatch(/href:\s*'\/gtm\/ops'/)
    expect(src).toMatch(/One Person Show/)
    expect(src).not.toMatch(/One Man Show/)
  })

  test('persists the product choice to localStorage', () => {
    expect(src).toMatch(/localStorage\.setItem/)
  })

  test('ops nav is sourced from PRODUCTS.ops.nav, not a hardcoded list', () => {
    expect(src).toMatch(/PRODUCTS\[product\]\?\.nav/)
  })
})

describe('shared page components thread `product` through fetch and content calls', () => {
  test('GtmDashboardPage defaults product and calls product-scoped APIs', () => {
    const src = readComponent('GtmDashboardPage.js')
    expect(src).toMatch(/product\s*=\s*DEFAULT_PRODUCT/)
    expect(src).toMatch(/\/api\/gtm\/settings\?product=\$\{product\}/)
    expect(src).toMatch(/\/api\/gtm\/progress\?product=\$\{product\}/)
    expect(src).toMatch(/\/api\/gtm\/kpis\?product=\$\{product\}/)
  })

  test('GtmTargetsPage uses scoreFieldsFor/tierFor from product config, not a hardcoded array', () => {
    const src = readComponent('GtmTargetsPage.js')
    expect(src).toMatch(/scoreFieldsFor\(product\)/)
    expect(src).toMatch(/tierFor\(product,/)
    expect(src).not.toMatch(/const SCORE_FIELDS = \[/)
    expect(src).toMatch(/\/api\/gtm\/targets\?product=\$\{product\}/)
  })

  test('GtmTargetDetailPage scopes touches/call-reports/deals fetches by product', () => {
    const src = readComponent('GtmTargetDetailPage.js')
    expect(src).toMatch(/touches\?firm=.*&product=\$\{product\}/)
    expect(src).toMatch(/call-reports\?firm=.*&product=\$\{product\}/)
    expect(src).toMatch(/deals\?firm=.*&product=\$\{product\}/)
  })

  test('GtmDiscoveryPage includes an OPS-only baseline metrics form', () => {
    const src = readComponent('GtmDiscoveryPage.js')
    expect(src).toMatch(/isOps/)
    expect(src).toMatch(/office_hours_per_week/)
    expect(src).toMatch(/quote_turnaround/)
    expect(src).toMatch(/close_rate/)
    expect(src).toMatch(/days_to_paid/)
    expect(src).toMatch(/reminder_coverage/)
    expect(src).toMatch(/missed_visits_per_month/)
    expect(src).toMatch(/active_accounts/)
    expect(src).toMatch(/kind:\s*'baseline'/)
  })

  test('OPS-facing copy in shared components is trade-neutral', () => {
    for (const name of fs.readdirSync(path.join(__dirname, '..', 'components', 'gtm', 'pages'))) {
      const src = readComponent(name)
      expect(src.toLowerCase()).not.toMatch(/\bco2\b/)
      expect(src.toLowerCase()).not.toMatch(/\btank(s)?\b/)
      expect(src.toLowerCase()).not.toMatch(/\btrap(s)?\b/)
      expect(src.toLowerCase()).not.toMatch(/mosquito/)
    }
  })

  test('no em dashes in any shared page component', () => {
    for (const name of fs.readdirSync(path.join(__dirname, '..', 'components', 'gtm', 'pages'))) {
      expect(readComponent(name)).not.toMatch(/—/)
    }
  })
})

describe('sparkbridge pages are thin wrappers around the shared components, product="sparkbridge"', () => {
  const cases = [
    ['index.js', 'GtmDashboardPage'],
    ['plan.js', 'GtmPlanPage'],
    ['timeline.js', 'GtmTimelinePage'],
    ['targets.js', 'GtmTargetsPage'],
    ['outreach.js', 'GtmOutreachPage'],
    ['discovery.js', 'GtmDiscoveryPage'],
    ['objections.js', 'GtmObjectionsPage'],
    ['competitive.js', 'GtmCompetitivePage'],
    ['reports.js', 'GtmReportsPage'],
    ['internal.js', 'GtmInternalPage'],
  ]

  test.each(cases)('%s renders %s with product="sparkbridge"', (file, component) => {
    const src = readPage(file)
    expect(src).toMatch(new RegExp(component))
    expect(src).toMatch(/product="sparkbridge"/)
  })

  test('targets/[slug].js renders GtmTargetDetailPage with product="sparkbridge"', () => {
    const src = readPage('targets', '[slug].js')
    expect(src).toMatch(/GtmTargetDetailPage/)
    expect(src).toMatch(/product="sparkbridge"/)
  })
})

describe('OPS pages exist for every route in PRODUCTS.ops.nav and render with product="ops"', () => {
  const navPaths = PRODUCTS.ops.nav.map((n) => n.href)

  test('PRODUCTS.ops.nav covers the routes Wave C was asked to build', () => {
    expect(navPaths).toEqual(expect.arrayContaining([
      '/gtm/ops',
      '/gtm/ops/plan',
      '/gtm/ops/timeline',
      '/gtm/ops/targets',
      '/gtm/ops/outreach',
      '/gtm/ops/discovery',
      '/gtm/ops/objections',
      '/gtm/ops/competitive',
      '/gtm/ops/reports',
      '/gtm/ops/program',
      '/gtm/ops/positioning',
      '/gtm/ops/internal',
    ]))
  })

  const cases = [
    ['index.js', 'GtmDashboardPage'],
    ['plan.js', 'GtmPlanPage'],
    ['timeline.js', 'GtmTimelinePage'],
    ['targets.js', 'GtmTargetsPage'],
    ['outreach.js', 'GtmOutreachPage'],
    ['discovery.js', 'GtmDiscoveryPage'],
    ['objections.js', 'GtmObjectionsPage'],
    ['competitive.js', 'GtmCompetitivePage'],
    ['reports.js', 'GtmReportsPage'],
    ['program.js', 'GtmProgramPage'],
    ['positioning.js', 'GtmPositioningPage'],
    ['internal.js', 'GtmInternalPage'],
  ]

  test.each(cases)('gtm/ops/%s renders %s with product="ops"', (file, component) => {
    const src = readPage('ops', file)
    expect(src).toMatch(new RegExp(component))
    expect(src).toMatch(/product="ops"/)
  })

  test('gtm/ops/targets/[slug].js renders GtmTargetDetailPage with product="ops"', () => {
    const src = readPage('ops', 'targets', '[slug].js')
    expect(src).toMatch(/GtmTargetDetailPage/)
    expect(src).toMatch(/product="ops"/)
  })
})

describe('targets scoring uses per-product fields (regression for the sparkbridge/ops split)', () => {
  test('sparkbridge and ops score fields differ', () => {
    expect(scoreFieldsFor('sparkbridge')).not.toEqual(scoreFieldsFor('ops'))
  })

  test('tierFor uses each product\'s own thresholds', () => {
    expect(tierFor('sparkbridge', 25)).toBe('A')
    expect(tierFor('ops', 25)).toBe('A')
    expect(tierFor('sparkbridge', 18)).toBe('B')
    expect(tierFor('ops', 17)).toBe('C')
  })
})

describe('/gtm dashboard summarizes OPS', () => {
  test('index.js dashboard component links through to /gtm/ops', () => {
    const src = readComponent('GtmDashboardPage.js')
    expect(src).toMatch(/href="\/gtm\/ops"/)
  })
})
