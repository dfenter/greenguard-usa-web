#!/usr/bin/env node
// OPS (One Person Show) tenant management CLI.
//
// Subcommands: init, list, validate, doctor, skills — see README.md for
// full usage. No dependencies beyond what app/node_modules already has
// (js-yaml is required by its path inside app/node_modules).

'use strict'

const fs = require('fs')
const path = require('path')
const https = require('https')
const { execFileSync } = require('child_process')

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const APP_DIR = path.join(REPO_ROOT, 'app')
const BUSINESSES_DIR = path.join(APP_DIR, 'lib', 'businesses')

function loadYaml() {
  // js-yaml lives in app/node_modules, not ops/node_modules.
  const yamlPath = path.join(APP_DIR, 'node_modules', 'js-yaml')
  return require(yamlPath)
}

// ── small helpers ───────────────────────────────────────────────────────────

function tenantDir(id) {
  return path.join(BUSINESSES_DIR, id)
}

function listTenantIds() {
  if (!fs.existsSync(BUSINESSES_DIR)) return []
  return fs.readdirSync(BUSINESSES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)
    .sort()
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDirSync(s, d)
    else fs.copyFileSync(s, d)
  }
}

function fail(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
    } else {
      positional.push(a)
    }
  }
  return { positional, flags }
}

// Required env vars referenced from app/CLAUDE.md's Vercel env var block.
const REQUIRED_ENV_VARS = [
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'HUBSPOT_ACCESS_TOKEN',
  'CALCOM_API_KEY',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN',
  'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
  'JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_EMAILS',
  'CALENDAR_TIMEZONE', 'RESEND_API_KEY', 'PORTAL_FROM_EMAIL',
  'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_GA_MEASUREMENT_ID',
  'GITHUB_TOKEN',
  'DATABASE_URL',
]

// ── ops init ─────────────────────────────────────────────────────────────

