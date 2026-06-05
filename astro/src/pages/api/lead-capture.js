export const prerender = false;

export const POST = async ({ request }) => {
  const hsToken = import.meta.env.HUBSPOT_ACCESS_TOKEN;
  if (!hsToken) {
    return new Response(JSON.stringify({ error: 'Not configured' }), { status: 500 });
  }

  const body = await request.json();
  const emailStr = typeof body.email === 'string' ? body.email.trim() : '';
  if (!emailStr || !emailStr.includes('@') || !emailStr.includes('.') || emailStr.length < 5 || emailStr.length > 254) {
    return new Response(JSON.stringify({ error: 'Invalid email' }), { status: 400 });
  }

  const referredBy = typeof body.referredBy === 'string' ? body.referredBy.trim().slice(0, 12) : null;
  const gclid     = typeof body.gclid === 'string'      ? body.gclid.trim().slice(0, 100) : null;
  const fbclid    = typeof body.fbclid === 'string'     ? body.fbclid.trim().slice(0, 100) : null;
  const utmSource  = typeof body.utm_source === 'string'   ? body.utm_source.trim().slice(0, 100) : null;
  const utmMedium  = typeof body.utm_medium === 'string'   ? body.utm_medium.trim().slice(0, 100) : null;
  const utmCampaign= typeof body.utm_campaign === 'string' ? body.utm_campaign.trim().slice(0, 100) : null;
  const source     = typeof body.source === 'string'       ? body.source.trim().slice(0, 50) : 'website';

  const properties = { email: emailStr, hs_lead_status: 'NEW', lead_source: source };
  if (referredBy) properties.referred_by = referredBy;
  if (gclid)      properties.gclid = gclid;
  if (fbclid)     properties.fbclid = fbclid;
  if (utmSource)  properties.utm_source = utmSource;
  if (utmMedium)  properties.utm_medium = utmMedium;
  if (utmCampaign)properties.utm_campaign = utmCampaign;

  // Save to HubSpot (409 = contact already exists, treat as success)
  const hsRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hsToken}` },
    body: JSON.stringify({ properties }),
  });

  if (!hsRes.ok && hsRes.status !== 409) {
    return new Response(JSON.stringify({ error: 'Failed to save' }), { status: 500 });
  }

  // Send lead magnet guide email if this came from the popup (not a booking)
  if (source !== 'booking' && import.meta.env.RESEND_API_KEY) {
    const guideHtml = buildGuideEmail(emailStr);
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `GreenGuard USA <${import.meta.env.PORTAL_FROM_EMAIL || 'noreply@greenguard-usa.com'}>`,
        to: emailStr,
        subject: 'Your Austin Mosquito Season Guide',
        html: guideHtml,
      }),
    }).catch(() => {});
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};

function buildGuideEmail(email) {
  return `
<div style="font-family:-apple-system,Nunito Sans,sans-serif;max-width:560px;margin:0 auto;background:#0d1a10;color:#d4e6ca;border-radius:12px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#1a2e1f,#243627);padding:32px 28px 24px;">
    <div style="font-weight:900;font-size:1.2rem;letter-spacing:-0.02em;margin-bottom:4px;">Green<span style="color:#7dffaa;">Guard</span> USA</div>
    <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:rgba(212,230,202,0.4);">Austin Mosquito Season Guide</div>
  </div>
  <div style="padding:28px;">
    <h1 style="color:#7dffaa;font-size:1.4rem;font-weight:900;margin:0 0 20px;line-height:1.3;">Everything you need to know before mosquito season hits Austin</h1>

    <h2 style="color:#c9a84c;font-size:0.88rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;margin:24px 0 10px;">When does mosquito season actually start?</h2>
    <p style="color:rgba(212,230,202,0.8);line-height:1.7;font-size:0.92rem;margin:0 0 12px;">Austin's season starts earlier than most people expect — typically <strong style="color:#d4e6ca;">late February to early March</strong> when nighttime temps stay above 50°F. Peak pressure runs May through September, with a second surge after fall rains in October. Most homeowners wait until June to act, which means they miss 2–3 months of prime season.</p>

    <h2 style="color:#c9a84c;font-size:0.88rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;margin:24px 0 10px;">Where to place traps for maximum catch</h2>
    <p style="color:rgba(212,230,202,0.8);line-height:1.7;font-size:0.92rem;margin:0 0 12px;">CO₂ traps work by intercepting mosquitoes upwind of where people gather. The three rules:</p>
    <ul style="color:rgba(212,230,202,0.8);line-height:1.8;font-size:0.92rem;padding-left:20px;margin:0 0 12px;">
      <li><strong style="color:#d4e6ca;">Upwind from your patio</strong> — mosquitoes fly into the wind toward CO₂. Place the trap so they hit it before reaching you.</li>
      <li><strong style="color:#d4e6ca;">Near standing water or dense vegetation</strong> — that's where they breed and rest. 20–30 ft from the source is ideal.</li>
      <li><strong style="color:#d4e6ca;">Not next to competing CO₂ sources</strong> — don't place near gas grills or HVAC exhausts. They'll confuse the attractant signal.</li>
    </ul>

    <h2 style="color:#c9a84c;font-size:0.88rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;margin:24px 0 10px;">What to expect in weeks 1–8</h2>
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(122,171,130,0.15);border-radius:10px;padding:16px 20px;margin-bottom:12px;">
      <div style="font-weight:800;color:#7dffaa;margin-bottom:6px;">Weeks 1–2: Capture begins</div>
      <div style="color:rgba(212,230,202,0.7);font-size:0.88rem;line-height:1.6;">The trap catches mosquitoes immediately but population pressure hasn't dropped yet. You may still notice bites — this is normal. The trap is intercepting adults before they reach you.</div>
    </div>
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(122,171,130,0.15);border-radius:10px;padding:16px 20px;margin-bottom:12px;">
      <div style="font-weight:800;color:#7dffaa;margin-bottom:6px;">Weeks 3–4: Noticeable reduction</div>
      <div style="color:rgba(212,230,202,0.7);font-size:0.88rem;line-height:1.6;">Most customers see a meaningful drop in bites. The breeding cycle (10–14 days egg to adult) means the trap has interrupted 1–2 full generations.</div>
    </div>
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(122,171,130,0.15);border-radius:10px;padding:16px 20px;margin-bottom:20px;">
      <div style="font-weight:800;color:#7dffaa;margin-bottom:6px;">Weeks 6–8: Maximum effectiveness</div>
      <div style="color:rgba(212,230,202,0.7);font-size:0.88rem;line-height:1.6;">Population suppression is measurable. Studies show 93% bite reduction at 6–8 weeks of continuous operation. Your yard is genuinely different — not just managed.</div>
    </div>

    <div style="text-align:center;margin:28px 0;">
      <a href="https://www.greenguard-usa.com/book" style="display:inline-block;background:#c9a84c;color:#0d1a10;font-weight:900;font-size:0.95rem;padding:14px 32px;border-radius:8px;text-decoration:none;">Book Your Free Property Assessment →</a>
    </div>
    <p style="color:rgba(212,230,202,0.35);font-size:0.75rem;text-align:center;margin:0;">© 2026 GreenGuard USA · Austin, TX · <a href="https://www.greenguard-usa.com" style="color:rgba(212,230,202,0.35);">greenguard-usa.com</a></p>
  </div>
</div>`;
}
