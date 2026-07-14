const { Client } = require('@hubspot/api-client')
const crypto = require('crypto')
const { fetchWithTimeout } = require('./http')

// numberOfApiCallRetries: SDK retries 429/5xx with backoff for all SDK calls.
const client = new Client({
  accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
  numberOfApiCallRetries: 3,
})

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
    ...Object.fromEntries(
      Object.entries(metadata).map(([k, v]) => [k, String(v)])
    ),
  }
  if (phone) properties.phone = phone
  if (address) properties.address = address

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
  'billing_contact_name', 'mq_installed', 'mq_installed_at',
  'recurring_addons', 'addons_optout', 'first_appointment',
  'gate_code', 'access_notes', 'pets_on_property', 'special_instructions',
  'gclid', 'ga_client_id',
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

/**
 * Batch lookup contacts by email — one HubSpot call instead of N.
 * Returns a Map keyed by lowercased email → contact (or undefined if missing).
 * Empty input returns an empty Map without hitting the API.
 *
 * Cached 20s in Upstash keyed by the sorted email set, so multiple components
 * in the same render (and back-to-back page loads) share one fetch. Result
 * is serialized as an array of [email, contact] pairs since Upstash can't
 * round-trip a Map directly.
 */
const { cached: _cachedH } = require('./cache')
async function findContactsByEmails(emails) {
  const out = new Map()
  const cleaned = [...new Set((emails || []).filter(Boolean).map((e) => e.trim().toLowerCase()))]
  if (cleaned.length === 0) return out

  const sorted = [...cleaned].sort()
  // Hash the (potentially long) email list — truncating the raw join to 250
  // chars made large sets that differ only in their tail collide and return the
  // wrong customers' contact data.
  const cacheKey = `hs:contacts:${crypto.createHash('sha1').update(sorted.join(',')).digest('hex')}`
  // 60s cache — contact name/phone/tank_count rarely change within a minute,
  // and rounds/home/calendar all re-request the same email set on reload.
  // Was 20s, which expired before a tech's repeat loads benefited.
  const pairs = await _cachedH(cacheKey, 300, async () => {
    return await _fetchContactsByEmails(sorted)
  })
  for (const [k, v] of pairs) out.set(k, v)
  return out
}

async function _fetchContactsByEmails(cleaned) {
  const pairs = []

  // HubSpot search supports IN against up to 100 values per filter; chunk to be safe.
  const CHUNK = 100
  for (let i = 0; i < cleaned.length; i += CHUNK) {
    const batch = cleaned.slice(i, i + CHUNK)
    try {
      const search = await client.crm.contacts.searchApi.doSearch({
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'IN', values: batch }] }],
        properties: CONTACT_PROPERTIES,
        limit: CHUNK,
      })
      for (const c of (search.results || [])) {
        const k = (c.properties?.email || '').toLowerCase()
        if (k) pairs.push([k, c])
      }
    } catch (err) {
      // A partial result would be cached as if it were complete and can make
      // every downstream page render the wrong customer data for its TTL.
      throw new Error(`HubSpot contact batch failed: ${err.message || err}`)
    }
  }
  return pairs
}

async function getContactNotes(contactId, limit = 5) {
  return _cachedH(`hs:notes:${contactId}`, 60, async () => {
    // Fetch up to 100 association IDs (batch-read's max input size) — do NOT slice before
    // batch-reading because HubSpot returns association IDs in an arbitrary order (often
    // oldest-first), so slicing early would return stale notes instead of the most recent ones.
    const assocResp = await fetchWithTimeout(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}/associations/notes?limit=100`,
      { headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` } }
    )
    if (!assocResp.ok) return []
    const assocData = await assocResp.json()
    const allIds = (assocData.results || []).map((r) => r.id)
    if (allIds.length === 0) return []

    const batchResp = await fetchWithTimeout('https://api.hubapi.com/crm/v3/objects/notes/batch/read', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: allIds.map((id) => ({ id: String(id) })),
        properties: ['hs_note_body', 'hs_timestamp'],
      }),
    })
    if (!batchResp.ok) return []
    const batchData = await batchResp.json()

    // Sort newest-first, then return the requested limit.
    // Strip HTML tags HubSpot sometimes wraps around note bodies (<p>, <div>, etc.)
    // so downstream regex filters like ADMIN_NOTE_RE work on plain text.
    return (batchData.results || [])
      .sort((a, b) => new Date(b.properties.hs_timestamp) - new Date(a.properties.hs_timestamp))
      .slice(0, limit)
      .map((n) => ({
        id: n.id,
        body: (n.properties.hs_note_body || '').replace(/<[^>]*>/g, '').trim(),
        timestamp: n.properties.hs_timestamp,
      }))
  })
}

// Client-facing popup notes are saved with a `[ADMIN-NOTE email timestamp]`
// prefix. This returns up to `take` of them, prefix stripped. Shared by
// rounds / home-data / tech-data (the block used to be copy-pasted in all 3).
const ADMIN_NOTE_RE = /^\[ADMIN-NOTE[^\]]*\]\s*/
// scan=100 (was 20): visit-log + payment notes accumulate ~2/visit, so a shallow
// scan let permanent notes (gate codes etc.) silently age out of the window.
async function getClientNotes(contactId, scan = 100, take = 3) {
  if (!contactId) return []
  try {
    const notes = await getContactNotes(contactId, scan)
    return notes
      .filter((n) => ADMIN_NOTE_RE.test((n.body || '').trim()))
      .slice(0, take)
      .map((n) => n.body.trim().replace(ADMIN_NOTE_RE, ''))
      .filter(Boolean)
  } catch {
    return []
  }
}

