// Google Gemini 2.0 Flash — AI text generation
const biz = require('./business.config')
const { localComplete, imageFromUrl } = require('./claude-local')
const MODEL = 'gemini-2.0-flash-lite'
const BASE = 'https://generativelanguage.googleapis.com/v1beta'

async function generate(prompt, systemInstruction = null) {
  const local = await localComplete({ system: systemInstruction || '', prompt })
  if (local) return local.text
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
Property: ${address || biz.city}
Services completed today: ${svcList || 'routine service'}
Tech notes: ${notes || 'none'}
Tech name: ${techName || biz.gemini.techLabel}

Requirements:
- 3-4 short paragraphs, warm and professional
- Mention what was done specifically
- Remind them their protection is active
- Invite them to reply with any questions
- Sign off from ${biz.gemini.signOff}
- Do NOT mention free trial or contracts
- Do NOT use the word "chemical" — use "pesticide" instead`,
    `You are a friendly customer service writer for ${biz.gemini.companyDescription}.`
  )
}

// Generate a draft Google Business Profile post
async function draftBusinessPost(topic) {
  return generate(
    `Write a short Google Business Profile post for ${biz.gemini.companyDescription}.
Topic: ${topic}
Requirements: 2-3 sentences max, local ${biz.city} focus, include a call to action, no hashtags, professional but friendly.`,
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

// ── JSON output helper ───────────────────────────────────────────────────────
async function generateJSON({ system, user, maxTokens = 1024 }) {
  const local = await localComplete({ system: system || '', prompt: user, json: true })
  if (local) return JSON.parse(local.text)
  const key = process.env.GOOGLE_GEMINI_API_KEY
  if (!key) throw new Error('GOOGLE_GEMINI_API_KEY not set')
  const body = {
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0.2, maxOutputTokens: maxTokens,
      responseMimeType: 'application/json',
    },
  }
  if (system) body.systemInstruction = { parts: [{ text: system }] }
  const res = await fetch(`${BASE}/models/${MODEL}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Gemini error')
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  return JSON.parse(text)
}

// ── Vision helper ────────────────────────────────────────────────────────────
async function visionJSON({ system, imageUrl, prompt, maxTokens = 1024 }) {
  try {
    const img = await imageFromUrl(imageUrl)
    const local = img && await localComplete({ system: system || '', prompt, images: [img], json: true })
    if (local) return JSON.parse(local.text)
  } catch (e) { console.log('claude-local vision skipped:', e.message) }
  const key = process.env.GOOGLE_GEMINI_API_KEY
  if (!key) throw new Error('GOOGLE_GEMINI_API_KEY not set')
  const r = await fetch(imageUrl)
  if (!r.ok) throw new Error(`image fetch ${r.status}`)
  const buf = Buffer.from(await r.arrayBuffer())
  const mimeType = (r.headers.get('content-type') || 'image/jpeg').split(';')[0]
  const data = buf.toString('base64')

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data } },
        { text: prompt },
      ],
    }],
    generationConfig: {
      temperature: 0.1, maxOutputTokens: maxTokens,
      responseMimeType: 'application/json',
    },
  }
  if (system) body.systemInstruction = { parts: [{ text: system }] }
  const res = await fetch(`${BASE}/models/${MODEL}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const d = await res.json()
  if (!res.ok) throw new Error(d.error?.message || 'Gemini vision error')
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  return JSON.parse(text)
}

// ── Conversational chat (multi-turn, optional tools via prompt-engineering) ──
async function chat({ system, history = [], userMessage, maxTokens = 1024, temperature = 0.5 }) {
  {
    const h = history.map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`).join('\n')
    const local = await localComplete({ system: system || '', prompt: h ? `Earlier:\n${h}\n\nNew message: ${userMessage}` : userMessage })
    if (local) return local.text
  }
  const key = process.env.GOOGLE_GEMINI_API_KEY
  if (!key) throw new Error('GOOGLE_GEMINI_API_KEY not set')
  const contents = []
  for (const m of history) {
    contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })
  }
  contents.push({ role: 'user', parts: [{ text: userMessage }] })
  const body = {
    contents,
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  }
  if (system) body.systemInstruction = { parts: [{ text: system }] }
  const res = await fetch(`${BASE}/models/${MODEL}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const d = await res.json()
  if (!res.ok) throw new Error(d.error?.message || 'Gemini chat error')
  return d.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

module.exports = { generate, generateJSON, visionJSON, chat, draftVisitEmail, draftBusinessPost, draftUpsellMessage }
