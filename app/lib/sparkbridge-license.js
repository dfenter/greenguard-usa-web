// SparkBridge licensing: the sellable catalog, and a Node port of the key signer in
// io.sparkbridge.license.LicenseKey (SparkBridge common 2.5.0). Same text format, same
// SHA256withECDSA over P-256 (DER signature), so a key issued here verifies inside every
// module against the vendor public key embedded in LicenseKeys.java.
//
// Private key: env SPARKBRIDGE_LICENSE_SIGNING_KEY = base64 PKCS#8 (the contents of
// ~/.local/opt/sparkbridge-license/license-signing.key on the issuing Mac).
const crypto = require('crypto')

const MAGIC = '#sparkbridge-license/1'

// Entitlement ids must match what the modules check (io.sparkbridge.license.Entitlements,
// except VALIDATE_CLI, which is checked by the SparkValidate CLI 0.2.1+ only).
const E = {
  EDGE: 'io.sparkbridge.edge',
  HOST: 'io.sparkbridge.host',
  PROVIDER: 'io.sparkbridge.provider',
  FLOW: 'io.sparkbridge.flow',
  VAULT: 'io.sparkvault.historian',
  INJECT: 'io.sparkinject.snowflake',
  CALC: 'io.sparkcalc.engine',
  PASSAGE: 'com.greenguard.unsbridge',
  FLEETOPS: 'com.greenguard.fleetops',
  SENTINEL: 'cli.sparkbridge.sentinel',
  SPARKID: 'cli.sparkbridge.sparkid',
  SNMP: 'com.sparkbridge.sparksnmp',
  IEC104: 'com.greenguard.drivers.iec104',
  DNP3: 'com.greenguard.drivers.dnp3',
  TI505: 'com.cti.ti505.driver',
  INFLUX: 'com.sparkbridge.sparkinflux',
  VALIDATE: 'io.sparkvalidate',
  VALIDATE_CLI: 'io.sparkvalidate.cli',
  LOGIX: 'com.sparkbridge.sparklogix',
  ADS: 'com.sparkbridge.sparkads',
  S7: 'com.sparkbridge.sparks7',
  IEC61850: 'com.sparkbridge.spark61850',
  BACNET: 'com.sparkbridge.sparkbacnet',
  NOTIFY: 'com.sparkbridge.sparknotify',
  GANTT: 'com.sparkbridge.sparkgantt',
  RECORD: 'io.sparkrecord.gateway',
  // 3.0 id, no pre-3.0 alias: GitOps was never sold before the com.greenguardusa rename.
  GITOPS: 'com.greenguardusa.gitops',
}

