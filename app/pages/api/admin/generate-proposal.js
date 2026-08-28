// POST /api/admin/generate-proposal
//
// Body:
//   propertyName   string  (e.g. "Domain Apartments")
//   address        string  (full address)
//   propertyType   string  (e.g. "apartment complex", "HOA", "restaurant patio")
//   units          number? (apartments) or sqft for non-residential
//   contactName    string?
//   contactEmail   string?
//   notes          string? (any specifics admin wants to include)
//   monthlyBudget  number? (anchor pricing)
//
// Returns: { url, htmlPreview }
// The proposal is rendered to HTML, uploaded to Vercel Blob with a publicly
// accessible URL, and the URL is returned for sharing. Customer opens link
// in their browser; no PDF dependency.

const { requireOwner } = require('../../../lib/auth')
const { generateJSON } = require('../../../lib/gemini')
const { put } = require('@vercel/blob')
const biz = require('../../../lib/business.config')

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;'}[c]))
}

function fmt$(n) { return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` }

// Suggest config based on property type + size. Returns trap count, monthly $.
function suggestConfig({ propertyType, units }) {
  const type = (propertyType || '').toLowerCase()
  if (type.includes('apartment') || type.includes('hoa') || type.includes('condo')) {
    const u = Number(units) || 50
    // 1 trap per 30 units, min 4 max 20
    const traps = Math.max(4, Math.min(20, Math.ceil(u / 30)))
    return { traps, monthly: 160 * traps - (traps > 4 ? 200 : 0) }
  }
  if (type.includes('restaurant') || type.includes('patio') || type.includes('bar')) {
    return { traps: 3, monthly: 480 }
  }
  if (type.includes('event') || type.includes('venue')) {
    return { traps: 6, monthly: 960 }
  }
  return { traps: 4, monthly: 640 }
}

async function generateProposalCopy({ propertyName, propertyType, units, notes, suggested }) {
  const fallback = {
    coverHeadline: `Mosquito Control Proposal — ${propertyName}`,
    siteOverview: `${propertyName} is a ${propertyType || 'commercial property'} in Austin. Our CO₂-based trap system will reduce mosquito populations without spraying pesticides, keeping residents and guests comfortable through Austin's long mosquito season.`,
    whyCO2: `Traditional spraying kills mosquitoes for a few days then needs reapplication, with overspray that affects beneficial insects, pets, and people. Our Biogents traps use a continuous low-volume CO₂ lure (no smell, no spray) to draw mosquitoes in, where they die in the collection chamber. Each trap covers roughly 1/2 acre.`,
    keyBenefits: [
      `No spraying — safe for residents, pets, and pollinators`,
      `Continuous protection, not just after a service visit`,
      `Discreet trap units placed in landscaped zones`,
      `Monthly tank exchange handled by us — no work for property staff`,
    ],
    serviceInclusions: [
      `Initial site walk-through and trap placement consultation`,
      `Install + commissioning of all ${suggested.traps} Biogents CO₂ traps`,
      `Monthly CO₂ tank exchange (5-day reminder before each visit)`,
      `Quarterly equipment inspection + cleaning`,
      `Same-day response to any trap issue via portal or text`,
    ],
  }
  try {
    return await generateJSON({
      system: `You write professional B2B commercial mosquito-control proposals for ${biz.nameShort}. Voice: confident, factual, Austin-local. Avoid hype. Never say "free trial" or "no risk." Use "pesticide-free" not "chemical-free".`,
      user: `Generate the proposal copy as JSON with exact keys: coverHeadline, siteOverview, whyCO2, keyBenefits (array of 4 strings), serviceInclusions (array of 5 strings).

Property: ${propertyName}
Type: ${propertyType || 'commercial property'}
Size: ${units || '?'} ${(propertyType || '').includes('apartment') ? 'units' : 'sqft'}
Suggested config: ${suggested.traps} Biogents CO₂ traps at $${suggested.monthly}/mo
Notes from admin: ${notes || 'none'}

siteOverview should reference the specific property type. whyCO2 is the technical pitch. keyBenefits should be specific to commercial / multi-unit. serviceInclusions list what's included monthly.`,
      maxTokens: 800,
    })
  } catch (e) {
    console.error('proposal copy fallback:', e.message)
    return fallback
  }
}

