/**
 * Meta Graph API — Facebook Page posts, insights, and reviews
 * Requires: META_ACCESS_TOKEN (Page Access Token), META_PAGE_ID
 *
 * Setup:
 * 1. developers.facebook.com → My Apps → Create App → Business type
 * 2. Add Facebook Login + Pages API products
 * 3. Generate a long-lived Page Access Token (never expires if refreshed annually)
 * 4. Add META_ACCESS_TOKEN + META_PAGE_ID to Vercel env vars
 */

const BASE = 'https://graph.facebook.com/v21.0'

function pageId() {
  return process.env.META_PAGE_ID || ''
}

function token() {
  return process.env.META_ACCESS_TOKEN || ''
}

async function graphGet(path, params = {}) {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('access_token', token())
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString())
  const data = await res.json()
  if (data.error) throw new Error(`Meta API: ${data.error.message}`)
  return data
}

async function graphPost(path, body = {}) {
  const url = `${BASE}${path}?access_token=${token()}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (data.error) throw new Error(`Meta API: ${data.error.message}`)
  return data
}

/** Post a text update (+ optional link) to the Facebook page */
async function postToPage({ message, link } = {}) {
  const body = { message }
  if (link) body.link = link
  return graphPost(`/${pageId()}/feed`, body)
}

/** Post a photo with caption to the Facebook page */
async function postPhotoToPage({ imageUrl, caption } = {}) {
  return graphPost(`/${pageId()}/photos`, { url: imageUrl, caption })
}

/** Get page-level insights for the last N days */
async function getPageInsights(days = 28) {
  const metrics = [
    'page_impressions',
    'page_reach',
    'page_fan_adds',
    'page_views_total',
    'page_post_engagements',
  ].join(',')

  const until = Math.floor(Date.now() / 1000)
  const since = until - days * 86400

  return graphGet(`/${pageId()}/insights`, {
    metric: metrics,
    period: 'day',
    since,
    until,
  })
}

/** Get recent posts (feed) from the page */
async function getRecentPosts(limit = 10) {
  return graphGet(`/${pageId()}/feed`, {
    fields: 'message,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true)',
    limit,
  })
}

/** Get Facebook page ratings/recommendations */
async function getPageRatings(limit = 20) {
  return graphGet(`/${pageId()}/ratings`, {
    fields: 'reviewer,rating,review_text,created_time,recommendation_type',
    limit,
  })
}

/** Reply to a Facebook page comment */
async function replyToComment(commentId, message) {
  return graphPost(`/${commentId}/comments`, { message })
}

/** Get page follower count and basic info */
async function getPageInfo() {
  return graphGet(`/${pageId()}`, {
    fields: 'name,fan_count,followers_count,rating_count,overall_star_rating,picture',
  })
}

/** Schedule a post for a future time (Unix timestamp) */
async function schedulePost({ message, scheduledTime, link } = {}) {
  const body = { message, published: false, scheduled_publish_time: scheduledTime }
  if (link) body.link = link
  return graphPost(`/${pageId()}/feed`, body)
}

module.exports = {
  postToPage,
  postPhotoToPage,
  getPageInsights,
  getRecentPosts,
  getPageRatings,
  replyToComment,
  getPageInfo,
  schedulePost,
}