// Prices are list, USD cents, per gateway. Source of truth for the site's buy buttons.
const CATALOG = {
  edge: { name: 'SparkBridge Edge', cents: 99500, entitlements: [E.EDGE], unit: 'site gateway' },
  // Item id stays `central` (site buy button and past Stripe sessions use it); sold as Host.
  central: { name: 'SparkBridge Host', cents: 149500, entitlements: [E.HOST, E.CALC, E.SPARKID], unit: 'Host gateway' },
  provider: { name: 'SparkBridge Provider', cents: 199500, entitlements: [E.PROVIDER], unit: 'gateway' },
  passage: { name: 'Passage', cents: 199500, entitlements: [E.PASSAGE], unit: 'central gateway' },
  sentinel: { name: 'Sentinel', cents: 499500, entitlements: [E.SENTINEL], unit: 'workstation' },
  fleetops: { name: 'FleetOps', cents: 499500, entitlements: [E.FLEETOPS], unit: 'central gateway' },
  sparkvault: { name: 'SparkVault', cents: 399500, entitlements: [E.VAULT], unit: 'gateway' },
  sparkinject: { name: 'SparkInject', cents: 299500, entitlements: [E.INJECT], unit: 'gateway' },
  sparkflow: { name: 'SparkFlow', cents: 99500, entitlements: [E.FLOW], unit: 'central gateway' },
  sparksnmp: { name: 'SparkSNMP', cents: 69500, entitlements: [E.SNMP], unit: 'gateway' },
  iec104: { name: 'IEC 60870-5-104 driver', cents: 69500, entitlements: [E.IEC104], unit: 'gateway' },
  dnp3: { name: 'DNP3 driver', cents: 69500, entitlements: [E.DNP3], unit: 'gateway' },
  ti505: { name: 'TI 505 / CTI 2500 driver', cents: 69500, entitlements: [E.TI505], unit: 'gateway' },
  sparklogix: { name: 'SparkLogix', cents: 69500, entitlements: [E.LOGIX], unit: 'gateway' },
  sparkads: { name: 'SparkADS', cents: 69500, entitlements: [E.ADS], unit: 'gateway' },
  sparks7: { name: 'SparkS7', cents: 69500, entitlements: [E.S7], unit: 'gateway' },
  spark61850: { name: 'Spark61850', cents: 69500, entitlements: [E.IEC61850], unit: 'gateway' },
  sparkbacnet: { name: 'SparkBACnet', cents: 69500, entitlements: [E.BACNET], unit: 'gateway' },
  sparknotify: { name: 'SparkNotify', cents: 69500, entitlements: [E.NOTIFY], unit: 'gateway' },
  sparkgantt: { name: 'SparkGantt', cents: 69500, entitlements: [E.GANTT], unit: 'gateway' },
  sparkrecord: { name: 'SparkRecord', cents: 799500, entitlements: [E.RECORD], unit: 'central gateway' },
  gitops: { name: 'GitOps / Enterprise Governance', cents: 999500, entitlements: [E.HOST, E.CALC, E.SPARKID, E.GITOPS], unit: 'Host gateway' },
  sparkinflux: { name: 'SparkInflux', cents: 149500, entitlements: [E.INFLUX], unit: 'gateway' },
  sparkvalidate: { name: 'SparkValidate', cents: 249500, entitlements: [E.VALIDATE], unit: 'gateway' },
  // The CLI also accepts a gateway key (io.sparkvalidate); a CLI key does not license the gateway module.
  'sparkvalidate-cli': { name: 'SparkValidate (command line only)', cents: 99500, entitlements: [E.VALIDATE_CLI], unit: 'workstation' },
}

// No longer sold (package dropped; SparkCalc and SparkID now come with Host). Checkout
// refuses them; kept so a session paid before retirement still fulfils and re-issues.
const RETIRED = {
  'central-package': {
    name: 'SparkBridge Central package', cents: 399500, unit: 'central gateway',
    entitlements: [E.HOST, E.PROVIDER, E.PASSAGE, E.CALC, E.SPARKID, E.SENTINEL, E.FLEETOPS, E.VAULT, E.INJECT],
  },
  sparkcalc: { name: 'SparkCalc', cents: 49500, entitlements: [E.CALC], unit: 'central gateway' },
  sparkid: { name: 'SparkID', cents: 49500, entitlements: [E.SPARKID], unit: 'central gateway' },
}

/** Sellable item, or null. Pass { retired: true } to also resolve retired items (fulfilment only). */
function skuInfo(sku, { retired = false } = {}) {
  const id = String(sku || '').toLowerCase()
  return CATALOG[id] || (retired && RETIRED[id]) || null
}

function signingKey() {
  const b64 = (process.env.SPARKBRIDGE_LICENSE_SIGNING_KEY || '').replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '')
  if (!b64) throw new Error('SPARKBRIDGE_LICENSE_SIGNING_KEY is not set')
  return crypto.createPrivateKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'pkcs8' })
}

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

function oneLine(v) {
  return String(v ?? '').replace(/[\r\n]+/g, ' ').trim()
}

/**
 * Issue one signed key. Mirrors LicenseKey.issue(): body lines are signed verbatim,
 * DER ECDSA signature base64 on the #signature line.
 */
