/**
 * POST /api/admin/send-message
 * Send a freeform email to a customer from either admin.
 * Body: { to, toName, subject, body }
 */
const { getSessionFromRequest, isAdminEmail } = require('../../../lib/auth')
const { sendEmail, escapeHtml } = require('../../../lib/email')
const biz = require('../../../lib/business.config')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await getSessionFromRequest(req)
  if (!session || !isAdminEmail(session.email)) return res.status(403).json({ error: 'Forbidden' })

  const { to, toName, subject, body } = req.body || {}
  if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject, and body are required' })

  const htmlBody = escapeHtml(body).replace(/\n/g, '<br/>')

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f0f4f1;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f4f1">
<tr><td align="center" style="padding:32px 16px;">
  <table width="580" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;">
    <tr>
      <td align="center" bgcolor="#1a3320" style="border-radius:10px 10px 0 0;padding:24px 32px;">
        <p style="margin:0;font-size:20px;font-weight:900;color:#ffffff;font-family:Arial,sans-serif;">${biz.nameShort}</p>
        <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:#7dbc8a;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;">${biz.city}</p>
      </td>
    </tr>
    <tr>
      <td bgcolor="#ffffff" style="padding:32px;border-left:1px solid #dde8de;border-right:1px solid #dde8de;">
        <div style="font-size:15px;line-height:1.75;color:#3d4f41;font-family:Arial,sans-serif;">${htmlBody}</div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;border-top:1px solid #e8efe9;">
          <tr><td style="padding-top:16px;font-size:12px;color:#9aab9c;font-family:Arial,sans-serif;">
            Questions? Reply to this email or text us at <a href="tel:5125604129" style="color:#2d6a3f;font-weight:700;">${biz.phone}</a>.
          </td></tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center" bgcolor="#dde8de" style="border-radius:0 0 10px 10px;padding:18px 32px;border:1px solid #dde8de;border-top:0;">
        <p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#1a3320;font-family:Arial,sans-serif;">${biz.nameShort}</p>
        <p style="margin:0;font-size:11px;color:#4a6650;font-family:Arial,sans-serif;">${biz.city} &nbsp;&#183;&nbsp; ${biz.phone} &nbsp;&#183;&nbsp; <a href="https://www.greenguard-usa.com" style="color:#2d6a3f;">greenguard-usa.com</a></p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>`

  try {
    await sendEmail({ to, subject, html })
    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
