const { getSessionFromRequest } = require('../../../lib/auth')
const { createBillingPortalSession } = require('../../../lib/stripe')

export default async function handler(req, res) {
  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })

  if (!session.stripeCustomerId) {
    return res.status(404).json({ error: 'No billing account found' })
  }

  const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`
  const url = await createBillingPortalSession(session.stripeCustomerId, returnUrl)
  res.redirect(url)
}
