const { getSessionFromRequest } = require('../../../lib/auth')
const { getUpcomingBookingsForEmail, getPastBookingsForEmail } = require('../../../lib/gcal')

export default async function handler(req, res) {
  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })

  const [upcoming, past] = await Promise.all([
    getUpcomingBookingsForEmail(session.email, 10),
    getPastBookingsForEmail(session.email, 5),
  ])

  res.status(200).json({ upcoming, past })
}
