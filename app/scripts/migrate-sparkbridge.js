#!/usr/bin/env node
// SparkBridge licence store schema migration. CREATE ... IF NOT EXISTS only, never drops.
//
// Same DDL as lib/sparkbridge-store.js ensureSchema() (which also runs it lazily on first
// use): sparkbridge_grants (paid purchases per email + gateway name) and sparkbridge_keys
// (every combined key emailed, with supersede history), each indexed on (email, gateway_id).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const { q } = require('../lib/db')
const { DDL } = require('../lib/sparkbridge-store')

async function main() {
  for (const t of DDL) {
    await q(t.sql)
    console.log(`created (or already existed): ${t.name}`)
  }
  console.log('sparkbridge migration complete')
  process.exit(0)
}

main().catch((err) => {
  console.error('sparkbridge migration failed:', err.message)
  process.exit(1)
})
