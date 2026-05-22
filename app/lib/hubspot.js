const { Client } = require('@hubspot/api-client')

const client = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN })

/**
 * Create or update a HubSpot contact by email.
 */
async function upsertContact({ email, name, phone, address, metadata = {} }) {
  const [firstname, ...rest] = (name || '').split(' ')
  const lastname = rest.join(' ')

  const properties = {
    email,
    firstname: firstname || '',
    lastname: lastname || '',
    phone: phone || '',
    address: address || '',
    ...Object.fromEntries(
      Object.entries(metadata).map(([k, v]) => [k, String(v)])
    ),
  }

  try {
    // Search for existing contact
    const search = await client.crm.contacts.searchApi.doSearch({
      filterGroups: [
        {
          filters: [{ propertyName: 'email', operator: 'EQ', value: email }],
        },
      ],
      limit: 1,
    })

    if (search.results.length > 0) {
      const id = search.results[0].id
      await client.crm.contacts.basicApi.update(id, { properties })
      return { id, created: false }
    }

    const created = await client.crm.contacts.basicApi.create({ properties })
    return { id: created.id, created: true }
  } catch (err) {
    console.error('HubSpot upsertContact error:', err.message)
    throw err
  }
}

/**
 * Add an engagement note to a contact.
 * Uses a single create call with inline association (v13 API — no separate associationsApi).
 */
async function addNote(contactId, noteBody) {
  return client.crm.objects.notes.basicApi.create({
    properties: {
      hs_note_body: noteBody,
      hs_timestamp: new Date().toISOString(),
    },
    associations: [{
      to: { id: String(contactId) },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
    }],
  })
}

/**
 * Find a contact by email and return their HubSpot ID + properties.
 */
const CONTACT_PROPERTIES = [
  'email', 'firstname', 'lastname', 'phone', 'address',
  'plan_type', 'system_type', 'trap_count', 'tank_count', 'has_timer',
  'customer_type', 'service_start_date', 'stripe_customer_id',
  'payment_status', 'customer_status',
]

async function findContactByEmail(email) {
  const search = await client.crm.contacts.searchApi.doSearch({
    filterGroups: [
      {
        filters: [{ propertyName: 'email', operator: 'EQ', value: email }],
      },
    ],
    properties: CONTACT_PROPERTIES,
    limit: 1,
  })

  return search.results[0] || null
}

async function getContactNotes(contactId, limit = 5) {
  const assocResp = await fetch(
    `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}/associations/notes?limit=20`,
    { headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` } }
  )
  if (!assocResp.ok) return []
  const assocData = await assocResp.json()
  const noteIds = (assocData.results || []).map((r) => r.id).slice(0, limit)
  if (noteIds.length === 0) return []

  const batchResp = await fetch('https://api.hubapi.com/crm/v3/objects/notes/batch/read', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: noteIds.map((id) => ({ id: String(id) })),
      properties: ['hs_note_body', 'hs_timestamp'],
    }),
  })
  if (!batchResp.ok) return []
  const batchData = await batchResp.json()

  return (batchData.results || [])
    .sort((a, b) => new Date(b.properties.hs_timestamp) - new Date(a.properties.hs_timestamp))
    .map((n) => ({
      id: n.id,
      body: n.properties.hs_note_body || '',
      timestamp: n.properties.hs_timestamp,
    }))
}

async function updateContact(contactId, updates) {
  const props = {}
  if (updates.name !== undefined) {
    const [firstname, ...rest] = (updates.name || '').split(' ')
    props.firstname = firstname || ''
    props.lastname = rest.join(' ')
  }
  if (updates.phone !== undefined) props.phone = updates.phone
  if (updates.address !== undefined) props.address = updates.address
  await client.crm.contacts.basicApi.update(contactId, { properties: props })
}

/**
 * Count contacts where a given property equals a value (admin analytics).
 */
async function countContactsByProperty(propertyName, value) {
  try {
    const result = await client.crm.contacts.searchApi.doSearch({
      filterGroups: [{ filters: [{ propertyName, operator: 'EQ', value }] }],
      limit: 1,
    })
    return result.total || 0
  } catch {
    return 0
  }
}

module.exports = { upsertContact, addNote, findContactByEmail, getContactNotes, updateContact, countContactsByProperty }
