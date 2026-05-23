const { getSessionFromRequest } = require('../../../lib/auth')
const { findContactByEmail } = require('../../../lib/hubspot')
const { Client } = require('@hubspot/api-client')

/**
 * POST /api/customer/update-system
 * Lets a signed-in customer update their own system configuration in HubSpot.
 * Does NOT touch billing or appointments — display-only metadata for My Account.
 * Fields: systemType ('Biogents-CO2' | 'Biogents-NonCO2' | 'Mosqitter-Grand'),
 *         trapCount (int), hasTimer (bool).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })

  const { systemType, trapCount, hasTimer } = req.body || {}

  const validSystems = ['Biogents-CO2', 'Biogents-NonCO2', 'Mosqitter-Grand']
  if (systemType && !validSystems.includes(systemType)) {
    return res.status(400).json({ error: 'Invalid systemType' })
  }
  const trapNum = Math.max(0, Math.min(10, parseInt(trapCount, 10) || 0))

  try {
    const contact = await findContactByEmail(session.email)
    if (!contact?.id) return res.status(404).json({ error: 'Contact not found' })

    const client = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN })
    const props = {}
    if (systemType) props.system_type = systemType
    if (trapNum > 0) props.trap_count = String(trapNum)
    if (typeof hasTimer === 'boolean') props.has_timer = hasTimer ? 'true' : 'false'

    await client.crm.contacts.basicApi.update(contact.id, { properties: props })
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('update-system error:', e.message)
    return res.status(500).json({ error: 'Failed to update system info' })
  }
}
