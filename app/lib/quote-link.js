const { jwtVerify } = require('jose')

function getSecret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters')
  }
  return new TextEncoder().encode(process.env.JWT_SECRET)
}

function safeString(value, maxLength) {
  if (value == null) return ''
  return String(value).slice(0, maxLength)
}

function safeNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// Quote lines are also projected so arbitrary nested JWT claims cannot leak to
// the public API or page props. These are the only fields the quote UI/payment
// flow needs from a line item.
function sanitizeLines(lines) {
  if (!Array.isArray(lines)) return []
  return lines.slice(0, 100).map((line) => ({
    label: safeString(line?.label, 300),
    amount: safeNumber(line?.amount),
    recurring: line?.recurring === true,
  }))
}

// A dual-option quote carries a rental and a purchase variant; each is a full
// line set + totals. Same allowlist projection as the top-level fields.
function sanitizeOption(opt) {
  if (!opt || typeof opt !== 'object') return null
  return {
    serviceLines: sanitizeLines(opt.serviceLines),
    productLines: sanitizeLines(opt.productLines),
    addonLines: sanitizeLines(opt.addonLines),
    recurringTotal: safeNumber(opt.recurringTotal),
    oneTimeTotal: safeNumber(opt.oneTimeTotal),
    subtotal: safeNumber(opt.subtotal),
    taxAmount: safeNumber(opt.taxAmount),
    shippingTotal: safeNumber(opt.shippingTotal),
    total: safeNumber(opt.total),
  }
}

function sanitizeOptions(options) {
  if (!options || typeof options !== 'object') return null
  const rental = sanitizeOption(options.rental)
  const purchase = sanitizeOption(options.purchase)
  return rental && purchase ? { rental, purchase } : null
}

/**
 * Verify a quote JWT and return only the customer-facing quote allowlist.
 * JWT claims such as jti/type/iat/exp/source never leave this helper.
 */
async function verifyAndSanitizeQuoteToken(token) {
  if (!token || typeof token !== 'string') throw new Error('Invalid quote token')
  const { payload } = await jwtVerify(token, getSecret())
  if (payload.type !== 'quote') throw new Error('Invalid quote token')

  return {
    customerName: safeString(payload.customerName, 200),
    customerEmail: safeString(payload.customerEmail, 320),
    customerAddress: safeString(payload.customerAddress, 500),
    serviceLines: sanitizeLines(payload.serviceLines),
    addonLines: sanitizeLines(payload.addonLines),
    productLines: sanitizeLines(payload.productLines),
    options: sanitizeOptions(payload.options),
    localDelivery: payload.localDelivery === true,
    total: safeNumber(payload.total),
    recurringTotal: safeNumber(payload.recurringTotal),
    oneTimeTotal: safeNumber(payload.oneTimeTotal),
    taxRate: safeNumber(payload.taxRate),
    taxAmount: safeNumber(payload.taxAmount),
    shippingTotal: safeNumber(payload.shippingTotal),
    serviceDate: payload.serviceDate == null ? null : safeString(payload.serviceDate, 40),
    notes: safeString(payload.notes, 5000),
    expiresAt: Number.isFinite(Number(payload.exp)) ? new Date(Number(payload.exp) * 1000).toISOString() : null,
  }
}

module.exports = { verifyAndSanitizeQuoteToken }
