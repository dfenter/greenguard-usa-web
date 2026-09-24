// SparkBridge licence store (Postgres). Grants are paid purchases tied to an email and a
// gateway name; keys are the signed files we emailed. A gateway is identified by the PAIR
// (lower(email), lower(gateway_id)): default names like "Ignition-Gateway" collide across
// customers, so a gateway name alone never matches. Both columns are stored normalized
// (trimmed, lowercased) and inputs are normalized in JS, so plain equality uses the index.
const { q, getPool } = require('./db')

// DDL shared with scripts/migrate-sparkbridge.js. CREATE ... IF NOT EXISTS only, never drops.
const DDL = [
  {
    name: 'sparkbridge_grants',
    sql: `CREATE TABLE IF NOT EXISTS sparkbridge_grants (
      id serial PRIMARY KEY,
      email text NOT NULL,
      gateway_id text NOT NULL,
      gateway_display text,
      licensee text,
      sku text,
      entitlements text[] NOT NULL,
      support_until date,
      session_id text UNIQUE,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz DEFAULT now()
    )`,
  },
  { name: 'sparkbridge_grants_pair', sql: 'CREATE INDEX IF NOT EXISTS sparkbridge_grants_pair ON sparkbridge_grants (email, gateway_id)' },
  {
    name: 'sparkbridge_keys',
    sql: `CREATE TABLE IF NOT EXISTS sparkbridge_keys (
      id serial PRIMARY KEY,
      email text NOT NULL,
      gateway_id text NOT NULL,
      licensee text,
      entitlements text[],
      support_until date,
      key_sha256 text,
      status text NOT NULL DEFAULT 'active',
      superseded_at timestamptz,
      superseded_by int,
      reason text,
      created_at timestamptz DEFAULT now()
    )`,
  },
  { name: 'sparkbridge_keys_pair', sql: 'CREATE INDEX IF NOT EXISTS sparkbridge_keys_pair ON sparkbridge_keys (email, gateway_id)' },
]

// Concurrent CREATE ... IF NOT EXISTS can still collide in the catalog: 42P07 (relation
// exists) or 23505 (unique violation on pg_type). Both mean another instance won the race.
const RACE_CODES = new Set(['42P07', '23505'])

let _schema = null
function ensureSchema() {
  if (!_schema) {
    _schema = (async () => {
      for (const d of DDL) {
        try { await q(d.sql) } catch (e) { if (!RACE_CODES.has(e.code)) throw e }
      }
    })().catch((e) => { _schema = null; throw e })
  }
  return _schema
}

const normEmail = (e) => String(e || '').trim().toLowerCase()
const normGateway = (g) => String(g || '').trim().toLowerCase()
const displayGateway = (g) => String(g || '').replace(/[\r\n]+/g, ' ').trim()

/** Record a paid grant. Idempotent on session_id (webhook retries). Returns true if inserted. */
async function recordGrant({ email, gateway, licensee, sku, entitlements, supportUntil, sessionId }) {
  await ensureSchema()
  const r = await q(
    `INSERT INTO sparkbridge_grants (email, gateway_id, gateway_display, licensee, sku, entitlements, support_until, session_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (session_id) DO NOTHING RETURNING id`,
    [normEmail(email), normGateway(gateway), displayGateway(gateway), licensee || null, sku || null, entitlements, supportUntil || null, sessionId || null],
  )
  return (r.rowCount || 0) > 0
}

/** Active grants for one (email, gateway) pair, oldest first. */
async function activeGrants(email, gateway) {
  await ensureSchema()
  const r = await q(
    `SELECT id, email, gateway_id, gateway_display, licensee, sku, entitlements, support_until, session_id, status, created_at
       FROM sparkbridge_grants
      WHERE email = $1 AND gateway_id = $2 AND status = 'active'
      ORDER BY created_at ASC, id ASC`,
    [normEmail(email), normGateway(gateway)],
  )
  return r.rows || []
}

/**
 * Insert the key just issued and supersede every earlier active key for the same
 * (email, gateway) pair, in one transaction. Returns the new key row id.
 */
async function recordIssuedKey({ email, gateway, licensee, entitlements, supportUntil, keySha256, reason }) {
  await ensureSchema()
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const ins = await client.query(
      `INSERT INTO sparkbridge_keys (email, gateway_id, licensee, entitlements, support_until, key_sha256, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [normEmail(email), normGateway(gateway), licensee || null, entitlements, supportUntil || null, keySha256, reason],
    )
    const id = ins.rows[0].id
    await client.query(
      `UPDATE sparkbridge_keys SET status = 'superseded', superseded_at = now(), superseded_by = $3
        WHERE email = $1 AND gateway_id = $2 AND status = 'active' AND id <> $3`,
      [normEmail(email), normGateway(gateway), id],
    )
    await client.query('COMMIT')
    return id
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

module.exports = { DDL, ensureSchema, recordGrant, activeGrants, recordIssuedKey, normEmail, normGateway, displayGateway }
