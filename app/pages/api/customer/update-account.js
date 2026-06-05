import { getSessionFromRequest } from '../../../lib/auth'
import { findContactByEmail, updateContact } from '../../../lib/hubspot'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })

  const { firstName, lastName, phone, address } = req.body || {}

  // Basic validation
  if (firstName && firstName.length > 100) return res.status(400).json({ error: 'Name too long' })
  if (phone && !/^[\d\s\-\+\(\)\.]{7,20}$/.test(phone)) return res.status(400).json({ error: 'Invalid phone' })

  try {
    const contact = await findContactByEmail(session.email)
    if (!contact) return res.status(404).json({ error: 'Account not found' })

    await updateContact(contact.id, {
      properties: {
        ...(firstName !== undefined && { firstname: firstName.trim() }),
        ...(lastName  !== undefined && { lastname:  lastName.trim()  }),
        ...(phone     !== undefined && { phone:     phone.trim()     }),
        ...(address   !== undefined && { address:   address.trim()   }),
      },
    })

    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('update-account error:', e.message)
    return res.status(500).json({ error: 'Failed to update account' })
  }
}
