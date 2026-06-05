const { upsertContact } = require('../../../lib/hubspot')

const ALLOWED_ORIGINS = [
  'https://www.greenguard-usa.com',
  'https://greenguard-usa.com',
  'https://new.greenguard-usa.com',
]

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { email, firstName, source = 'website' } = req.body || {}
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' })
  }

  try {
    await upsertContact({ email, firstName: firstName || '', source })
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('subscribe error:', err.message)
    return res.status(500).json({ error: 'Failed to save' })
  }
}
