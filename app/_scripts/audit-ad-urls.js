#!/usr/bin/env node
// Audit every live ad / sitelink URL across the Google Ads account.
// Flags any pointing to Acuity / Squarespace / other stale destinations.
//
// Usage:
//   cd app && node _scripts/audit-ad-urls.js
//
// Requires env vars from .env (see lib/google-ads.js for the list).

require('dotenv').config({ path: '.env' })
const { auditFinalUrls } = require('../lib/google-ads')

async function main() {
  const { ok, stale } = await auditFinalUrls()
  console.log(`Audited ${ok.length + stale.length} final URLs`)
  console.log(`  ✓ healthy: ${ok.length}`)
  console.log(`  ⚠ stale:   ${stale.length}`)
  if (stale.length) {
    console.log('\n=== STALE URLs (point traffic away) ===')
    for (const row of stale) {
      console.log(`  [${row.type}] ${row.resource}`)
      console.log(`    → ${row.url}`)
    }
    process.exit(2)
  }
}

main().catch((e) => {
  console.error('Audit failed:', e.message)
  process.exit(1)
})
