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

async function getReviews(locationName, limit = 10) {
  const token = await getToken()
  if (!token) return []
  const res = await fetch(`https://mybusiness.googleapis.com/v4/${locationName}/reviews?pageSize=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
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
  const endTime = new Date().toISOString()
  const startTime = new Date(Date.now() - days * 86400000).toISOString()
  const res = await fetch('https://businessprofileperformance.googleapis.com/v1/' + locationName + ':getDailyMetricsTimeSeries?' + new URLSearchParams({
    'dailyMetric': ['BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 'BUSINESS_IMPRESSIONS_MOBILE_MAPS', 'CALL_CLICKS', 'WEBSITE_CLICKS', 'DIRECTION_REQUESTS'].join(','),
    'dailyRange.startDate.year': startTime.slice(0, 4),
    'dailyRange.startDate.month': startTime.slice(5, 7),
    'dailyRange.startDate.day': startTime.slice(8, 10),
    'dailyRange.endDate.year': endTime.slice(0, 4),
    'dailyRange.endDate.month': endTime.slice(5, 7),
    'dailyRange.endDate.day': endTime.slice(8, 10),
  }), { headers: { Authorization: `Bearer ${token}` } })
  return res.ok ? res.json() : null
}

module.exports = { getAccounts, getLocations, getReviews, replyToReview, createPost, getInsights }
