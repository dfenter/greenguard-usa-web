// SparkBridge Partners deal pipeline: probe, resolve, sync.
// Follows lib/hubspot.js's Client + fetchWithTimeout conventions. Never
// throws past a caught external call; every public function returns a
// plain ok/reason result instead.
const { Client } = require('@hubspot/api-client')
const { cached } = require('./cache')
const { findContactByEmail } = require('./hubspot')

const client = new Client({
  accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
  numberOfApiCallRetries: 3,
})

const PIPELINE_LABEL = 'SparkBridge Partners'
const STAGE_LABELS = ['Contacted', 'Call booked', 'Review delivered', 'Partner signed', 'Pilot live', 'Production measured']

/**
 * PURE helper: resolve a stage id from a resolved pipeline's stage map by
 * label. Case-insensitive, trims whitespace. No network calls.
 */
function stageIdForLabel(pipeline, label) {
  if (!pipeline || !pipeline.stages || label === null || label === undefined) return undefined
  const wanted = String(label).trim().toLowerCase()
  for (const [stageLabel, stageId] of Object.entries(pipeline.stages)) {
    if (String(stageLabel).trim().toLowerCase() === wanted) return stageId
  }
  return undefined
}

/**
 * Fetch HubSpot deal pipelines and build { pipelineId, stages: {label: id} }
 * for the SparkBridge Partners pipeline. Cached 1hr via lib/cache.js.
 */
async function resolvePipeline() {
  return cached('gtm:hubspot:pipeline', 3600, async () => {
    const resp = await client.crm.pipelines.pipelinesApi.getAll('deals')
    const results = resp.results || []
    const pipeline = results.find((p) => p.label === PIPELINE_LABEL)
    if (!pipeline) throw new Error(`HubSpot pipeline not found: ${PIPELINE_LABEL}`)
    const stages = {}
    for (const stage of pipeline.stages || []) {
      stages[stage.label] = stage.id
    }
    return { pipelineId: pipeline.id, stages }
  })
}

/**
 * True by default. False only when GTM_HUBSPOT_DEALS='0', or when a live
 * pipelines probe fails. The probe result is cached 1hr so it isn't hit on
 * every request.
 */
async function dealsEnabled() {
  if (process.env.GTM_HUBSPOT_DEALS === '0') return false
  try {
    const ok = await cached('gtm:hubspot:deals-probe', 3600, async () => {
      await resolvePipeline()
      return true
    })
    return Boolean(ok)
  } catch {
    return false
  }
}

function dealName(firm) {
  return `${firm} · SparkBridge FAP`
}

/**
 * Find-or-create a deal named "<firm> · SparkBridge FAP" in the SparkBridge
 * Partners pipeline, set its stage, and associate it to the contact by
 * email when given. Idempotent: searches for an exact dealname match within
 * the pipeline before creating. Never throws.
 */
async function syncDeal({ firm, stage, contactEmail }) {
  try {
    if (!firm || !String(firm).trim()) return { ok: false, reason: 'firm required' }
    const pipeline = await resolvePipeline()
    const name = dealName(firm)
    const properties = { dealname: name, pipeline: pipeline.pipelineId }
    if (stage) {
      const stageId = stageIdForLabel(pipeline, stage)
      if (stageId) properties.dealstage = stageId
    }

    const search = await client.crm.deals.searchApi.doSearch({
      filterGroups: [
        {
          filters: [
            { propertyName: 'dealname', operator: 'EQ', value: name },
            { propertyName: 'pipeline', operator: 'EQ', value: pipeline.pipelineId },
          ],
        },
      ],
      limit: 1,
    })

    let dealId
    if (search.results && search.results.length > 0) {
      dealId = search.results[0].id
      await client.crm.deals.basicApi.update(dealId, { properties })
    } else {
      const created = await client.crm.deals.basicApi.create({ properties })
      dealId = created.id
    }

    if (contactEmail) {
      try {
        const contact = await findContactByEmail(contactEmail)
        if (contact && contact.id) {
          await client.crm.associations.v4.basicApi.createDefault('deals', dealId, 'contacts', contact.id)
        }
      } catch (err) {
        // Association failure shouldn't fail the whole sync — the deal exists.
        console.error('gtm-hubspot syncDeal association error:', err.message)
      }
    }

    return { ok: true, dealId }
  } catch (err) {
    console.error('gtm-hubspot syncDeal error:', err.message)
    return { ok: false, reason: err.message }
  }
}

/**
 * Associate an existing note to an existing deal (default association).
 * Never throws — best-effort by design, matching syncDeal.
 */
async function associateNoteToDeal(noteId, dealId) {
  try {
    if (!noteId || !dealId) return { ok: false, reason: 'noteId and dealId required' }
    await client.crm.associations.v4.basicApi.createDefault('notes', String(noteId), 'deals', String(dealId))
    return { ok: true }
  } catch (err) {
    console.error('gtm-hubspot associateNoteToDeal error:', err.message)
    return { ok: false, reason: err.message }
  }
}

module.exports = { dealsEnabled, resolvePipeline, stageIdForLabel, syncDeal, associateNoteToDeal, dealName, PIPELINE_LABEL, STAGE_LABELS }
