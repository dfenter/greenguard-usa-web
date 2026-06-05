const { Resend } = require('resend')

const FROM = process.env.PORTAL_FROM_EMAIL || 'noreply@greenguard-usa.com'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'

function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }
  return String(str ?? '').replace(/[&<>"']/g, (c) => map[c])
}

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set')
  return new Resend(process.env.RESEND_API_KEY)
}

/**
 * Send a magic login link to the given email.
 */
async function sendMagicLink(email, token) {
  const link = `${APP_URL}/auth/verify?token=${encodeURIComponent(token)}`
  try {
  return await getResend().emails.send({
    from: `GreenGuard USA <${FROM}>`,
    to: email,
    subject: 'Your GreenGuard login link',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#1a2e1f;border-radius:12px;color:#d4e6ca;">
        <h2 style="color:#7dffaa;font-size:1.4rem;margin:0 0 16px;">Sign in to GreenGuard</h2>
        <p style="margin:0 0 24px;line-height:1.6;color:rgba(212,230,202,0.8);">
          Click the button below to sign in. This link expires in 15 minutes.
        </p>
        <a href="${link}"
           style="display:inline-block;background:#c9a84c;color:#0d1a10;font-weight:700;
                  font-size:0.95rem;padding:14px 28px;border-radius:4px;text-decoration:none;">
          Sign In to My Account
        </a>
        <p style="margin:24px 0 0;font-size:0.82rem;color:rgba(212,230,202,0.45);">
          If you didn't request this link, you can safely ignore this email.
        </p>
      </div>
    `,
  })
  } catch (e) {
    console.error('sendMagicLink failed:', e.message)
    return { ok: false, error: e.message }
  }
}

/**
 * Post-purchase welcome email for new quote customers.
 * Includes a magic login link so they can access their account immediately.
 */
async function sendWelcomeEmail({ email, customerName, magicLink, calLink }) {
  try {
  const name = customerName ? customerName.split(' ')[0] : 'there'
  const bookingUrl = calLink || 'https://cal.com/greenguard-usa/property-assessment'

  return getResend().emails.send({
    from: `GreenGuard USA <${FROM}>`,
    to: email,
    subject: "Welcome to GreenGuard — here's what's next",
    html: `
      <div style="font-family:-apple-system,Nunito Sans,sans-serif;max-width:560px;margin:0 auto;background:#0d1a10;color:#d4e6ca;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#1a2e1f,#243627);padding:32px 28px 20px;">
          <div style="font-weight:900;font-size:1.2rem;letter-spacing:-0.02em;margin-bottom:4px;">Green<span style="color:#7dffaa;">Guard</span> USA</div>
          <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:rgba(212,230,202,0.4);">Welcome to the family</div>
        </div>
        <div style="padding:28px;">
          <h1 style="color:#7dffaa;font-size:1.3rem;font-weight:900;margin:0 0 16px;">Hey ${escapeHtml(name)}, payment confirmed!</h1>
          <p style="color:rgba(212,230,202,0.75);line-height:1.7;margin:0 0 24px;">Your GreenGuard service is set up. Here's exactly what happens next.</p>

          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(122,171,130,0.15);border-radius:10px;padding:18px 20px;margin-bottom:16px;">
            <div style="font-weight:800;color:#c9a84c;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Step 1 — Book your installation</div>
            <p style="color:rgba(212,230,202,0.7);font-size:0.88rem;line-height:1.6;margin:0 0 14px;">Pick a time and we'll come out to install your trap(s), set up CO₂, and walk you through everything. Takes about an hour.</p>
            <a href="${bookingUrl}" style="display:inline-block;background:#c9a84c;color:#0d1a10;font-weight:800;font-size:0.88rem;padding:11px 24px;border-radius:7px;text-decoration:none;">Book Installation Time →</a>
          </div>

          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(122,171,130,0.15);border-radius:10px;padding:18px 20px;margin-bottom:16px;">
            <div style="font-weight:800;color:#c9a84c;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Step 2 — Sign in to your account</div>
            <p style="color:rgba(212,230,202,0.7);font-size:0.88rem;line-height:1.6;margin:0 0 14px;">View your service history, upcoming visits, and equipment details. Your account is ready — click below to sign in (no password needed).</p>
            <a href="${magicLink}" style="display:inline-block;background:#1a2e1f;border:1px solid rgba(125,255,170,0.3);color:#7dffaa;font-weight:800;font-size:0.88rem;padding:11px 24px;border-radius:7px;text-decoration:none;">Sign In to My Account →</a>
            <div style="margin-top:8px;font-size:0.75rem;color:rgba(212,230,202,0.3);">Link expires in 15 minutes. Request a new one anytime at portal.greenguard-usa.com</div>
          </div>

          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(122,171,130,0.15);border-radius:10px;padding:18px 20px;margin-bottom:24px;">
            <div style="font-weight:800;color:#c9a84c;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Step 3 — Results in 6–8 weeks</div>
            <p style="color:rgba(212,230,202,0.7);font-size:0.88rem;line-height:1.6;margin:0;">Most customers notice a significant reduction in bites within 2–4 weeks. Maximum effectiveness at 6–8 weeks as the local population drops. The trap runs 24/7 — you don't have to do anything.</p>
          </div>

          <p style="color:rgba(212,230,202,0.45);font-size:0.82rem;line-height:1.6;margin:0 0 8px;">Questions? Reply to this email or call/text <a href="tel:+15125604129" style="color:rgba(212,230,202,0.6);">512-560-4129</a>.</p>
          <p style="color:rgba(212,230,202,0.25);font-size:0.75rem;margin:0;">© 2026 GreenGuard USA · Austin, TX</p>
        </div>
      </div>
    `,
  })
  } catch (e) {
    console.error('sendWelcomeEmail failed:', e.message)
    return { ok: false, error: e.message }
  }
}

module.exports = { sendMagicLink, sendWelcomeEmail, escapeHtml }
