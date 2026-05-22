// Google Natural Language API — sentiment analysis for reviews
const { google } = require('googleapis')

function getAuth() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
  return auth
}

async function analyzeSentiment(text) {
  const auth = getAuth()
  if (!auth) throw new Error('NL auth not configured')
  const nl = google.language({ version: 'v1', auth })
  const res = await nl.documents.analyzeSentiment({
    requestBody: {
      document: { type: 'PLAIN_TEXT', content: text },
      encodingType: 'UTF8',
    },
  })
  const s = res.data.documentSentiment
  return {
    score: s.score,       // -1.0 (negative) to 1.0 (positive)
    magnitude: s.magnitude, // 0.0+ (strength of sentiment)
    label: s.score > 0.25 ? 'positive' : s.score < -0.25 ? 'negative' : 'neutral',
  }
}

async function analyzeEntities(text) {
  const auth = getAuth()
  if (!auth) throw new Error('NL auth not configured')
  const nl = google.language({ version: 'v1', auth })
  const res = await nl.documents.analyzeEntities({
    requestBody: { document: { type: 'PLAIN_TEXT', content: text } },
  })
  return (res.data.entities || []).map(e => ({ name: e.name, type: e.type, salience: e.salience }))
}

// Batch analyze multiple reviews
async function analyzeReviews(reviews) {
  const results = []
  for (const review of reviews) {
    try {
      const sentiment = await analyzeSentiment(review.text || review)
      results.push({ ...review, sentiment })
    } catch {
      results.push({ ...review, sentiment: null })
    }
  }
  return results
}

module.exports = { analyzeSentiment, analyzeEntities, analyzeReviews }
