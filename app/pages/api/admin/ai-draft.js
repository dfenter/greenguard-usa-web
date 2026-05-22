const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { draftVisitEmail, draftBusinessPost, draftUpsellMessage } = require('../../../lib/gemini')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { type, ...data } = req.body || {}

  try {
    let result
    if (type === 'visit-email') result = await draftVisitEmail(data)
    else if (type === 'gbp-post') result = await draftBusinessPost(data.topic)
    else if (type === 'upsell') result = await draftUpsellMessage(data)
    else return res.status(400).json({ error: 'Unknown type' })
    res.status(200).json({ text: result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
