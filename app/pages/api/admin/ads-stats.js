import { requireAdmin } from '../../../lib/auth'
const { getCampaignStats: getMetaStats, getCampaigns: getMetaCampaigns } = require('../../../lib/meta')
const { getCampaignStats: getGadsStats, getCampaigns: getGadsCampaigns } = require('../../../lib/googleads')

export default async function handler(req, res) {
  const session = await requireAdmin(req, res)
  if (!session) return

  const days = parseInt(req.query.days || '30')
  const until = new Date().toISOString().split('T')[0]
  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]

  const [metaStats, metaCampaigns, gadsStats, gadsCampaigns] = await Promise.allSettled([
    getMetaStats(since, until),
    getMetaCampaigns(),
    getGadsStats(since, until),
    getGadsCampaigns(),
  ])

  res.json({
    since,
    until,
    meta: {
      stats: metaStats.status === 'fulfilled' ? metaStats.value?.data || [] : [],
      campaigns: metaCampaigns.status === 'fulfilled' ? metaCampaigns.value?.data || [] : [],
      error: metaStats.status === 'rejected' ? metaStats.reason?.message : null,
    },
    googleAds: {
      stats: gadsStats.status === 'fulfilled' ? gadsStats.value : [],
      campaigns: gadsCampaigns.status === 'fulfilled' ? gadsCampaigns.value : [],
      error: gadsStats.status === 'rejected' ? gadsStats.reason?.message : null,
    },
  })
}
