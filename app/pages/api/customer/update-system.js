const { getSessionFromRequest } = require('../../../lib/auth')
const { findContactByEmail } = require('../../../lib/hubspot')
const { Client } = require('@hubspot/api-client')

/**
 * POST /api/customer/update-system
 * Lets a signed-in customer update their own system configuration in HubSpot.
 * Display-only metadata for My Account — does NOT touch billing or appointments.
 *
 * Body: { systems: [{type, count, hasTimer?}, ...] }
 *   type   = 'Biogents-CO2' | 'Biogents-NonCO2' | 'Mosqitter-Grand'
 *   count  = int 1..20
 *   hasTimer = bool (only meaningful for Biogents-CO2)
 *
 * Storage: when a single system, write legacy fields (system_type, trap_count, has_timer).
 *          When multiple, serialise the whole array as JSON into system_type so we
 *          stay schema-compatible without requiring a new HubSpot property.
 */
const VALID_TYPES = ['Biogents-CO2', 'Biogents-NonCO2', 'Mosqitter-Grand']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })

  const { systems } = req.body || {}
  if (!Array.isArray(systems) || systems.length === 0) {
    return res.status(400).json({ error: 'systems array required' })
  }

  const cleaned = systems
    .filter((s) => s && VALID_TYPES.includes(s.type))
    .map((s) => ({
      type: s.type,
      count: Math.max(1, Math.min(20, parseInt(s.count, 10) || 1)),
      hasTimer: s.type === 'Biogents-CO2' && !!s.hasTimer,
    }))

  if (cleaned.length === 0) return res.status(400).json({ error: 'No valid systems' })

  try {
    const contact = await findContactByEmail(session.email)
    if (!contact?.id) return res.status(404).json({ error: 'Contact not found' })

    const client = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN })
    const totalTraps = cleaned.reduce((sum, s) => sum + s.count, 0)
    const props = { trap_count: String(totalTraps) }

    if (cleaned.length === 1) {
      const s = cleaned[0]
      props.system_type = s.type
      props.has_timer = s.hasTimer ? 'true' : 'false'
    } else {
      props.system_type = JSON.stringify(cleaned)
      // For legacy single-field readers, leave has_timer reflecting first row
      props.has_timer = cleaned[0].hasTimer ? 'true' : 'false'
    }

    await client.crm.contacts.basicApi.update(contact.id, { properties: props })
    return res.status(200).json({ ok: true, systems: cleaned })
  } catch (e) {
    console.error('update-system error:', e.message)
    return res.status(500).json({ error: 'Failed to update system info' })
  }
}
