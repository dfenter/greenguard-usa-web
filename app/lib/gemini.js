// Google Gemini 2.0 Flash — AI text generation
const MODEL = 'gemini-2.0-flash-lite'
const BASE = 'https://generativelanguage.googleapis.com/v1beta'

async function generate(prompt, systemInstruction = null) {
  const key = process.env.GOOGLE_GEMINI_API_KEY
  if (!key) throw new Error('GOOGLE_GEMINI_API_KEY not set')

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
  }
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] }
  }

  const res = await fetch(`${BASE}/models/${MODEL}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Gemini error')
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

// Draft a post-visit email from completed rounds data
async function draftVisitEmail({ customerName, address, services, notes, techName }) {
  const svcList = services.filter(Boolean).join(', ')
  return generate(
    `Write a friendly, brief post-service email for a mosquito control company.
Customer: ${customerName || 'Customer'}
Property: ${address || 'Austin, TX'}
Services completed today: ${svcList || 'routine service'}
Tech notes: ${notes || 'none'}
Tech name: ${techName || 'your GreenGuard technician'}

Requirements:
- 3-4 short paragraphs, warm and professional
- Mention what was done specifically
- Remind them their protection is active
- Invite them to reply with any questions
- Sign off from GreenGuard USA
- Do NOT mention free trial or contracts
- Do NOT use the word "chemical" — use "pesticide" instead`,
    'You are a friendly customer service writer for GreenGuard USA, an Austin-based pesticide-free CO₂ mosquito trap service.'
  )
}

// Analyze sentiment of a customer review
async function analyzeReviewSentiment(reviewText) {
  const result = await generate(
    `Analyze this customer review and return a JSON object with:
- sentiment: "positive" | "neutral" | "negative"
- score: 0.0 to 1.0 (1.0 = very positive)
- topics: array of strings (what they mentioned: service, pricing, technician, results, etc.)
- response_needed: true if they raised a concern or question

Review: "${reviewText}"

Return ONLY valid JSON, no other text.`,
  )
  try { return JSON.parse(result.replace(/```json\n?|\n?```/g, '')) }
  catch { return { sentiment: 'neutral', score: 0.5, topics: [], response_needed: false } }
}

// Generate a draft Google Business Profile post
async function draftBusinessPost(topic) {
  return generate(
    `Write a short Google Business Profile post for GreenGuard USA, an Austin-based pesticide-free CO₂ mosquito trap company.
Topic: ${topic}
Requirements: 2-3 sentences max, local Austin focus, include a call to action, no hashtags, professional but friendly.`,
  )
}

// Suggest an upsell message for a customer
async function draftUpsellMessage({ customerName, currentPlan, suggestedUpgrade, reason }) {
  return generate(
    `Write a brief, friendly upsell message for a mosquito control customer.
Customer: ${customerName}
Current service: ${currentPlan}
Suggested upgrade: ${suggestedUpgrade}
Reason: ${reason}
Keep it to 2-3 sentences. No pressure. Focus on their benefit. Do not mention free trial.`,
  )
}

module.exports = { generate, draftVisitEmail, analyzeReviewSentiment, draftBusinessPost, draftUpsellMessage }
