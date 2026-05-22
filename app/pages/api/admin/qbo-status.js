/**
 * GET /api/admin/qbo-status
 * Returns QBO connection status and recent invoices
 */
const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const qbo = require('../../../lib/qbo')

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  if (!process.env.QBO_CLIENT_ID || !process.env.QBO_REFRESH_TOKEN || !process.env.QBO_REALM_ID) {
    return res.status(200).json({ configured: false })
  }

  try {
    const recentInvoices = await qbo.getRecentInvoices(15)
    return res.status(200).json({ configured: true, recentInvoices })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
