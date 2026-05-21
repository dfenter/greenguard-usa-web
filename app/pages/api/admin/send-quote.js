const { getSessionFromRequest } = require('../../../lib/auth')
const { sendQuote } = require('../../../lib/email')
const { SKU_PRICES } = require('../../../lib/sku-engine')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = await getSessionFromRequest(req)
  if (!session || session.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { email, name, items = [] } = req.body || {}
  if (!email) return res.status(400).json({ error: 'email required' })
  if (!items.length) return res.status(400).json({ error: 'items required' })

  const monthlyTotal = items.filter((i) => i.recurring).reduce((s, i) => s + (i.price || 0), 0)
  const oneTimeTotal = items.filter((i) => !i.recurring).reduce((s, i) => s + (i.price || 0), 0)
  const firstServiceTotal = monthlyTotal + oneTimeTotal

  const rows = items.map((item) => `
    <tr>
      <td style="padding:8px 16px 8px 0;color:rgba(212,230,202,0.85);">${item.label}</td>
      <td style="padding:8px 0;text-align:right;font-weight:700;color:#c9a84c;white-space:nowrap;">$${(item.price || 0).toFixed(2)}${item.recurring ? '/mo' : ''}</td>
    </tr>`).join('')

  const quoteHtml = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      ${rows}
    </table>
    <div style="border-top:1px solid rgba(122,171,130,0.2);padding-top:12px;">
      ${monthlyTotal > 0 ? `<div style="display:flex;justify-content:space-between;font-size:0.88rem;margin-bottom:4px;"><span style="color:rgba(212,230,202,0.6);">Monthly recurring</span><span style="font-weight:700;">$${monthlyTotal.toFixed(2)}/mo</span></div>` : ''}
      ${oneTimeTotal > 0 ? `<div style="display:flex;justify-content:space-between;font-size:0.88rem;margin-bottom:4px;"><span style="color:rgba(212,230,202,0.6);">One-time at first service</span><span style="font-weight:700;">$${oneTimeTotal.toFixed(2)}</span></div>` : ''}
      <div style="border-top:1px solid rgba(122,171,130,0.2);margin-top:10px;padding-top:10px;display:flex;justify-content:space-between;font-weight:900;font-size:1rem;">
        <span>Total due at first service</span>
        <span style="color:#7dffaa;">$${firstServiceTotal.toFixed(2)}</span>
      </div>
    </div>
  `

  try {
    await sendQuote(email, name, quoteHtml)
    res.status(200).json({ sent: true })
  } catch (err) {
    console.error('send-quote error:', err)
    res.status(500).json({ error: 'Failed to send quote' })
  }
}
