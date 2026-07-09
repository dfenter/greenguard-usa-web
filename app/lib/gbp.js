// Google Business Profile — reviews, posts, insights
const { google } = require('googleapis')

function getAuth() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
  return auth
}

async function getToken() {
  const auth = getAuth()
  if (!auth) return null
  const { token } = await auth.getAccessToken()
  return token
}

async function getAccounts() {
  const token = await getToken()
  if (!token) return []
  const res = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  return data.accounts || []
}

async function getLocations(accountName) {
  const token = await getToken()
  if (!token) return []
  const res = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=name,title,phoneNumbers,websiteUri`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  return data.locations || []
}

// v4 reviews requires the composite accounts/{a}/locations/{l} name. The v1
// business-information API returns bare `locations/{l}` names, so prefix with
// the (first) account when needed — passing a bare name used to 404 as HTML.
async function _fullLocationName(locationName) {
  if (locationName.startsWith('accounts/')) return locationName
  const accounts = await getAccounts()
  const acct = accounts[0] && accounts[0].name
  return acct ? `${acct}/${locationName}` : locationName
}

async function getReviews(locationName, limit = 10) {
  const token = await getToken()
  if (!token) return []
  const full = await _fullLocationName(locationName)
  const res = await fetch(`https://mybusiness.googleapis.com/v4/${full}/reviews?pageSize=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return []
  const data = await res.json().catch(() => ({}))
  return data.reviews || []
}

async function replyToReview(reviewName, comment) {
  const token = await getToken()
  if (!token) throw new Error('No auth token')
  const res = await fetch(`https://mybusiness.googleapis.com/v4/${reviewName}/reply`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  })
  return res.ok
}

async function createPost(locationName, summary, callToActionUrl = null) {
  const token = await getToken()
  if (!token) throw new Error('No auth token')
  const body = {
    languageCode: 'en-US',
    summary,
    topicType: 'STANDARD',
    ...(callToActionUrl && { callToAction: { actionType: 'LEARN_MORE', url: callToActionUrl } }),
  }
  const res = await fetch(`https://mybusiness.googleapis.com/v4/${locationName}/localPosts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function getInsights(locationName, days = 28) {
  const token = await getToken()
  if (!token) return null
  // Multi-metric requests must use :fetchMultiDailyMetricsTimeSeries with a
  // REPEATED dailyMetrics param (the old single-metric endpoint with a
  // comma-joined list silently failed → dashboard showed null).
  const loc = locationName.startsWith('accounts/') ? locationName.split('/').slice(2).join('/') : locationName
  const end = new Date(), start = new Date(Date.now() - days * 86400000)
  const qs = new URLSearchParams({
    'dailyRange.startDate.year': String(start.getFullYear()),
    'dailyRange.startDate.month': String(start.getMonth() + 1),
    'dailyRange.startDate.day': String(start.getDate()),
    'dailyRange.endDate.year': String(end.getFullYear()),
    'dailyRange.endDate.month': String(end.getMonth() + 1),
    'dailyRange.endDate.day': String(end.getDate()),
  })
  for (const m of ['BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
                   'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
                   'CALL_CLICKS', 'WEBSITE_CLICKS', 'BUSINESS_DIRECTION_REQUESTS'])
    qs.append('dailyMetrics', m)
  const res = await fetch(`https://businessprofileperformance.googleapis.com/v1/${loc}:fetchMultiDailyMetricsTimeSeries?${qs}`,
    { headers: { Authorization: `Bearer ${token}` } })
  return res.ok ? res.json() : null
}

module.exports = { getAccounts, getLocations, getReviews, replyToReview, createPost, getInsights }
