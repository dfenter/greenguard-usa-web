// GET (by firm): list call reports for the firm page.
// POST: save a discovery call report. DB insert is authoritative and must
// succeed for the request to succeed. HubSpot sync (contact, note, and when
// dealsEnabled() deal + note-deal association) is best-effort and never
// fails the response — failures are reported as a `warning` string.
const { requireGtm } = require('../../../lib/auth')
const { q } = require('../../../lib/db')
const { upsertContact, addNote } = require('../../../lib/hubspot')
const { dealsEnabled, syncDeal, associateNoteToDeal } = require('../../../lib/gtm-hubspot')

const OUTREACH_CAMPAIGN = 'sparkbridge-fap-2026-09'

// Bundle doc 08's "Next step" options mapped to the gtm_deals pipeline stage
// they correspond to. Anything not in this map (e.g. "not a fit") does not
// move the deal stage.
const NEXT_STEP_TO_STAGE = {
  'follow-up': 'Contacted',
  'technical review': 'Call booked',
  demo: 'Call booked',
  'architecture review': 'Review delivered',
  'partner discussion': 'Partner signed',
}

function stageForNextStep(nextStep) {
  const key = String(nextStep || '').trim().toLowerCase()
  return NEXT_STEP_TO_STAGE[key] || null
}

// Three-block note text per bundle doc 08's call report table: Architecture,
// Pain, Fit. Objections/Competitive/Next step are appended so the note is
// self-contained, but the three named blocks come first.
function buildNoteBody(r) {
  const lines = []
  lines.push(`Discovery call report: ${r.firm || ''}`)
  lines.push('')
  lines.push('Architecture.')
  lines.push(`Estimated site count: ${r.site_count || 'unknown'}. Current shape: ${r.current_shape || 'unknown'}. MQTT stack: ${r.mqtt_stack || 'none'}. Central applications: ${r.central_applications || 'unknown'}. Existing consumers: ${r.existing_consumers || 'unknown'}.`)
  lines.push('')
  lines.push('Pain.')
  lines.push(`Primary: ${r.pain_primary || 'unknown'}. Secondary: ${r.pain_secondary || 'none'}. Business consequence: ${r.pain_consequence || 'unknown'}. Current workaround: ${r.current_workaround || 'none'}.`)
  lines.push('')
  lines.push('Fit.')
  lines.push(`${r.fit || 'unknown'}. ${r.fit_reason || ''}`.trim())
  if (r.objections) {
    lines.push('')
    lines.push('Objections.')
    lines.push(r.objections)
  }
  if (r.competitive) {
    lines.push('')
    lines.push('Competitive.')
    lines.push(r.competitive)
  }
  lines.push('')
  lines.push(`Next step: ${r.next_step || 'unknown'}, date ${r.next_date || 'unknown'}, owner ${r.next_owner || 'unknown'}.`)
  return lines.join('\n')
}

async function handlePost(req, res, session) {
  const body = req.body || {}
  const {
    firm, contact_name, contact_email, contact_role, vertical,
    site_count, current_shape, mqtt_stack, central_applications, existing_consumers,
    pain_primary, pain_secondary, pain_consequence, current_workaround,
    fit, fit_reason,
    objections, competitive,
    next_step, next_date, next_owner,
  } = body

  if (typeof firm !== 'string' || !firm.trim()) return res.status(400).json({ error: 'firm required' })

  const payload = {
    contact_name, contact_email, contact_role, vertical,
    site_count, current_shape, mqtt_stack, central_applications, existing_consumers,
    pain_primary, pain_secondary, pain_consequence, current_workaround,
    fit, fit_reason, objections, competitive,
    next_step, next_date, next_owner,
  }

  // Step 1: DB insert. Must succeed for the request to succeed.
  let reportId
  try {
    const { rows } = await q(
      `INSERT INTO gtm_call_reports (firm, email, contact_email, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id`,
      [firm, session.email, contact_email || null, JSON.stringify(payload)]
    )
    reportId = rows[0].id
  } catch (err) {
    console.error('gtm call-reports insert failed:', err.message)
    return res.status(500).json({ error: 'failed to save call report' })
  }

  // Step 2: update gtm_deals stage in Postgres from next_step, if mappable.
  const stage = stageForNextStep(next_step)
  if (stage) {
    try {
      await q(
        `INSERT INTO gtm_deals (firm, stage, next_action, next_date, owner, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (firm) DO UPDATE SET stage = $2, next_action = $3, next_date = $4, owner = $5, updated_at = now()`,
        [firm, stage, next_step || null, next_date || null, next_owner || session.email]
      )
    } catch (err) {
      console.error('gtm call-reports deal stage update failed:', err.message)
    }
  }

  // Step 3: best-effort HubSpot. Wrapped so it can never fail the response.
  let hubspotContactId = null
  let hubspotNoteId = null
  let hubspotDealId = null
  let warning = null

  try {
    if (contact_email) {
      const contact = await upsertContact({
        email: contact_email,
        name: contact_name || '',
        metadata: {
          outreach_campaign: OUTREACH_CAMPAIGN,
          outreach_segment: vertical || '',
        },
      })
      hubspotContactId = contact.id

      const note = await addNote(hubspotContactId, buildNoteBody({ firm, ...payload }))
      hubspotNoteId = note && note.id ? note.id : null

      if (await dealsEnabled()) {
        const dealResult = await syncDeal({ firm, stage: stage || undefined, contactEmail: contact_email })
        if (dealResult.ok) {
          hubspotDealId = dealResult.dealId
          if (hubspotNoteId) await associateNoteToDeal(hubspotNoteId, hubspotDealId)
        } else {
          warning = `HubSpot deal sync failed: ${dealResult.reason}`
        }
      }
    } else {
      warning = 'No contact_email given; skipped HubSpot sync.'
    }
  } catch (err) {
    console.error('gtm call-reports HubSpot sync failed:', err.message)
    warning = `HubSpot sync failed: ${err.message}`
  }

  // Best-effort: persist whatever HubSpot ids we got, even on partial failure.
  try {
    await q(
      `UPDATE gtm_call_reports SET hubspot_contact_id = $1, hubspot_note_id = $2, hubspot_deal_id = $3 WHERE id = $4`,
      [hubspotContactId, hubspotNoteId, hubspotDealId, reportId]
    )
  } catch (err) {
    console.error('gtm call-reports id backfill failed:', err.message)
  }

  const response = {
    ok: true,
    id: reportId,
    hubspot: { contactId: hubspotContactId, noteId: hubspotNoteId, dealId: hubspotDealId },
  }
  if (warning) response.warning = warning
  return res.status(200).json(response)
}

export default async function handler(req, res) {
  const session = await requireGtm(req, res)
  if (!session) return

  if (req.method === 'GET') {
    const { firm } = req.query || {}
    if (typeof firm !== 'string' || !firm.trim()) return res.status(400).json({ error: 'firm required' })

    const { rows } = await q(
      `SELECT id, firm, email, contact_email, payload, hubspot_contact_id, hubspot_note_id, hubspot_deal_id, created_at FROM gtm_call_reports WHERE firm = $1 ORDER BY created_at DESC`,
      [firm]
    )
    return res.status(200).json({ rows })
  }

  if (req.method === 'POST') {
    return handlePost(req, res, session)
  }

  return res.status(405).end()
}