function issueKey({ licensee, gateway = 'any', entitlements, issued = new Date(), supportUntil = null }) {
  const who = oneLine(licensee)
  if (!who) throw new Error('licensee is required')
  const ids = [...new Set((entitlements || []).map((s) => String(s).trim()).filter(Boolean))]
  if (!ids.length) throw new Error('a license needs at least one entitlement')
  for (const id of ids) if (/[,\n]/.test(id)) throw new Error(`bad entitlement ${id}`)
  let body = `licensee=${who}\ngateway=${oneLine(gateway) || 'any'}\nentitlements=${ids.join(',')}\nissued=${isoDate(issued)}\n`
  if (supportUntil) body += `support-until=${isoDate(supportUntil)}\n`
  const sig = crypto.sign('sha256', Buffer.from(body, 'utf8'), { key: signingKey(), dsaEncoding: 'der' })
  return `${MAGIC}\n${body}#signature=${sig.toString('base64')}\n`
}

/** Support term: 12 months from purchase. */
function supportUntilFrom(d = new Date()) {
  const x = new Date(d)
  x.setUTCFullYear(x.getUTCFullYear() + 1)
  return x
}

/**
 * Keys for one paid line: one key per gateway bought (quantity), all with the same entitlements.
 * Returns [{ filename, content }].
 */
function issueForPurchase({ sku, quantity = 1, licensee, purchasedAt = new Date() }) {
  const info = skuInfo(sku, { retired: true })
  if (!info) throw new Error(`unknown SparkBridge sku ${sku}`)
  const n = Math.max(1, Math.min(200, parseInt(quantity, 10) || 1))
  const slug = String(sku).toLowerCase()
  const out = []
  for (let i = 1; i <= n; i++) {
    const content = issueKey({
      licensee, gateway: 'any', entitlements: info.entitlements,
      issued: purchasedAt, supportUntil: supportUntilFrom(purchasedAt),
    })
    out.push({ filename: n === 1 ? `sparkbridge-license-${slug}.key` : `sparkbridge-license-${slug}-${i}.key`, content })
  }
  return out
}