function cmdInit(positional, flags) {
  const id = positional[0]
  if (!id) fail('usage: ops init <id> --name "..." --email ... --phone ... --city "..." [--from greenguard|lawnpro|poolpro|_template] [--force]')
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) fail(`invalid tenant id "${id}" — use lowercase letters, digits, hyphens`)

  const from = flags.from || '_template'
  const srcDir = tenantDir(from)
  if (!fs.existsSync(srcDir)) fail(`--from tenant "${from}" does not exist at ${srcDir}`)

  const destDir = tenantDir(id)
  if (fs.existsSync(destDir) && !flags.force) {
    fail(`tenant "${id}" already exists at ${destDir} — pass --force to overwrite`)
  }
  if (fs.existsSync(destDir) && flags.force) {
    fs.rmSync(destDir, { recursive: true, force: true })
  }

  copyDirSync(srcDir, destDir)
  // Never carry the example file forward — business.yaml is generated fresh below.
  const exampleAtDest = path.join(destDir, 'business.yaml.example')
  if (fs.existsSync(exampleAtDest)) fs.rmSync(exampleAtDest)

  const name = flags.name || id
  const email = flags.email || `admin@${id}.example.com`
  const phone = flags.phone || ''
  const city = flags.city || ''

  // Rewrite config.js identity fields (best-effort line rewrites — config.js
  // stays the fallback source; business.yaml is the field authoritative source).
  const configPath = path.join(destDir, 'config.js')
  let configSrc = fs.readFileSync(configPath, 'utf8')
  configSrc = configSrc
    .replace(/id:\s*'[^']*'/, `id:        '${id}'`)
    .replace(/name:\s*'[^']*'/, `name:      '${name}'`)
    .replace(/email:\s*'[^']*'/, `email:     '${email}'`)
    .replace(/ownerEmail:\s*'[^']*'/, `ownerEmail: '${email}'`)
    .replace(/calendarId:\s*'[^']*'/, `calendarId: '${email}'`)
  if (phone) configSrc = configSrc.replace(/phone:\s*'[^']*'/, `phone:     '${phone}'`)
  if (city) configSrc = configSrc.replace(/city:\s*'[^']*'/, `city:      '${city}'`)
  fs.writeFileSync(configPath, configSrc)

  // Write business.yaml from the template's example, substituting given values.
  const yaml = loadYaml()
  const examplePath = path.join(tenantDir('_template'), 'business.yaml.example')
  let overlay = {}
  if (fs.existsSync(examplePath)) {
    overlay = yaml.load(fs.readFileSync(examplePath, 'utf8')) || {}
  }
  overlay.name = name
  overlay.email = email
  overlay.ownerEmail = email
  overlay.calendarId = email
  if (phone) overlay.phone = phone
  if (city) overlay.city = city
  overlay.bookingTag = name

  const yamlPath = path.join(destDir, 'business.yaml')
  fs.writeFileSync(yamlPath, yaml.dump(overlay, { lineWidth: -1 }))

  console.log(`✓ created tenant "${id}" at ${path.relative(REPO_ROOT, destDir)} (from ${from})`)
  console.log('')
  console.log('Next steps:')
  console.log(`  1. Review ${path.relative(REPO_ROOT, configPath)} and ${path.relative(REPO_ROOT, yamlPath)}`)
  console.log(`  2. Edit catalog.js / sku-engine.js / service-plans.js / upgrade-paths.js / cal-event-types.json for this business`)
  console.log(`  3. Validate:  node ops/cli/ops.js validate ${id}`)
  console.log('  4. Set environment variables (Vercel + local .env):')
  console.log(`       BUSINESS_ID=${id}`)
  console.log(`       NEXT_PUBLIC_BUSINESS_ID=${id}`)
  console.log(`       ADMIN_EMAIL=${email}`)
  console.log(`       CALENDAR_ID=${email}`)
  for (const v of REQUIRED_ENV_VARS) console.log(`       ${v}=...`)
  console.log('')
  console.log('  vercel env add commands:')
  console.log(`       vercel env add BUSINESS_ID production`)
  console.log(`       vercel env add NEXT_PUBLIC_BUSINESS_ID production`)
  console.log(`       vercel env add ADMIN_EMAIL production`)
  console.log(`       vercel env add CALENDAR_ID production`)
  for (const v of REQUIRED_ENV_VARS) console.log(`       vercel env add ${v} production`)
}

// ── ops list ─────────────────────────────────────────────────────────────

function cmdList() {
  const ids = listTenantIds()
  if (ids.length === 0) {
    console.log('No tenants found.')
    return
  }
  for (const id of ids) {
    try {
      const configPath = path.join(tenantDir(id), 'config.js')
      delete require.cache[require.resolve(configPath)]
      const config = require(configPath)
      console.log(`${id.padEnd(16)} ${(config.name || '').padEnd(30)} ${config.email || ''}`)
    } catch (e) {
      console.log(`${id.padEnd(16)} (failed to load: ${e.message})`)
    }
  }
}

// ── ops validate ─────────────────────────────────────────────────────────

function requireFresh(modPath) {
  delete require.cache[require.resolve(modPath)]
  return require(modPath)
}

