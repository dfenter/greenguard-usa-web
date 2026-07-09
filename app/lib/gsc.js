// Google Search Console — site search performance
const { google } = require('googleapis')

function getAuth() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GSC_REFRESH_TOKEN } = process.env
  // Prefer the dedicated Search-Console-scoped token (GSC_REFRESH_TOKEN, minted
  // via scripts/mint-gsc-token.js). The shared GOOGLE_REFRESH_TOKEN never had
  // webmasters scope, which left this module silently returning null.
  const token = GSC_REFRESH_TOKEN || GOOGLE_REFRESH_TOKEN
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !token) return null
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: token })
  return auth
}

const SITE = 'https://www.greenguard-usa.com/'

async function getSearchPerformance(days = 28) {
  const auth = getAuth()
  if (!auth) return null
  try {
    const sc = google.searchconsole({ version: 'v1', auth })
    const endDate = new Date().toISOString().slice(0, 10)
    const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

    const [overview, topQueries, topPages] = await Promise.all([
      sc.searchanalytics.query({ siteUrl: SITE, requestBody: {
        startDate, endDate, dimensions: [],
      }}),
      sc.searchanalytics.query({ siteUrl: SITE, requestBody: {
        startDate, endDate, dimensions: ['query'], rowLimit: 10,
        orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
      }}),
      sc.searchanalytics.query({ siteUrl: SITE, requestBody: {
        startDate, endDate, dimensions: ['page'], rowLimit: 10,
        orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
      }}),
    ])

    const totals = overview.data.rows?.[0] || {}
    return {
      clicks: Math.round(totals.clicks || 0),
      impressions: Math.round(totals.impressions || 0),
      ctr: ((totals.ctr || 0) * 100).toFixed(1),
      position: (totals.position || 0).toFixed(1),
      topQueries: (topQueries.data.rows || []).map(r => ({
        query: r.keys[0],
        clicks: Math.round(r.clicks),
        impressions: Math.round(r.impressions),
        position: r.position.toFixed(1),
      })),
      topPages: (topPages.data.rows || []).map(r => ({
        page: r.keys[0].replace(SITE, '/'),
        clicks: Math.round(r.clicks),
        impressions: Math.round(r.impressions),
      })),
    }
  } catch (e) {
    if (e.message?.includes('403') || e.message?.includes('scope')) return null
    throw e
  }
}

module.exports = { getSearchPerformance }
