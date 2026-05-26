/**
 * POST /api/admin/import-csv
 * Reads list(6).csv and:
 * 1. Upserts each contact into HubSpot
 * 2. Creates a Stripe customer if they don't already have one (matched by email)
 */
const { requireOwner, escapeStripeSearch } = require('../../../lib/auth')
const { Client } = require('@hubspot/api-client')
const { stripe } = require('../../../lib/stripe')
const fs = require('fs')
const path = require('path')

function parseCSV(content) {
  const lines = content.split('\n').filter((l) => l.trim())
  const headers = lines[0].replace(/"/g, '').split(',')
  return lines.slice(1).map((line) => {
    const cols = []
    let current = ''
    let inQuote = false
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue }
      if (ch === ',' && !inQuote) { cols.push(current.trim()); current = ''; continue }
      current += ch
    }
    cols.push(current.trim())
    const row = {}
    headers.forEach((h, i) => { row[h.trim()] = (cols[i] || '').trim() })
    return row
  }).filter((r) => r['Email'] || r['First Name'])
}

function cleanPhone(raw) {
  if (!raw) return ''
  return raw.replace(/^'+/, '').replace(/\D/g, '').replace(/^1/, '')
    .replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')
}

function extractAddress(notes) {
  if (!notes) return ''
  const match = notes.match(/^(\d+\s[^,\n]+(?:,[^,\n]+){1,3}(?:,\s*\w{2}\s*\d{5})?)/i)
  return match ? match[1].trim().replace(/\n/g, ' ') : notes.split('\n')[0].trim().slice(0, 100)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await requireOwner(req, res)
  if (!session) return

  const csvPath = path.join(process.cwd(), '..', 'list(6).csv')
  if (!fs.existsSync(csvPath)) return res.status(404).json({ error: 'CSV not found at repo root' })

  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'))
  const hubspot = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN })

  const results = { hubspot: { created: 0, updated: 0 }, stripe: { updated: 0, skipped: 0, noMatch: 0 }, errors: [] }

  for (const row of rows) {
    const email = row['Email']?.toLowerCase().trim()
    const firstName = row['First Name'] || ''
    const lastName = row['Last Name'] || ''
    const phone = cleanPhone(row['Phone'])
    const address = extractAddress(row['Notes'] || '')
    const fullName = `${firstName} ${lastName}`.trim()

    // ── HubSpot upsert ──────────────────────────────────────────────
    try {
      const hsProps = {
        ...(firstName && { firstname: firstName }),
        ...(lastName && { lastname: lastName }),
        ...(phone && { phone }),
        ...(address && { address }),
        ...(email && { email }),
      }

      if (email) {
        const search = await hubspot.crm.contacts.searchApi.doSearch({
          filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
          limit: 1,
        })
        if (search.results.length > 0) {
          await hubspot.crm.contacts.basicApi.update(search.results[0].id, { properties: hsProps })
          results.hubspot.updated++
        } else {
          await hubspot.crm.contacts.basicApi.create({ properties: hsProps })
          results.hubspot.created++
        }
      } else {
        await hubspot.crm.contacts.basicApi.create({ properties: hsProps })
        results.hubspot.created++
      }
    } catch (err) {
      results.errors.push(`HubSpot ${fullName}: ${err.message.slice(0, 80)}`)
    }

    // ── Stripe update only — fill in missing fields, never create ──
    if (email) {
      try {
        const existing = await stripe.customers.search({ query: `email:"${escapeStripeSearch(email)}"`, limit: 1 })
        if (existing.data.length > 0) {
          const cust = existing.data[0]
          const updates = {}
          if (!cust.name && fullName)    updates.name    = fullName
          if (!cust.phone && phone)      updates.phone   = phone
          if (!cust.address?.line1 && address) updates.address = { line1: address }
          if (Object.keys(updates).length > 0) {
            await stripe.customers.update(cust.id, updates)
            results.stripe.updated++
          } else {
            results.stripe.skipped++ // already has all info
          }
        } else {
          results.stripe.noMatch++ // not in Stripe — skip, do not create
        }
      } catch (err) {
        results.errors.push(`Stripe ${email}: ${err.message.slice(0, 80)}`)
      }
    }

    // Rate limit: ~8 req/sec to stay well within Stripe and HubSpot limits
    await new Promise((r) => setTimeout(r, 125))
  }

  res.status(200).json({ total: rows.length, ...results })
}
