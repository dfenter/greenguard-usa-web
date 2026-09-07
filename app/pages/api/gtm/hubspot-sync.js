// POST: "Sync from HubSpot" — pulls current deal stages for known firms
// (every firm with a row in gtm_deals) from HubSpot back into Postgres.
// Best-effort per firm; reports a summary of what synced vs failed.
const { requireGtm } = require('../../../lib/auth')
const { q } = require('../../../lib/db')
const { Client } = require('@hubspot/api-client')
const { resolvePipeline, STAGE_LABELS, dealName } = require('../../../lib/gtm-hubspot')

const client = new Client({
  accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
  numberOfApiCallRetries: 3,
})

export default async function handler(req, res) {
  const session = await requireGtm(req, res)
  if (!session) return

  if (req.method !== 'POST') return res.status(405).end()

  const { rows: firms } = await q(`SELECT firm FROM gtm_deals`)

  let pipeline
  try {
    pipeline = await resolvePipeline()
  } catch (err) {
    return res.status(200).json({ ok: false, reason: `pipeline resolve failed: ${err.message}`, synced: [], failed: firms.map((f) => f.firm) })
  }

  const stageLabelForId = {}
  for (const [label, id] of Object.entries(pipeline.stages)) stageLabelForId[id] = label

  const synced = []
  const failed = []

  for (const { firm } of firms) {
    try {
      const name = dealName(firm)
      const search = await client.crm.deals.searchApi.doSearch({
        filterGroups: [
          {
            filters: [
              { propertyName: 'dealname', operator: 'EQ', value: name },
              { propertyName: 'pipeline', operator: 'EQ', value: pipeline.pipelineId },
            ],
          },
        ],
        properties: ['dealstage'],
        limit: 1,
      })
      if (!search.results || search.results.length === 0) {
        failed.push({ firm, reason: 'no matching HubSpot deal' })
        continue
      }
      const dealStageId = search.results[0].properties.dealstage
      const label = stageLabelForId[dealStageId]
      if (!label || !STAGE_LABELS.includes(label)) {
        failed.push({ firm, reason: `unrecognized stage id ${dealStageId}` })
        continue
      }
      await q(
        `UPDATE gtm_deals SET stage = $1, updated_at = now() WHERE firm = $2`,
        [label, firm]
      )
      synced.push({ firm, stage: label })
    } catch (err) {
      failed.push({ firm, reason: err.message })
    }
  }

  return res.status(200).json({ ok: true, synced, failed })
}
