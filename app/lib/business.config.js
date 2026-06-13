const id = process.env.BUSINESS_ID || 'greenguard'

let config
try {
  config = require(`./businesses/${id}/config.js`)
} catch {
  throw new Error(`Unknown BUSINESS_ID "${id}" — create app/lib/businesses/${id}/config.js`)
}

module.exports = Object.freeze(config)
