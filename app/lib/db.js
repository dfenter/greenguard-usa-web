// Postgres connection pool — single shared instance across the portal.
// Lazy-init so build/SSR doesn't fail when DATABASE_URL isn't set yet.
//
// Neon suspends idle databases and terminates connections with
// "terminating connection due to administrator command". The pool
// error handler + retry logic below absorbs those without crashing.

const { Pool } = require('pg')

let _pool = null

function getPool() {
  if (_pool) return _pool
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL not set')
  _pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 5,                      // Neon free tier connection budget
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
  // Absorb pool-level errors (e.g. Neon terminating idle connections).
  // Without this, an unhandled 'error' event crashes the Node process.
  _pool.on('error', (err) => {
    console.error('[db] pool error (connection evicted):', err.message)
  })
  return _pool
}

async function q(text, params, { retries = 1 } = {}) {
  const pool = getPool()
  try {
    return await pool.query(text, params)
  } catch (err) {
    const isStaleConnection =
      err.message?.includes('terminating connection') ||
      err.message?.includes('Connection terminated') ||
      err.code === '57P01'  // admin_shutdown
    if (isStaleConnection && retries > 0) {
      // Neon woke up and killed the connection — retry once on a fresh one
      return q(text, params, { retries: retries - 1 })
    }
    throw err
  }
}

module.exports = { q, getPool }
