// Postgres connection pool — single shared instance across the portal.
// Lazy-init so build/SSR doesn't fail when DATABASE_URL isn't set yet.

const { Pool } = require('pg')

let _pool = null

function getPool() {
  if (_pool) return _pool
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL not set')
  _pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 5,                 // Neon free tier connection budget
    idleTimeoutMillis: 30_000,
  })
  return _pool
}

async function q(text, params) {
  const pool = getPool()
  return pool.query(text, params)
}

module.exports = { q, getPool }
