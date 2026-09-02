// SparkBridge licensing: the sellable catalog, and a Node port of the key signer in
// io.sparkbridge.license.LicenseKey (SparkBridge common 2.5.0). Same text format, same
// SHA256withECDSA over P-256 (DER signature), so a key issued here verifies inside every
// module against the vendor public key embedded in LicenseKeys.java.
//
// Private key: env SPARKBRIDGE_LICENSE_SIGNING_KEY = base64 PKCS#8 (the contents of
// ~/.local/opt/sparkbridge-license/license-signing.key on the issuing Mac).
const crypto = require('crypto')

const MAGIC = '#sparkbridge-license/1'

// Entitlement ids must match io.sparkbridge.license.Entitlements.
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
  LOGIX: 'com.sparkbridge.sparklogix',
}

// Prices are list, USD cents, per gateway. Source of truth for the site's buy buttons.
const CATALOG = {
  edge: { name: 'SparkBridge Edge', cents: 99500, entitlements: [E.EDGE], unit: 'site gateway' },
  central: { name: 'SparkBridge Central', cents: 199500, entitlements: [E.HOST, E.PROVIDER], unit: 'central gateway' },
  'central-package': {
    name: 'SparkBridge Central package', cents: 399500, unit: 'central gateway',
    entitlements: [E.HOST, E.PROVIDER, E.PASSAGE, E.CALC, E.SPARKID, E.SENTINEL, E.FLEETOPS, E.VAULT, E.INJECT],
  },
  passage: { name: 'Passage', cents: 49500, entitlements: [E.PASSAGE], unit: 'central gateway' },
  sparkcalc: { name: 'SparkCalc', cents: 49500, entitlements: [E.CALC], unit: 'central gateway' },
  sparkid: { name: 'SparkID', cents: 49500, entitlements: [E.SPARKID], unit: 'central gateway' },
  sentinel: { name: 'Sentinel', cents: 49500, entitlements: [E.SENTINEL], unit: 'central gateway' },
  fleetops: { name: 'FleetOps', cents: 49500, entitlements: [E.FLEETOPS], unit: 'central gateway' },
  sparkvault: { name: 'SparkVault', cents: 99500, entitlements: [E.VAULT], unit: 'central gateway' },
  sparkinject: { name: 'SparkInject', cents: 49500, entitlements: [E.INJECT], unit: 'central gateway' },
  sparkflow: { name: 'SparkFlow', cents: 99500, entitlements: [E.FLOW], unit: 'central gateway' },
  sparksnmp: { name: 'SparkSNMP', cents: 149500, entitlements: [E.SNMP], unit: 'gateway' },
  iec104: { name: 'IEC 60870-5-104 driver', cents: 49500, entitlements: [E.IEC104], unit: 'gateway' },
  dnp3: { name: 'DNP3 driver', cents: 49500, entitlements: [E.DNP3], unit: 'gateway' },
  ti505: { name: 'TI 505 / CTI 2500 driver', cents: 49500, entitlements: [E.TI505], unit: 'gateway' },
  sparklogix: { name: 'SparkLogix', cents: 99500, entitlements: [E.LOGIX], unit: 'gateway' },
  sparkinflux: { name: 'SparkInflux', cents: 149500, entitlements: [E.INFLUX], unit: 'gateway' },
  sparkvalidate: { name: 'SparkValidate', cents: 249500, entitlements: [E.VALIDATE], unit: 'gateway' },
  'sparkvalidate-cli': { name: 'SparkValidate (command line only)', cents: 99500, entitlements: [E.VALIDATE], unit: 'workstation' },
}

function skuInfo(sku) {
  return CATALOG[String(sku || '').toLowerCase()] || null
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
  const info = skuInfo(sku)
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

module.exports = { MAGIC, E, CATALOG, skuInfo, issueKey, issueForPurchase, supportUntilFrom, licenseEmailHtml, isoDate }