function renderHTML({ propertyName, address, propertyType, units, contactName, contactEmail, suggested, copy, generatedAt }) {
  const benefitsHTML = (copy.keyBenefits || []).map((b) => `<li>${esc(b)}</li>`).join('')
  const inclusionsHTML = (copy.serviceInclusions || []).map((b) => `<li>${esc(b)}</li>`).join('')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${biz.nameShort} — Proposal for ${esc(propertyName)}</title>
  <style>
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#1a2e1f;line-height:1.55;}
    .wrap{max-width:780px;margin:0 auto;padding:48px 32px;}
    .head{background:#0d1a10;color:#d4e6ca;border-radius:14px;padding:32px 28px;margin-bottom:32px;}
    .head h1{margin:0 0 6px;color:#7dffaa;font-size:1.8rem;letter-spacing:-0.01em;}
    .head .tag{font-size:0.72rem;font-weight:800;color:rgba(212,230,202,0.55);letter-spacing:0.14em;text-transform:uppercase;}
    h2{font-size:1.2rem;margin:32px 0 12px;color:#0d1a10;}
    .meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:18px;margin:18px 0;}
    .meta div{padding:14px 16px;background:#f7fbf6;border-radius:8px;border:1px solid #e3eedb;}
    .meta .label{font-size:0.7rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#7aab82;margin-bottom:4px;}
    .meta .value{font-weight:700;color:#0d1a10;}
    .price-card{background:linear-gradient(135deg,#0d1a10 0%,#1a3a26 100%);color:#fff;border-radius:14px;padding:28px;margin:24px 0;text-align:center;}
    .price-card .amount{font-size:2.6rem;font-weight:900;color:#7dffaa;line-height:1;}
    .price-card .per{font-size:0.9rem;color:rgba(212,230,202,0.65);margin-top:6px;}
    .price-card .config{font-size:0.85rem;color:rgba(212,230,202,0.55);margin-top:16px;}
    ul{padding-left:22px;}
    ul li{margin:6px 0;}
    .cta{margin:36px 0;padding:24px;background:#fefaf2;border:1px solid #f0e3c1;border-radius:12px;text-align:center;}
    .cta strong{font-size:1.1rem;color:#3a2e0f;display:block;margin-bottom:6px;}
    .cta a{display:inline-block;margin-top:12px;padding:12px 24px;background:#c9a84c;color:#0d1a10;border-radius:6px;text-decoration:none;font-weight:800;}
    .footer{margin-top:48px;padding-top:24px;border-top:1px solid #e3eedb;color:#888;font-size:0.8rem;text-align:center;}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div class="tag">${biz.nameShort} · Smart · Safe · Effective</div>
      <h1>${esc(copy.coverHeadline)}</h1>
      <div style="font-size:0.9rem;color:rgba(212,230,202,0.7);margin-top:8px;">
        Prepared for ${esc(contactName || propertyName)} · ${esc(generatedAt)}
      </div>
    </div>

    <div class="meta">
      <div><div class="label">Property</div><div class="value">${esc(propertyName)}</div></div>
      <div><div class="label">Address</div><div class="value">${esc(address || '—')}</div></div>
      <div><div class="label">Type</div><div class="value">${esc(propertyType || '—')}</div></div>
      <div><div class="label">Size</div><div class="value">${esc(units ? `${units} ${(propertyType || '').includes('apartment') ? 'units' : 'sqft'}` : '—')}</div></div>
    </div>

    <h2>Site Overview</h2>
    <p>${esc(copy.siteOverview)}</p>

    <h2>Why CO₂ Trap System</h2>
    <p>${esc(copy.whyCO2)}</p>

    <h2>Key Benefits</h2>
    <ul>${benefitsHTML}</ul>

    <div class="price-card">
      <div style="font-size:0.75rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:rgba(212,230,202,0.5);margin-bottom:8px;">Monthly Service</div>
      <div class="amount">${esc(fmt$(suggested.monthly))}<span style="font-size:1.1rem;color:rgba(212,230,202,0.55);">/mo</span></div>
      <div class="per">All-inclusive · ${suggested.traps} Biogents CO₂ traps + monthly tank exchange</div>
      <div class="config">No setup fees · 30-day cancellation notice · Texas sales tax billed separately</div>
    </div>

    <h2>What's Included Each Month</h2>
    <ul>${inclusionsHTML}</ul>

    <div class="cta">
      <strong>Ready to start?</strong>
      Reply to your email or call us at <a href="tel:+15125604129" style="color:#3a2e0f;text-decoration:underline;">${biz.phone}</a>.
      ${contactEmail ? `<br/><a href="mailto:${biz.email}?subject=Approve%20proposal%20for%20${encodeURIComponent(propertyName)}">Accept this proposal →</a>` : ''}
    </div>

    <div class="footer">
      ${biz.nameShort} · ${biz.city} · ${biz.email} · ${biz.phone}<br/>
      Pesticide-free CO₂ mosquito control · Proposal valid 30 days from ${esc(generatedAt)}
    </div>
  </div>
</body>
</html>`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const session = await requireOwner(req, res)
  if (!session) return

  const { propertyName, address, propertyType, units, contactName, contactEmail, notes } = req.body || {}
  if (!propertyName) return res.status(400).json({ error: 'propertyName required' })

  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: 'Blob storage not configured' })

  try {
    const suggested = suggestConfig({ propertyType, units })
    const copy = await generateProposalCopy({ propertyName, propertyType, units, notes, suggested })
    const html = renderHTML({
      propertyName, address, propertyType, units, contactName, contactEmail,
      suggested, copy,
      generatedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    })

    const slug = String(propertyName).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)
    const filename = `proposals/${slug}-${Date.now()}.html`
    const blob = await put(filename, html, {
      access: 'public', contentType: 'text/html; charset=utf-8',
    })

    return res.status(200).json({
      url: blob.url,
      suggested,
      copy,
    })
  } catch (e) {
    console.error('generate-proposal:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
