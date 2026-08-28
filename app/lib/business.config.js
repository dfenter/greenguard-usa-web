// NEXT_PUBLIC_ variant so client bundles resolve the same tenant as the server.
const id = process.env.NEXT_PUBLIC_BUSINESS_ID || process.env.BUSINESS_ID || 'greenguard'

let config
try {
  config = require(`./businesses/${id}/config.js`)
} catch {
  throw new Error(`Unknown BUSINESS_ID "${id}" — create app/lib/businesses/${id}/config.js`)
}

// Optional OPS overlay: app/lib/businesses/<id>/business.yaml, deep-merged OVER
// config.js (yaml wins). Server-only — on the client we just use config.js.
// Guarded with try/catch so a missing file, a bad require of `fs`/`js-yaml` in
// a browser-like bundling pass, or a YAML parse error never breaks the tenant.
if (typeof window === 'undefined') {
  try {
    const fs = require('fs')
    const path = require('path')
    const yaml = require('js-yaml')

    const yamlPath = path.join(__dirname, 'businesses', id, 'business.yaml')
    if (fs.existsSync(yamlPath)) {
      const raw = fs.readFileSync(yamlPath, 'utf8')
      const overlay = yaml.load(raw)
      if (overlay && typeof overlay === 'object') {
        config = deepMerge(config, overlay)
      }
    }
  } catch {
    // Missing js-yaml, unreadable file, or bad YAML — fall back to config.js as-is.
  }
}

function deepMerge(base, overlay) {
  const out = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    if (
      value && typeof value === 'object' && !Array.isArray(value) &&
      out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(out[key], value)
    } else {
      out[key] = value
    }
  }
  return out
}

module.exports = Object.freeze(config)
