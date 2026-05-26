// Quote follow-up scan. Runs twice a day.
//
// For each [QUOTE-SENT] note in the last 30 days, the agent:
//   - checks Stripe for a completed checkout session with that jti
//   - if paid → records [QUOTE-PAID], stops chasing
//   - if dead-flagged by admin → leaves alone
//   - if T+48h passed → sends nudge email + records [QUOTE-FOLLOWUP-T48]
//   - if T+7d passed  → drafts admin alert + records [QUOTE-COLD]
//   - if T+14d passed → records [QUOTE-LOST]
//
// Auth: x-cron-key header must match CRON_SECRET.

const { addNote } = require('../../../lib/hubspot')
const { sendT48Email, sendT7dAdminAlert, buildPaidJtiSet } = require('../../../lib/quote-followup')

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN
const T48 = 48 * 3600 * 1000
const T7D = 7 * 24 * 3600 * 1000
const T14D = 14 * 24 * 3600 * 1000
const SCAN_DAYS = 30

// Parse "[QUOTE-SENT] jti=X email=Y amount=Z monthly=M url=U sent=ISO"
function parseQuoteNote(body) {
  const m = (body || '').match(/^\[QUOTE-SENT\]\s+(.+)$/)
  if (!m) return null
  const fields = {}
  for (const part of m[1].split(/\s+/)) {
    const [k, ...v] = part.split('=')
    if (k && v.length) fields[k] = v.join('=')
  }
  if (!fields.jti) return null
  return {
    jti: fields.jti,
    email: fields.email || '',
    amount: parseFloat(fields.amount || '0'),
    url: fields.url || '',
    sentAt: fields.sent ? new Date(fields.sent) : null,
  }
}

async function hsSearchNotes(filter, limit = 200) {
  const body = {
    filterGroups: [{ filters: filter }],
    properties: ['hs_note_body', 'hs_timestamp', 'hubspot_owner_id'],
    sorts: [{ propertyName: 'hs_timestamp', direction: 'DESCENDING' }],
    limit,
  }
  const r = await fetch('https://api.hubapi.com/crm/v3/objects/notes/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`HubSpot search ${r.status}`)
  const d = await r.json()
  return d.results || []
}

// Fetch the contact associated with a note (only need one; quotes are 1:1)
async function noteContactId(noteId) {
  const r = await fetch(`https://api.hubapi.com/crm/v3/objects/notes/${noteId}?associations=contacts`, {
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
  })
  if (!r.ok) return null
  const d = await r.json()
  return d.associations?.contacts?.results?.[0]?.id || null
}

// Fetch all notes on a single contact (cheap; small N per customer)
async function notesForContact(contactId) {
  const r = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}/associations/notes?limit=100`, {
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
  })
  if (!r.ok) return []
  const d = await r.json()
  const ids = (d.results || []).map((x) => x.id).slice(0, 100)
  if (!ids.length) return []
  const b = await fetch('https://api.hubapi.com/crm/v3/objects/notes/batch/read', {
    method: 'POST',
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: ids.map((id) => ({ id: String(id) })), properties: ['hs_note_body', 'hs_timestamp'] }),
  })
  if (!b.ok) return []
  return ((await b.json()).results || []).map((n) => n.properties.hs_note_body || '')
}

function hasMarkerForJti(noteBodies, marker, jti) {
  const needle = `${marker}` // we'll match marker + jti substring
  return noteBodies.some((body) => body.includes(needle) && body.includes(`jti=${jti}`))
}

function hasDeadFlag(noteBodies, jti) {
  return noteBodies.some((b) => b.includes('[QUOTE-DEAD]') && (b.includes(`jti=${jti}`) || !b.includes('jti=')))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['x-cron-key'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!HUBSPOT_TOKEN) return res.status(503).json({ error: 'HUBSPOT_ACCESS_TOKEN not set' })

  const now = Date.now()
  const scanCutoff = new Date(now - SCAN_DAYS * 24 * 3600 * 1000).toISOString()
  const results = {
    scanned: 0, paid_marked: 0, t48_sent: 0, cold_marked: 0, lost_marked: 0,
    skipped_dead: 0, errors: [],
  }

  let paidSet
  try {
    // One Stripe scan per cron run, scoped to the last 30 days
    paidSet = await buildPaidJtiSet(Math.floor((now - SCAN_DAYS * 24 * 3600 * 1000) / 1000))
  } catch (e) {
    return res.status(500).json({ error: 'Stripe scan failed: ' + e.message })
  }

  let notes
  try {
    notes = await hsSearchNotes([
      { propertyName: 'hs_note_body', operator: 'CONTAINS_TOKEN', value: 'QUOTE-SENT' },
      { propertyName: 'hs_timestamp', operator: 'GTE', value: scanCutoff },
    ])
  } catch (e) {
    return res.status(500).json({ error: 'HubSpot search failed: ' + e.message })
  }

  for (const note of notes) {
    const parsed = parseQuoteNote(note.properties?.hs_note_body || '')
    if (!parsed) continue
    results.scanned++
    const contactId = await noteContactId(note.id)
    if (!contactId) continue
    const allNotes = await notesForContact(contactId)
    const ageMs = now - (parsed.sentAt ? parsed.sentAt.getTime() : now)

    // Skip if already terminal
    if (hasDeadFlag(allNotes, parsed.jti)) { results.skipped_dead++; continue }
    if (hasMarkerForJti(allNotes, '[QUOTE-PAID]', parsed.jti)) continue
    if (hasMarkerForJti(allNotes, '[QUOTE-LOST]', parsed.jti)) continue

    // Engagement check (Stripe)
    if (paidSet.has(parsed.jti)) {
      await addNote(contactId, `[QUOTE-PAID] jti=${parsed.jti} confirmed=${new Date().toISOString()}`)
      results.paid_marked++
      continue
    }

    // T+14d → LOST
    if (ageMs >= T14D) {
      await addNote(contactId, `[QUOTE-LOST] jti=${parsed.jti} no_engagement_after_14d=${new Date().toISOString()}`)
      results.lost_marked++
      continue
    }

    // T+7d → COLD (admin alert)
    if (ageMs >= T7D && !hasMarkerForJti(allNotes, '[QUOTE-COLD]', parsed.jti)) {
      try {
        await sendT7dAdminAlert({
          customerName: '', customerEmail: parsed.email,
          quoteUrl: parsed.url, amountDue: parsed.amount, jti: parsed.jti,
        })
        await addNote(contactId, `[QUOTE-COLD] jti=${parsed.jti} admin_alerted=${new Date().toISOString()}`)
        results.cold_marked++
      } catch (e) {
        results.errors.push(`cold ${parsed.jti}: ${e.message.slice(0, 80)}`)
      }
      continue
    }

    // T+48h → customer follow-up
    if (ageMs >= T48 && !hasMarkerForJti(allNotes, '[QUOTE-FOLLOWUP-T48]', parsed.jti)) {
      try {
        await sendT48Email({
          to: parsed.email, customerName: '',
          quoteUrl: parsed.url, amountDue: parsed.amount,
        })
        await addNote(contactId, `[QUOTE-FOLLOWUP-T48] jti=${parsed.jti} sent=${new Date().toISOString()}`)
        results.t48_sent++
      } catch (e) {
        results.errors.push(`t48 ${parsed.jti}: ${e.message.slice(0, 80)}`)
      }
    }
  }

  res.status(200).json(results)
}