function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }
  return String(str ?? '').replace(/[&<>"']/g, (c) => map[c])
}

/** The customer email body. Plain, executive voice, no jargon. */
function licenseEmailHtml({ licensee, lines, supportUntil }) {
  const items = lines.map((l) => `<li>${escapeHtml(l.name)} &times; ${l.quantity} ${escapeHtml(l.unit)}${l.quantity > 1 ? 's' : ''}</li>`).join('')
  return `
<p>Thank you. Your SparkBridge license ${lines.reduce((a, l) => a + l.quantity, 0) > 1 ? 'keys are' : 'key is'} attached, issued to <b>${escapeHtml(licensee)}</b>.</p>
<ul>${items}</ul>
<p><b>To install:</b> copy each attached file into the Ignition data directory of one gateway and name it <code>sparkbridge-license.key</code> (for example <code>&lt;ignition&gt;/data/sparkbridge-license.key</code>). No restart is needed: within 30 seconds the module's status page changes from Trial to "Licensed to ${escapeHtml(licensee)}" and the Ignition two-hour trial clock no longer applies to it. One file per gateway; a key naming several products covers each of them on that gateway. Command-line tools take <code>--license &lt;file&gt;</code>.</p>
<p>Support and updates are included through ${escapeHtml(supportUntil)}. The software itself is yours for good; nothing switches off after that date.</p>
<p>Keep the files somewhere safe. If you lose one, reply to this email and we will re-issue it.</p>
<p>Questions: reply here, or write to admin@greenguard-usa.com.</p>`
}

const REISSUE_URL = 'https://portal.greenguard-usa.com/sparkbridge/licence'
const COMBINED_FILENAME = 'sparkbridge-license.key'

function grantTime(g, i) {
  const t = g && g.created_at ? new Date(g.created_at).getTime() : NaN
  return Number.isFinite(t) ? t : i
}

/**
 * Merge the grants held on one gateway into one entitlement set. Pure.
 * Non-active grants (superseded, revoked) are ignored. Entitlements keep first-seen order
 * across grants oldest first; licensee comes from the most recent grant; supportUntil is
 * the EARLIEST support date: a key carries one support-until line, and a cheap later
 * purchase must never extend support on the products bought earlier. Throws when no active grant remains.
 */
function mergeGrants(grants) {
  const active = (grants || [])
    .map((g, i) => ({ g, i, t: grantTime(g, i) }))
    .filter(({ g }) => g && (g.status == null || g.status === 'active'))
    .sort((a, b) => (a.t - b.t) || (a.i - b.i))
  if (!active.length) throw new Error('no active grants to merge')
  const entitlements = []
  const products = []
  let supportUntil = null
  let licensee = null
  for (const { g } of active) {
    for (const e of g.entitlements || []) {
      const id = String(e).trim()
      if (id && !entitlements.includes(id)) entitlements.push(id)
    }
    const info = skuInfo(g.sku, { retired: true })
    const name = info ? info.name : (g.sku ? String(g.sku) : null)
    if (name && !products.includes(name)) products.push(name)
    if (g.support_until) {
      const d = new Date(g.support_until)
      if (!Number.isNaN(d.getTime()) && (!supportUntil || d < supportUntil)) supportUntil = d
    }
    if (oneLine(g.licensee)) licensee = oneLine(g.licensee)
  }
  return { entitlements, licensee, supportUntil, products }
}

/**
 * One key covering every active grant on a gateway. Same signer and format as issueKey;
 * the gateway line stays `any` (the gateway name is only used to find the grants).
 */
function issueCombinedKey({ grants, gatewayDisplay, issued = new Date() }) {
  const m = mergeGrants(grants)
  const content = issueKey({ licensee: m.licensee || 'SparkBridge customer', gateway: 'any', entitlements: m.entitlements, issued, supportUntil: m.supportUntil })
  return { filename: COMBINED_FILENAME, content, gatewayDisplay: oneLine(gatewayDisplay), ...m }
}

/** Email body for a combined key. `replaces` is true when the gateway already held a key. */
function combinedEmailHtml({ licensee, products, supportUntil, gatewayDisplay, replaces, reissue = false }) {
  const gw = escapeHtml(gatewayDisplay)
  const items = products.map((n) => `<li>${escapeHtml(n)}</li>`).join('')
  const lead = reissue
    ? `<p>As requested, here is the combined SparkBridge license key for gateway <b>${gw}</b>, issued to <b>${escapeHtml(licensee)}</b>. It covers:</p>`
    : `<p>Thank you. Your SparkBridge license key for gateway <b>${gw}</b> is attached, issued to <b>${escapeHtml(licensee)}</b>. It covers:</p>`
  const replace = replaces
    ? `<p><b>This key replaces the existing sparkbridge-license.key on gateway ${gw}.</b> It covers every product listed above, so delete or overwrite the old file with this one. Keep only this file on that gateway.</p>`
    : ''
  return `
${lead}
<ul>${items}</ul>
${replace}
<p><b>To install:</b> copy the attached file into the Ignition data directory of gateway ${gw} as <code>sparkbridge-license.key</code> (for example <code>&lt;ignition&gt;/data/sparkbridge-license.key</code>). No restart is needed: within 30 seconds the module status pages change from Trial to "Licensed to ${escapeHtml(licensee)}".</p>
<p>Support and updates are included through ${escapeHtml(supportUntil)}. The software itself is yours for good; nothing switches off after that date.</p>
<p>The key shows the earliest support date among the products it covers; each product keeps its own twelve-month support term from its purchase date.</p>
<p>You can have this combined key sent again at any time from <a href="${REISSUE_URL}">${REISSUE_URL}</a>; it always goes to this email address.</p>
<p>Questions: reply here, or write to admin@greenguard-usa.com.</p>`
}

module.exports = { MAGIC, E, CATALOG, RETIRED, REISSUE_URL, COMBINED_FILENAME, skuInfo, issueKey, issueForPurchase, supportUntilFrom, licenseEmailHtml, isoDate, mergeGrants, issueCombinedKey, combinedEmailHtml }
