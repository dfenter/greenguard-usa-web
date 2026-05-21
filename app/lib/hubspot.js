const { Client } = require('@hubspot/api-client')

const client = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN })

// Allowed HubSpot custom properties for upsertContact metadata
const ALLOWED_METADATA_KEYS = new Set([
  'system_type', 'trap_count', 'tank_count', 'has_timer',
  'service_start_date', 'customer_type', 'last_visit_date', 'installation_map',
])

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
      Object.entries(metadata || {})
        .filter(([k]) => ALLOWED_METADATA_KEYS.has(k))
        .map(([k, v]) => [k, String(v)])
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

const CONTACT_PROPERTIES = [
  'email', 'firstname', 'lastname', 'phone', 'address',
  'system_type', 'trap_count', 'tank_count', 'has_timer',
  'service_start_date', 'customer_type', 'last_visit_date',
  'installation_map',
]

/**
 * Find a contact by email and return their HubSpot ID + properties.
 */
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

/**
 * List all contacts (used by admin pages for customer dropdowns + client list).
 */
async function listAllContacts(limit = 100) {
  const res = await client.crm.contacts.basicApi.getPage(limit, undefined, undefined, CONTACT_PROPERTIES)
  return res.results || []
}

/**
 * Fetch the last N notes for a contact ID.
 * Uses two-step approach: get associated note IDs from contact, then batch-read note content.
 */
async function getNotesForContact(contactId, limit = 30) {
  try {
    // Step 1: get associated note IDs via the contact's associations
    const contact = await client.crm.contacts.basicApi.getById(
      String(contactId),
      [],        // properties (none needed)
      undefined, // propertiesWithHistory
      ['notes'], // associations to include
    )

    const noteIds = (contact.associations?.notes?.results || [])
      .map((a) => a.id)
      .slice(0, limit)

    if (noteIds.length === 0) return []

    // Step 2: batch-read the actual note content
    const batchRes = await client.crm.objects.notes.batchApi.read({
      inputs: noteIds.map((id) => ({ id: String(id) })),
      properties: ['hs_note_body', 'hs_timestamp'],
    })

    const results = batchRes.results || []
    results.sort((a, b) =>
      new Date(b.properties?.hs_timestamp) - new Date(a.properties?.hs_timestamp)
    )
    return results
  } catch {
    return []
  }
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

module.exports = { upsertContact, addNote, findContactByEmail, listAllContacts, getNotesForContact, countContactsByProperty }
