const id = process.env.BUSINESS_ID || 'greenguard'
module.exports = require(`./businesses/${id}/sku-engine.js`)
