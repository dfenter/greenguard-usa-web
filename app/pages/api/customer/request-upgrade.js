// POST /api/customer/request-upgrade
// Customer submits an upgrade request. Sends an email to admin and logs a
// HubSpot note. No Stripe changes — admin reviews on the client detail page and
// bills any upgrade through the normal invoice flow (no subscriptions, policy).

const { getSessionFromRequest } = require('../../../lib/auth')
const { findContactByEmail, addNote } = require('../../../lib/hubspot')
const { Resend } = require('resend')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'
const FROM = process.env.PORTAL_FROM_EMAIL || 'noreply@greenguard-usa.com'

function fmt$(n) { return `$${Number(n).toFixed(2)}` }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })

  const { upgradeId, upgradeTitle, monthlyDelta, oneTime = [] } = req.body || {}
  if (!upgradeId || !upgradeTitle) return res.status(400).json({ error: 'upgradeId and upgradeTitle required' })

  const contact = await findContactByEmail(session.email).catch(() => null)
  const p = contact?.properties || {}
  const customerName = [p.firstname, p.lastname].filter(Boolean).join(' ') || session.email
  const systemType = p.system_type || 'unknown'
  const trapCount  = p.trap_count  || '1'

  const totalOneTime = (oneTime || []).reduce((s, x) => s + (x.amount || 0), 0)
  const oneTimeLines = (oneTime || []).map(l => `<tr><td style="padding:6px 0;color:rgba(212,230,202,0.7);font-size:0.88rem;">${l.label}</td><td style="padding:6px 0;font-weight:700;color:#5bc4ff;text-align:right;">${fmt$(l.amount)}</td></tr>`).join('')

  // ── Email admin ───────────────────────────────────────────────────────────
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: `GreenGuard Portal <${FROM}>`,
      to: ADMIN_EMAIL,
      subject: `Upgrade Request: ${customerName} — ${upgradeTitle}`,
      html: `
        <div style="font-family:'Inter',sans-serif;max-width:560px;margin:0 auto;background:#0d1a10;color:#d4e6ca;border-radius:12px;overflow:hidden;">
          <div style="background:#0a1a0d;padding:20px 28px;border-bottom:1px solid rgba(122,171,130,0.2);">
            <div style="font-weight:900;font-size:1.05rem;">Green<span style="color:#7dffaa;">Guard</span> USA</div>
            <div style="font-size:0.65rem;letter-spacing:0.12em;text-transform:uppercase;color:rgba(212,230,202,0.35);margin-top:2px;">Customer Upgrade Request</div>
          </div>
          <div style="padding:28px;">
            <h2 style="color:#7dffaa;margin:0 0 4px;font-size:1.25rem;">New upgrade request</h2>
            <p style="color:rgba(212,230,202,0.5);margin:0 0 24px;font-size:0.88rem;">A customer has requested an upgrade from their dashboard.</p>

            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
              <tr><td style="padding:8px 0;color:rgba(212,230,202,0.5);font-size:0.82rem;width:130px;">Customer</td><td style="padding:8px 0;font-weight:700;">${customerName}</td></tr>
              <tr><td style="padding:8px 0;color:rgba(212,230,202,0.5);font-size:0.82rem;">Email</td><td style="padding:8px 0;font-weight:700;"><a href="mailto:${session.email}" style="color:#7dffaa;">${session.email}</a></td></tr>
              <tr><td style="padding:8px 0;color:rgba(212,230,202,0.5);font-size:0.82rem;">Current system</td><td style="padding:8px 0;font-weight:700;">${systemType} (${trapCount} trap${trapCount === '1' ? '' : 's'})</td></tr>
              <tr><td style="padding:8px 0;color:rgba(212,230,202,0.5);font-size:0.82rem;">Requested upgrade</td><td style="padding:8px 0;font-weight:800;color:#d4e6ca;">${upgradeTitle}</td></tr>
              <tr><td style="padding:8px 0;color:rgba(212,230,202,0.5);font-size:0.82rem;">Monthly increase</td><td style="padding:8px 0;font-weight:900;color:#7dffaa;font-size:1.05rem;">+${fmt$(monthlyDelta)}/mo</td></tr>
            </table>

            ${totalOneTime > 0 ? `
            <div style="background:rgba(91,196,255,0.06);border:1px solid rgba(91,196,255,0.2);border-radius:8px;padding:16px 20px;margin-bottom:20px;">
              <div style="font-size:0.65rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:rgba(91,196,255,0.7);margin-bottom:10px;">One-Time at First Visit</div>
              <table style="width:100%;border-collapse:collapse;">${oneTimeLines}</table>
              <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(91,196,255,0.15);display:flex;justify-content:space-between;">
                <span style="font-weight:700;color:rgba(212,230,202,0.6);">Total one-time</span>
                <span style="font-weight:900;color:#5bc4ff;">${fmt$(totalOneTime)}</span>
              </div>
            </div>
            ` : ''}

            <a href="https://portal.greenguard-usa.com/admin/clients/${encodeURIComponent(session.email)}"
               style="display:inline-block;background:linear-gradient(135deg,#7dffaa,#4dd98a);color:#0d1a10;font-weight:900;font-size:0.9rem;padding:13px 24px;border-radius:8px;text-decoration:none;margin-bottom:8px;">
              Review in Admin →
            </a>
            <br>
            <a href="https://portal.greenguard-usa.com/admin/clients/${encodeURIComponent(session.email)}"
               style="display:inline-block;color:rgba(212,230,202,0.45);font-size:0.8rem;text-decoration:none;margin-top:4px;">
              View customer profile
            </a>
          </div>
          <div style="padding:16px 28px;border-top:1px solid rgba(122,171,130,0.12);font-size:0.72rem;color:rgba(212,230,202,0.25);">
            GreenGuard USA · Austin TX · No charges have been made. This is a request only.
          </div>
        </div>
      `,
    })
  } catch (e) {
    console.error('request-upgrade email error:', e.message)
  }

  // ── Customer confirmation email ───────────────────────────────────────────
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const firstName = customerName.split(' ')[0] || 'there'
    await resend.emails.send({
      from: `GreenGuard USA <${FROM}>`,
      to: session.email,
      subject: `Your upgrade request is confirmed — ${upgradeTitle}`,
      html: `
        <div style="font-family:'Inter',sans-serif;max-width:520px;margin:0 auto;background:#0d1a10;color:#d4e6ca;border-radius:12px;overflow:hidden;">
          <div style="background:#0a1a0d;padding:20px 28px;border-bottom:1px solid rgba(122,171,130,0.2);">
            <div style="font-weight:900;font-size:1.05rem;">Green<span style="color:#7dffaa;">Guard</span> USA</div>
          </div>
          <div style="padding:28px;">
            <h2 style="color:#d4e6ca;margin:0 0 8px;font-size:1.2rem;">Hi ${firstName}, we got your request!</h2>
            <p style="color:rgba(212,230,202,0.6);margin:0 0 20px;font-size:0.9rem;">
              We've received your upgrade request and will reach out within 1 business day to schedule and confirm.
            </p>
            <div style="background:rgba(125,255,170,0.06);border:1px solid rgba(125,255,170,0.2);border-radius:8px;padding:16px 20px;margin-bottom:20px;">
              <div style="font-size:0.7rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:rgba(212,230,202,0.4);margin-bottom:8px;">Requested upgrade</div>
              <div style="font-weight:900;font-size:1rem;margin-bottom:4px;">${upgradeTitle}</div>
              <div style="font-size:0.88rem;color:rgba(212,230,202,0.6);">+${fmt$(monthlyDelta)}/month${totalOneTime > 0 ? ` · ${fmt$(totalOneTime)} one-time at first visit` : ''}</div>
            </div>
            <p style="color:rgba(212,230,202,0.45);font-size:0.82rem;margin:0;">
              No charges until your upgrade is installed. Questions? Reply to this email or call <a href="tel:5125604129" style="color:#7dffaa;">512-560-4129</a>.
            </p>
          </div>
          <div style="padding:14px 28px;border-top:1px solid rgba(122,171,130,0.12);font-size:0.72rem;color:rgba(212,230,202,0.25);">
            GreenGuard USA · Austin TX
          </div>
        </div>
      `,
    })
  } catch (e) {
    console.error('upgrade confirmation email error:', e.message)
  }

  // ── HubSpot note ─────────────────────────────────────────────────────────
  if (contact?.id) {
    await addNote(
      contact.id,
      `[UPGRADE REQUEST] ${upgradeTitle} — +${fmt$(monthlyDelta)}/mo${totalOneTime > 0 ? ` + ${fmt$(totalOneTime)} one-time` : ''}. Requested via customer dashboard.`
    ).catch(() => {})
  }

  return res.status(200).json({ ok: true })
}
