import { createHash } from 'node:crypto';

export const prerender = false;

function sha256hex(str) {
  return createHash('sha256').update((str || '').trim().toLowerCase()).digest('hex');
}

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  const m = raw.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

// Fire a server-side Meta CAPI Lead event with whatever attribution we can
// recover (fbp cookie, fbc cookie or rebuilt from fbclid, IP, user-agent).
async function fireMetaLead({ request, email, fbclid }) {
  const token = import.meta.env.META_SYSTEM_USER_TOKEN;
  const pixelId = import.meta.env.PUBLIC_FB_PIXEL_ID || '2225826221565752';
  if (!token || !email) return;
  const fbp = readCookie(request, '_fbp');
  const fbc = readCookie(request, '_fbc') || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : null);
  const userData = { em: [sha256hex(email)] };
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  if (ip) userData.client_ip_address = ip;
  const ua = request.headers.get('user-agent');
  if (ua) userData.client_user_agent = ua;
  // Stable per-email-per-day event_id so the client pixel Lead (if it also fires)
  // can be deduplicated by Meta rather than double-counted.
  const eventId = `lead_${sha256hex(email).slice(0, 16)}_${new Date().toISOString().slice(0, 10)}`;
  const body = {
    data: [{
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: 'https://www.greenguard-usa.com/book',
      event_id: eventId,
      user_data: userData,
      custom_data: { content_name: 'Property Assessment', value: 25, currency: 'USD' },
    }],
  };
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) console.error('[lead-capture] Meta CAPI Lead error:', await r.text());
  } catch (e) {
    console.error('[lead-capture] Meta CAPI Lead failed:', e.message);
  }
}

// Upload an offline "Booking Lead" conversion to Google Ads using the click's
// gclid, so MAXIMIZE_CONVERSIONS bidding (Local Service Austin) optimizes toward
// booked assessments instead of phone calls alone. Fetch-only, no googleapis dep.
async function fireGoogleAdsLead({ gclid }) {
  if (!gclid) return;
  const devToken = import.meta.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const customerId = import.meta.env.GOOGLE_ADS_CUSTOMER_ID;
  const conversionId = import.meta.env.GOOGLE_ADS_LEAD_CONVERSION_ID;
  const clientId = import.meta.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = import.meta.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = import.meta.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!devToken || !customerId || !conversionId || !clientId || !clientSecret || !refreshToken) return;
  try {
    // Refresh-token grant — the Google Ads OAuth creds carry the AdWords scope.
    const tokRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const tok = await tokRes.json();
    if (!tok.access_token) {
      console.error('[lead-capture] Google Ads token error:', JSON.stringify(tok).slice(0, 200));
      return;
    }
    const loginCid = import.meta.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || customerId;
    const body = {
      conversions: [{
        gclid,
        conversion_action: `customers/${customerId}/conversionActions/${conversionId}`,
        conversion_date_time: new Date().toISOString().replace('T', ' ').replace('Z', '+00:00'),
        conversion_value: 25,
        currency_code: 'USD',
      }],
      // `partialFailure` is the request field; `partialFailureError` is a response
      // field and the API hard-400s if sent in the request (silently killed uploads).
      partialFailure: true,
    };
    const r = await fetch(
      `https://googleads.googleapis.com/v25/customers/${customerId}:uploadClickConversions`,
      { method: 'POST', headers: {
        Authorization: `Bearer ${tok.access_token}`,
        'developer-token': devToken,
        'login-customer-id': loginCid,
        'Content-Type': 'application/json',
      }, body: JSON.stringify(body) }
    );
    const data = await r.json();
    if (data.partialFailureError) console.error('[lead-capture] Google Ads lead error:', JSON.stringify(data.partialFailureError).slice(0, 300));
    else console.log('[lead-capture] Google Ads lead uploaded');
  } catch (e) {
    console.error('[lead-capture] Google Ads lead failed:', e.message);
  }
}

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
  // This endpoint only serves the lead-magnet component (LeadCapture.astro),
  // which posts just { email }. Defaulting to a generic 'website' made every
  // lead-magnet signup indistinguishable from ordinary site traffic in HubSpot.
  const source     = typeof body.source === 'string'       ? body.source.trim().slice(0, 50) : 'website_lead_magnet';

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

  // Server-side Meta CAPI Lead event. The Lead-optimized campaigns were starved
  // of conversion signal (only the client pixel fired, inconsistently), so Meta
  // optimized toward cheap clicks. This gives it a reliable, deduplicated Lead.
  await fireMetaLead({ request, email: emailStr, fbclid });

  // Offline Google Ads lead — only for real bookings with an ad click, so the
  // signal stays high-intent and matches the "Booking Lead" conversion action.
  if (source === 'booking' && gclid) {
    await fireGoogleAdsLead({ gclid });
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
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#0d1a10;color:#d4e6ca;border-radius:12px;overflow:hidden;">
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
