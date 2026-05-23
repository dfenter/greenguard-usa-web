const { listAllCustomers } = require('../../../lib/stripe')

let cache = null
let cacheTime = 0

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  res.setHeader('Access-Control-Allow-Origin', 'https://www.greenguard-usa.com')

  if (cache && Date.now() - cacheTime < 3600000) {
    return res.status(200).json(cache)
  }

  try {
    const customers = await listAllCustomers()
    const count = customers.filter(c => !c.deleted && c.email).length
    cache = { customerCount: count, rating: 5.0, reviewCount: 18 }
    cacheTime = Date.now()
    res.status(200).json(cache)
  } catch {
    res.status(200).json({ customerCount: 90, rating: 5.0, reviewCount: 18 })
  }
}
