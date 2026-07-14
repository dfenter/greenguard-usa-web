/**
 * QuickBooks Online (QBO) API — accounting sync
 * Requires: QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REFRESH_TOKEN, QBO_REALM_ID
 *
 * Setup:
 * 1. developer.intuit.com → Create App → QuickBooks Online + Payments
 * 2. OAuth 2.0 scopes: com.intuit.quickbooks.accounting
 * 3. Run _scripts/get-qbo-token.js once to get refresh token → set QBO_REFRESH_TOKEN
 * 4. QBO_REALM_ID = your company ID (shown in QBO URL after signing in)
 *
 * Sandbox: set QBO_SANDBOX=true to use sandbox.api.intuit.com
 */

const BASE = process.env.QBO_SANDBOX === 'true'
  ? 'https://sandbox-quickbooks.api.intuit.com'
  : 'https://quickbooks.api.intuit.com'

let _accessToken = null
let _tokenExpiry = 0

async function getAccessToken() {
  if (_accessToken && Date.now() < _tokenExpiry) return _accessToken

  const creds = Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64')
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.QBO_REFRESH_TOKEN,
    }),
  })

  const data = await res.json()
  if (data.error) throw new Error(`QBO auth: ${data.error_description || data.error}`)

  _accessToken = data.access_token
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return _accessToken
}

async function qboGet(path, params = {}) {
  const token = await getAccessToken()
  const realmId = process.env.QBO_REALM_ID
  const url = new URL(`${BASE}/v3/company/${realmId}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  const data = await res.json()
  if (data.Fault) throw new Error(`QBO: ${data.Fault.Error?.[0]?.Detail || 'Unknown error'}`)
  return data
}

async function qboPost(path, body) {
  const token = await getAccessToken()
  const realmId = process.env.QBO_REALM_ID
  const url = `${BASE}/v3/company/${realmId}${path}?minorversion=65`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (data.Fault) throw new Error(`QBO: ${data.Fault.Error?.[0]?.Detail || 'Unknown error'}`)
  return data
}

function escapeQboString(value) {
  return String(value).replace(/'/g, "''")
}

async function findInvoiceByDocNumber(docNumber) {
  const result = await qboGet('/query', {
    query: `SELECT * FROM Invoice WHERE DocNumber = '${escapeQboString(docNumber)}' MAXRESULTS 1`,
  })
  return result.QueryResponse?.Invoice?.[0] || null
}

/** Find or create a QBO customer by email */
async function findOrCreateCustomer({ email, displayName, phone } = {}) {
  const query = `SELECT * FROM Customer WHERE PrimaryEmailAddr = '${email}' MAXRESULTS 1`
  const result = await qboGet('/query', { query })
  const existing = result.QueryResponse?.Customer?.[0]
  if (existing) return existing

  const body = {
    DisplayName: displayName || email,
    PrimaryEmailAddr: { Address: email },
  }
  if (phone) body.PrimaryPhone = { FreeFormNumber: phone }

  const created = await qboPost('/customer', body)
  return created.Customer
}

/**
 * Create a QBO invoice from a Stripe invoice
 * stripeInvoice: { id, customer_email, customer_name, amount_paid, lines, created }
 * qboLines: [{ description, amount, quantity, serviceDate }]
 */
async function createInvoice({ customerEmail, customerName, lines, stripeInvoiceId, serviceDate } = {}) {
  if (stripeInvoiceId) {
    const existing = await findInvoiceByDocNumber(stripeInvoiceId)
    if (existing) return existing
  }
  const customer = await findOrCreateCustomer({ email: customerEmail, displayName: customerName })

  const lineItems = lines.map((l, idx) => ({
    Id: String(idx + 1),
    LineNum: idx + 1,
    Description: l.description,
    Amount: l.amount,
    DetailType: 'SalesItemLineDetail',
    SalesItemLineDetail: {
      Qty: l.quantity || 1,
      UnitPrice: l.amount / (l.quantity || 1),
      ServiceDate: serviceDate,
    },
  }))

  const body = {
    CustomerRef: { value: customer.Id },
    Line: lineItems,
    DocNumber: stripeInvoiceId || undefined,
    PrivateNote: stripeInvoiceId ? `Stripe: ${stripeInvoiceId}` : undefined,
    TxnDate: serviceDate || new Date().toISOString().slice(0, 10),
  }

  const result = await qboPost('/invoice', body)
  return result.Invoice
}

/** Get P&L report for a date range */
async function getProfitAndLoss(startDate, endDate) {
  return qboGet('/reports/ProfitAndLoss', {
    start_date: startDate,
    end_date: endDate,
    accounting_method: 'Cash',
  })
}

/** Get accounts list */
async function getAccounts() {
  const result = await qboGet('/query', { query: 'SELECT * FROM Account MAXRESULTS 100' })
  return result.QueryResponse?.Account || []
}

/** Get recent invoices from QBO */
async function getRecentInvoices(limit = 20) {
  const result = await qboGet('/query', {
    query: `SELECT * FROM Invoice ORDER BY TxnDate DESC MAXRESULTS ${limit}`,
  })
  return result.QueryResponse?.Invoice || []
}

/** Get revenue summary by month (from QBO reports) */
async function getMonthlySummary(year = new Date().getFullYear()) {
  return qboGet('/reports/ProfitAndLoss', {
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
    summarize_column_by: 'Month',
    accounting_method: 'Cash',
  })
}

module.exports = {
  findOrCreateCustomer,
  createInvoice,
  getProfitAndLoss,
  getAccounts,
  getRecentInvoices,
  getMonthlySummary,
}
