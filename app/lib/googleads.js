/**
 * Google Ads API v17 — campaign management and reporting
 * Credentials sourced entirely from env vars — no hardcoded IDs.
 */

const { google } = require('googleapis')

function getClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return auth
}

const BASE = 'https://googleads.googleapis.com/v17'

async function adsRequest(method, path, body) {
  const auth = getClient()
  const { token } = await auth.getAccessToken()
  const res = await fetch(`${BASE}/customers/${process.env.GOOGLE_ADS_CUSTOMER_ID}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (data.error) throw new Error(`Google Ads API: ${JSON.stringify(data.error)}`)
  return data
}

// Run a GAQL query and return rows
async function query(gaql) {
  const data = await adsRequest('POST', '/googleAds:search', { query: gaql })
  return data.results || []
}

// Campaign performance for a date range (YYYY-MM-DD)
async function getCampaignStats(since, until) {
  const gaql = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
    AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC`
  return query(gaql)
}

// All campaigns with budget info
async function getCampaigns() {
  const gaql = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign_budget.amount_micros,
      campaign.advertising_channel_type
    FROM campaign
    WHERE campaign.status != 'REMOVED'`
  return query(gaql)
}

// Pause or enable a campaign
async function setCampaignStatus(campaignId, status) {
  return adsRequest('POST', '/campaigns:mutate', {
    operations: [{ update: { resourceName: `customers/${process.env.GOOGLE_ADS_CUSTOMER_ID}/campaigns/${campaignId}`, status }, updateMask: 'status' }]
  })
}

// Top keywords by cost
async function getKeywordStats(since, until) {
  const gaql = `
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM keyword_view
    WHERE segments.date BETWEEN '${since}' AND '${until}'
    AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 25`
  return query(gaql)
}

module.exports = { getCampaignStats, getCampaigns, setCampaignStatus, getKeywordStats }
