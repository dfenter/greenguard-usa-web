const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { findContactByEmail, addNote, upsertContact } = require('../../../lib/hubspot')
const { logTankInventory } = require('../../../lib/gsheets')
const { Resend } = require('resend')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
const LOW_TANK_THRESHOLD = 5

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { date, fullStart, needed, delivered, fullEnd, deliveryTime, confirmed, notes } = req.body || {}

  // Tank logs are stored as Notes on the admin HubSpot contact. Auto-create if missing
  // so a fresh HubSpot instance / deleted admin contact doesn't break inventory saves.
  let contact = await findContactByEmail(ADMIN_EMAIL)
  if (!contact?.id) {
    try {
      const created = await upsertContact({
        email: ADMIN_EMAIL,
        name: 'GreenGuard Admin',
      })
      contact = { id: created.id }
    } catch (err) {
      console.error('save-inventory: failed to create admin HubSpot contact:', err.message)
      return res.status(500).json({ error: `Could not create admin HubSpot contact: ${err.message}` })
    }
  }

  const noteBody = `[TANK-LOG]${JSON.stringify({ date, fullStart, needed, delivered, fullEnd, deliveryTime, confirmed, notes })}`
  try {
    await addNote(contact.id, noteBody)
  } catch (err) {
    console.error('save-inventory: addNote failed:', err.message)
    return res.status(502).json({ error: `HubSpot note failed: ${err.message}` })
  }

  const lowStock = typeof fullEnd === 'number' && fullEnd < LOW_TANK_THRESHOLD
  const deficit = typeof needed === 'number' && typeof fullEnd === 'number' && needed > 0 && fullEnd < needed

  if ((lowStock || deficit) && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const subject = deficit
        ? `⚠️ Tank Deficit Alert — need ${needed - fullEnd} more tanks for ${date}`
        : `⚠️ CO₂ Tank Alert — only ${fullEnd} full tanks remaining`
      await resend.emails.send({
        from: process.env.PORTAL_FROM_EMAIL || 'noreply@greenguard-usa.com',
        to: ADMIN_EMAIL,
        subject,
        html: `<div style="font-family:sans-serif;max-width:480px;padding:24px;">
          <h2 style="color:#c9a84c;margin:0 0 12px;">CO₂ Tank Alert</h2>
          <p style="color:#555;">Date: <strong>${date}</strong></p>
          ${deficit ? `<p style="color:#c0392b;font-weight:700;">Deficit: ${needed - fullEnd} tanks short (need ${needed}, have ${fullEnd})</p>` : ''}
          <p style="color:#555;">Full tanks at depot: <strong>${fullEnd}</strong></p>
          ${delivered ? `<p style="color:#555;">Delivered today: ${delivered}</p>` : ''}
          ${notes ? `<p style="color:#777;">Notes: ${notes}</p>` : ''}
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'}/admin/inventory" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#1a2e1f;color:#7dffaa;border-radius:6px;text-decoration:none;font-weight:700;">View Inventory →</a>
        </div>`,
      })
    } catch (err) { console.error('tank alert email:', err.message) }
  }

  // Auto-export to Sheets
  try { await logTankInventory(req.body) } catch {}

  res.status(200).json({ ok: true, lowStock, deficit })
}
