#!/usr/bin/env node
// Runs the LLM categorizer in a loop until all Unknown transactions are categorized.

const fs = require('fs')
const envLines = fs.readFileSync('.env', 'utf8').split('\n')
for (const line of envLines) {
  const m = line.match(/^([A-Z0-9_]+)=(.+)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const { categorizeBatch, getUncategorized } = require('./lib/books-categorize')

async function main() {
  let totalProcessed = 0
  let round = 0

  while (true) {
    round++
    const remaining = await getUncategorized(1)
    if (remaining.length === 0) {
      console.log(`\n✓ Done after ${round - 1} rounds (${totalProcessed} total).`)
      break
    }

    process.stdout.write(`Round ${round}: `)
    try {
      const result = await categorizeBatch({ limit: 25 })
      totalProcessed += result.processed
      console.log(`categorized ${result.processed} (${result.model || '?'}) — total: ${totalProcessed}`)
      if (result.processed === 0) { console.log('No progress.'); break }
    } catch (e) {
      console.error(`  ERROR: ${e.message}`)
      await new Promise(r => setTimeout(r, 3000))
    }
  }
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
