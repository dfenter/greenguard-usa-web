const { Resend } = require('resend')

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.PORTAL_FROM_EMAIL || 'noreply@greenguard-usa.com'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.greenguard-usa.com'

/**
 * Send a magic login link to the given email.
 */
async function sendMagicLink(email, token) {
  const link = `${APP_URL}/auth/verify?token=${encodeURIComponent(token)}`

  return resend.emails.send({
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
}

module.exports = { sendMagicLink }