function cmdValidate(positional) {
  const id = positional[0]
  if (!id) fail('usage: ops validate <id>')
  const dir = tenantDir(id)
  if (!fs.existsSync(dir)) fail(`tenant "${id}" does not exist at ${dir}`)

  process.env.BUSINESS_ID = id
  process.env.NEXT_PUBLIC_BUSINESS_ID = id

  const errors = []

  // config.js
  let config
  try {
    config = requireFresh(path.join(dir, 'config.js'))
  } catch (e) {
    fail(`config.js failed to load: ${e.message}`)
  }
  const requiredConfigFields = ['id', 'name', 'nameShort', 'email', 'ownerEmail', 'calendarId', 'phone', 'city', 'bookingTag']
  for (const f of requiredConfigFields) {
    if (config[f] === undefined || config[f] === null || config[f] === '') errors.push(`config.${f} missing`)
  }
  if (!config.depot || !config.depot.full) errors.push('config.depot.full missing')
  if (typeof config.taxRate !== 'number') errors.push('config.taxRate missing or not a number')
  if (typeof config.taxRateDecimal !== 'number') errors.push('config.taxRateDecimal missing or not a number')

  // sku-engine.js
  let skuEngine
  try {
    skuEngine = requireFresh(path.join(APP_DIR, 'lib', 'sku-engine.js'))
  } catch (e) {
    errors.push(`sku-engine.js failed to load: ${e.message}`)
  }
  if (skuEngine) {
    if (!skuEngine.SKU_PRICES || typeof skuEngine.SKU_PRICES !== 'object') errors.push('sku-engine.SKU_PRICES missing')
    if (typeof skuEngine.resolveSKU !== 'function') errors.push('sku-engine.resolveSKU missing')
  }

  // catalog.js
  let catalog
  try {
    catalog = requireFresh(path.join(APP_DIR, 'lib', 'catalog.js'))
  } catch (e) {
    errors.push(`catalog.js failed to load: ${e.message}`)
  }
  if (catalog) {
    for (const f of ['ADDONS', 'PRODUCTS', 'productsForQuote', 'addonsForQuote']) {
      if (catalog[f] === undefined) errors.push(`catalog.${f} missing`)
    }
  }

  // service-plans.js / upgrade-paths.js — just confirm they load
  try {
    requireFresh(path.join(dir, 'service-plans.js'))
  } catch (e) {
    errors.push(`service-plans.js failed to load: ${e.message}`)
  }
  try {
    requireFresh(path.join(dir, 'upgrade-paths.js'))
  } catch (e) {
    errors.push(`upgrade-paths.js failed to load: ${e.message}`)
  }

  // business.config.js (picks up id via env, applies business.yaml overlay if present)
  try {
    requireFresh(path.join(APP_DIR, 'lib', 'business.config.js'))
  } catch (e) {
    errors.push(`business.config.js failed to load: ${e.message}`)
  }

  // quote-pricing.js — loads under this tenant and prints pricing tables
  let pricing
  try {
    pricing = requireFresh(path.join(APP_DIR, 'lib', 'quote-pricing.js'))
  } catch (e) {
    errors.push(`quote-pricing.js failed to load: ${e.message}`)
  }

  if (errors.length > 0) {
    console.error(`✗ tenant "${id}" failed validation:`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  console.log(`✓ tenant "${id}" passed validation`)
  console.log('')
  console.log(`config.name:       ${config.name}`)
  console.log(`config.email:      ${config.email}`)
  console.log(`config.calendarId: ${config.calendarId}`)
  console.log('')
  console.log('SKU_PRICES:')
  for (const [sku, price] of Object.entries(skuEngine.SKU_PRICES)) {
    console.log(`  ${sku.padEnd(20)} $${Number(price).toFixed(2)}`)
  }
  if (pricing) {
    console.log('')
    console.log('quote-pricing tables:')
    const printable = {
      BG_RENTAL_PRICE: pricing.BG_RENTAL_PRICE,
      TANK_PRICE: pricing.TANK_PRICE,
      MQ_PRICE: pricing.MQ_PRICE,
      BARRIER_PRICE: pricing.BARRIER_PRICE,
      BG_INSTALL_PRICE: pricing.BG_INSTALL_PRICE,
    }
    console.log(JSON.stringify(printable, null, 2))
  }
}

// ── ops doctor ───────────────────────────────────────────────────────────

function parseEnvFile(envPath) {
  const out = {}
  if (!fs.existsSync(envPath)) return out
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    out[key] = value
  }
  return out
}

function httpPing(url, headers, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false
    const done = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    let req
    try {
      req = https.get(url, { headers, timeout: timeoutMs }, (res) => {
        res.resume()
        done({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode })
      })
    } catch (e) {
      done({ ok: false, error: e.message })
      return
    }
    req.on('timeout', () => { req.destroy(); done({ ok: false, error: 'timeout' }) })
    req.on('error', (e) => done({ ok: false, error: e.message }))
    setTimeout(() => done({ ok: false, error: 'timeout' }), timeoutMs)
  })
}

