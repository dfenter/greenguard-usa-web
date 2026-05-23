const { google } = require('googleapis')

function getAuth() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_ANALYTICS_PROPERTY_ID } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN || !GOOGLE_ANALYTICS_PROPERTY_ID) return null

  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
  return { auth, propertyId: GOOGLE_ANALYTICS_PROPERTY_ID }
}

function parseMetric(row, idx) {
  return parseFloat(row?.metricValues?.[idx]?.value || '0')
}
function parseDim(row, idx) {
  return row?.dimensionValues?.[idx]?.value || ''
}

async function getTrafficOverview() {
  const ga = getAuth()
  if (!ga) return null

  const analytics = google.analyticsdata({ version: 'v1beta', auth: ga.auth })
  const prop = `properties/${ga.propertyId}`

  const [overviewResp, dailyResp, sourcesResp, pagesResp] = await Promise.all([
    analytics.properties.runReport({
      property: prop,
      requestBody: {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
      },
    }),
    analytics.properties.runReport({
      property: prop,
      requestBody: {
        dateRanges: [{ startDate: '29daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      },
    }),
    analytics.properties.runReport({
      property: prop,
      requestBody: {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 8,
      },
    }),
    analytics.properties.runReport({
      property: prop,
      requestBody: {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'pageTitle' }, { name: 'pagePath' }],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'averageSessionDuration' },
        ],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      },
    }),
  ])

  const r0 = overviewResp.data.rows?.[0] || {}
  const overview = {
    sessions:    { value: Math.round(parseMetric(r0, 0)) },
    users:       { value: Math.round(parseMetric(r0, 1)) },
    pageviews:   { value: Math.round(parseMetric(r0, 2)) },
    bounceRate:  { value: (parseMetric(r0, 3) * 100).toFixed(1) },
    avgDuration: { value: Math.round(parseMetric(r0, 4)) },
  }

  const daily = (dailyResp.data.rows || []).map((row) => {
    const d = parseDim(row, 0)
    return { date: `${d.slice(4, 6)}/${d.slice(6, 8)}`, sessions: Math.round(parseMetric(row, 0)), users: Math.round(parseMetric(row, 1)) }
  })

  const totalSessions = (sourcesResp.data.rows || []).reduce((s, r) => s + parseMetric(r, 0), 0)
  const sources = (sourcesResp.data.rows || []).map((row) => ({
    channel: parseDim(row, 0) || 'Other',
    sessions: Math.round(parseMetric(row, 0)),
    pct: totalSessions > 0 ? Math.round((parseMetric(row, 0) / totalSessions) * 100) : 0,
  }))

  const pages = (pagesResp.data.rows || []).map((row) => ({
    title: parseDim(row, 0).replace(/ \| GreenGuard( USA)?/g, ''),
    path: parseDim(row, 1),
    views: Math.round(parseMetric(row, 0)),
    avgTime: Math.round(parseMetric(row, 1)),
    bounceRate: '—',
    exitRate: '—',
  }))

  return { overview, daily, sources, pages }
}

module.exports = { getTrafficOverview }