async function updateContact(contactId, updates) {
  const props = { ...(updates.properties || {}) }
  if (updates.name !== undefined) {
    const [firstname, ...rest] = (updates.name || '').split(' ')
    props.firstname = firstname || ''
    props.lastname = rest.join(' ')
  }
  if (updates.phone !== undefined) props.phone = updates.phone
  if (updates.address !== undefined) props.address = updates.address
  if (updates.plan_type !== undefined) props.plan_type = updates.plan_type || ''
  if (updates.system_type !== undefined) props.system_type = updates.system_type || ''
  if (updates.trap_count !== undefined && updates.trap_count !== '') props.trap_count = String(updates.trap_count)
  if (updates.has_timer !== undefined) props.has_timer = updates.has_timer
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

async function getAllContacts(limit = 200) {
  // 90s cache — this paginates up to `limit` contacts (5 sequential HubSpot
  // calls at limit=500), the single biggest cost on the home dashboard. The
  // contact list barely changes minute-to-minute, so a short cache turns
  // repeat admin loads from ~1s into a cache hit.
  return _cachedH(`hubspot:allcontacts:${limit}`, 1800, async () => {
    const results = []
    let after = undefined
    const properties = ['email', 'firstname', 'lastname', 'phone', 'address', 'system_type', 'plan_type', 'trap_count', 'tank_count', 'customer_status', 'first_appointment', 'has_timer']
    const pageSize = Math.min(100, limit)
    do {
      const params = new URLSearchParams({ limit: pageSize, properties: properties.join(',') })
      if (after) params.set('after', after)
      const res = await fetchWithTimeout(`https://api.hubapi.com/crm/v3/objects/contacts?${params}`, {
        headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` },
      })
      if (!res.ok) throw new Error(`HubSpot contacts returned ${res.status}`)
      const data = await res.json()
      results.push(...(data.results || []))
      after = data.paging?.next?.after
      if (results.length >= limit) break
    } while (after)
    return results
  })
}

/**
 * Bulk lookup contacts by full name (and optionally address). Used as a fallback
 * when GCal events lack an email in the description but we have a customer name.
 *
 * Input: array of { name, address? } objects.
 * Output: Map keyed by lowercased trimmed name → contact (best match).
 *
 * Matching: name → split into firstname + lastname, exact match on both.
 * If multiple contacts match a name, address is used as a tiebreaker (first
 * 8 chars of the street, case-insensitive). Otherwise the most-recently-modified
 * contact wins.
 */
async function findContactsByNames(items) {
  const result = new Map()
  const cleaned = (items || [])
    .filter((x) => x && x.name && x.name.trim())
    .map((x) => ({ name: x.name.trim(), address: (x.address || '').trim() }))
  if (cleaned.length === 0) return result

  // De-dupe by name; split into first+last; skip single-token names.
  const entries = []
  const seen = new Set()
  for (const it of cleaned) {
    const key = it.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const parts = it.name.split(/\s+/)
    if (parts.length < 2) continue
    entries.push({ key, first: parts[0], last: parts.slice(1).join(' '), address: it.address })
  }
  if (entries.length === 0) return result

  // HubSpot CRM Search lets each request carry up to 5 filterGroups; each
  // group is OR-combined. We pack one name per group (AND firstname+lastname).
  const PER_REQUEST = 5
  for (let i = 0; i < entries.length; i += PER_REQUEST) {
    const batch = entries.slice(i, i + PER_REQUEST)
    try {
      const search = await client.crm.contacts.searchApi.doSearch({
        filterGroups: batch.map((e) => ({
          filters: [
            { propertyName: 'firstname', operator: 'EQ', value: e.first },
            { propertyName: 'lastname',  operator: 'EQ', value: e.last },
          ],
        })),
        properties: CONTACT_PROPERTIES,
        sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
        limit: 100,
      })
      const all = search.results || []
      // Group results back by name
      for (const e of batch) {
        const matches = all.filter((c) =>
          (c.properties?.firstname || '').toLowerCase() === e.first.toLowerCase() &&
          (c.properties?.lastname  || '').toLowerCase() === e.last.toLowerCase()
        )
        if (!matches.length) continue
        let best = matches[0]
        if (matches.length > 1 && e.address) {
          const needle = e.address.toLowerCase().slice(0, 8)
          const addrMatch = matches.find((c) => (c.properties?.address || '').toLowerCase().includes(needle))
          if (addrMatch) best = addrMatch
        }
        result.set(e.key, best)
      }
    } catch {}
  }
  return result
}

/**
 * Canonical "how many CO₂ tanks does this customer need per service visit?"
 *
 * Always returns an integer ≥ 0. Single source of truth across every
 * dashboard so the daily route, weekly forecast, inventory, calendar,
 * and rounds all agree on tank demand.
 *
 * Rules:
 *   1. If tank_count is explicitly set (any value, including 0) → use it.
 *   2. Else fall back to trap_count (legacy: Biogents-CO2 customers
 *      created before we added the tank_count field).
 *   3. Else 0 (never the old "default to 2" bug).
 *
 * Mosqitter customers DO use CO₂ tanks (service includes tank exchange);
 * their tank_count should equal their trap_count and is now backfilled.
 */
function tanksForCustomer(props) {
  if (!props) return 0
  const tankRaw = props.tank_count
  if (tankRaw !== null && tankRaw !== undefined && tankRaw !== '') {
    const n = parseInt(tankRaw, 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  }
  const trapRaw = props.trap_count
  if (trapRaw !== null && trapRaw !== undefined && trapRaw !== '') {
    const n = parseInt(trapRaw, 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  }
  return 0
}

module.exports = { upsertContact, addNote, findContactByEmail, findContactsByEmails, findContactsByNames, getContactNotes, getClientNotes, updateContact, countContactsByProperty, getAllContacts, tanksForCustomer }