async function cmdDoctor(positional) {
  const id = positional[0]
  const envPath = path.join(APP_DIR, '.env')
  const env = parseEnvFile(envPath)

  console.log(`Reading env from ${path.relative(REPO_ROOT, envPath)}`)
  if (id) console.log(`(tenant context: ${id})`)
  console.log('')
  console.log('Required environment variables:')
  let missing = 0
  for (const key of REQUIRED_ENV_VARS) {
    const present = !!(env[key] || process.env[key])
    if (!present) missing++
    console.log(`  ${present ? 'OK  ' : 'FAIL'} ${key}`)
  }
  console.log('')

  const TIMEOUT = 8000
  console.log('Service pings:')

  const checks = []

  if (env.STRIPE_SECRET_KEY) {
    checks.push(['Stripe', 'https://api.stripe.com/v1/balance', { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` }])
  } else {
    checks.push(['Stripe', null, null])
  }

  if (env.HUBSPOT_ACCESS_TOKEN) {
    checks.push(['HubSpot', 'https://api.hubapi.com/crm/v3/objects/contacts?limit=1', { Authorization: `Bearer ${env.HUBSPOT_ACCESS_TOKEN}` }])
  } else {
    checks.push(['HubSpot', null, null])
  }

  // Resend: sending-only keys 401 on every read endpoint, so (like the portal's
  // /api/health) only validate the key shape. Resend is the backup channel;
  // Gmail-first sending goes through the Mac notify daemon.
  checks.push(['Resend (key format)', env.RESEND_API_KEY && /^re_[A-Za-z0-9_]{10,}$/.test(env.RESEND_API_KEY) ? 'format-ok' : null, null])

  const chatUrl = env.CHAT_DAEMON_URL || process.env.CHAT_DAEMON_URL
  if (chatUrl) {
    checks.push(['Chat daemon', `${chatUrl.replace(/\/$/, '')}/healthz`, {}])
  } else {
    checks.push(['Chat daemon', null, null])
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) {
    checks.push(['Portal', `${appUrl.replace(/\/$/, '')}/api/ping`, {}])
  } else {
    checks.push(['Portal', null, null])
  }

  for (const [label, url, headers] of checks) {
    if (!url) {
      console.log(`  SKIP ${label} (no URL/key configured)`)
      continue
    }
    if (url === 'format-ok') { console.log(`  OK   ${label}`); continue }
    const result = await httpPing(url, headers, TIMEOUT)
    if (result.ok) {
      console.log(`  OK   ${label} (${result.status})`)
    } else {
      console.log(`  FAIL ${label} (${result.status || result.error})`)
    }
  }

  if (missing > 0) process.exit(1)
}

// ── ops skills ───────────────────────────────────────────────────────────

function cmdSkills(positional) {
  const id = positional[0]
  const builder = path.join(REPO_ROOT, 'ops', 'skills', 'build.js')
  if (!fs.existsSync(builder)) {
    console.log('skills builder not installed')
    return
  }
  const args = id ? [builder, id] : [builder]
  execFileSync('node', args, { stdio: 'inherit' })
}

// ── main ─────────────────────────────────────────────────────────────────

async function main() {
  const [, , cmd, ...rest] = process.argv
  const { positional, flags } = parseArgs(rest)

  switch (cmd) {
    case 'init':
      cmdInit(positional, flags)
      break
    case 'list':
      cmdList()
      break
    case 'validate':
      cmdValidate(positional)
      break
    case 'doctor':
      await cmdDoctor(positional)
      break
    case 'skills':
      cmdSkills(positional)
      break
    default:
      console.log('Usage: ops <init|list|validate|doctor|skills> ...')
      console.log('See ops/cli/README.md for full documentation.')
      process.exit(cmd ? 1 : 0)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
