// Google Ads client + audit helpers.
//
// Required env vars (you provide these — see scripts/google-ads-setup.md):
//   GOOGLE_ADS_DEVELOPER_TOKEN     — request via ads.google.com → Tools → API Center
//   GOOGLE_ADS_CUSTOMER_ID         — the account ID (no dashes), e.g. "1234567890"
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID   — manager (MCC) account ID, only if used
//   GOOGLE_ADS_CLIENT_ID           — OAuth2 client ID
//   GOOGLE_ADS_CLIENT_SECRET       — OAuth2 client secret
//   GOOGLE_ADS_REFRESH_TOKEN       — long-lived refresh token for offline access
//
// The OAuth client can be reused from the existing Google project (Calendar/Gmail).
// You'll just need to add the AdWords scope (https://www.googleapis.com/auth/adwords)
// to the consent and regenerate a refresh token.

const { GoogleAdsApi } = require('google-ads-api')

let _client = null
function client() {
  if (_client) return _client
  const required = [
    'GOOGLE_ADS_DEVELOPER_TOKEN',
    'GOOGLE_ADS_CLIENT_ID',
    'GOOGLE_ADS_CLIENT_SECRET',
  ]
  const missing = required.filter((k) => !process.env[k])
  if (missing.length) throw new Error(`Missing Google Ads env: ${missing.join(', ')}`)
  _client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  })
  return _client
}

function customer() {
  return client().Customer({
    customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID,
    login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || undefined,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
  })
}

const STALE_DOMAINS = ['acuityscheduling.com', 'squarespace.com', 'app.acuity', 'swordfish-triangle']

function isStale(url) {
  if (!url) return false
  const u = String(url).toLowerCase()
  return STALE_DOMAINS.some((d) => u.includes(d))
}

/**
 * Audit final URLs across ads, sitelinks, and assets. Returns
 * { ok: [...], stale: [{ resource, url, type }] }.
 */
async function auditFinalUrls() {
  const c = customer()
  const stale = []
  const ok = []

  // Enabled ads in enabled ad groups + campaigns
  const adsQuery = `
    SELECT ad_group_ad.ad.id, ad_group_ad.ad.final_urls, ad_group_ad.ad.name,
           ad_group_ad.status, ad_group.name, campaign.name
    FROM ad_group_ad
    WHERE ad_group_ad.status = 'ENABLED'
      AND ad_group.status = 'ENABLED'
      AND campaign.status = 'ENABLED'
  `
  for (const row of await c.query(adsQuery)) {
    for (const url of (row.ad_group_ad?.ad?.final_urls || [])) {
      const rec = { resource: `Ad ${row.ad_group_ad.ad.id} (${row.campaign?.name} → ${row.ad_group?.name})`, url, type: 'ad' }
      ;(isStale(url) ? stale : ok).push(rec)
    }
  }

  // Sitelink extensions (legacy) + asset-based sitelinks
  try {
    const sitelinksQuery = `
      SELECT asset.id, asset.sitelink_asset.link_text, asset.final_urls, asset.resource_name
      FROM asset
      WHERE asset.type = 'SITELINK'
    `
    for (const row of await c.query(sitelinksQuery)) {
      for (const url of (row.asset?.final_urls || [])) {
        const rec = { resource: `Sitelink: ${row.asset?.sitelink_asset?.link_text || row.asset.id}`, url, type: 'sitelink' }
        ;(isStale(url) ? stale : ok).push(rec)
      }
    }
  } catch (e) {
    // Sitelink schema varies between API versions — skip rather than fail the whole audit.
  }

  return { ok, stale }
}

module.exports = { customer, auditFinalUrls, isStale, STALE_DOMAINS }
