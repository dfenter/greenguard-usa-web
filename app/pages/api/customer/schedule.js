const { getSessionFromRequest } = require('../../../lib/auth')
const { getBookingsForEmail } = require('../../../lib/calcom')

export default async function handler(req, res) {
  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })

  const afterDate = new Date().toISOString()
  const bookings = await getBookingsForEmail(session.email, afterDate)

  res.status(200).json({
    upcoming: bookings
      .filter((b) => b.status === 'ACCEPTED')
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
      .slice(0, 10)
      .map((b) => ({
        uid: b.uid,
        title: b.title,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        location: b.location,
      })),
  })
}
