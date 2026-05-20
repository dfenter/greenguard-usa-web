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
 */
async function addNote(contactId, noteBody) {
  const note = await client.crm.objects.notesApi.basicApi.create({
    properties: {
      hs_note_body: noteBody,
      hs_timestamp: new Date().toISOString(),
    },
  })

  await client.crm.objects.notesApi.associationsApi.create(
    note.id,
    'contacts',
    contactId,
    [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }]
  )

  return note
}

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
    properties: ['email', 'firstname', 'lastname', 'phone', 'address'],
    limit: 1,
  })

  return search.results[0] || null
}

module.exports = { upsertContact, addNote, findContactByEmail }
