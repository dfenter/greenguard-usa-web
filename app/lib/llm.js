// Thin LLM wrapper. Gemini primary, Groq fallback on rate-limit / 5xx.
// Both free at GreenGuard's scale.

async function callGemini({ system, user, model = 'gemini-2.5-flash-lite', json = false, maxTokens = 1024 }) {
  const key = process.env.GOOGLE_GEMINI_API_KEY
  if (!key) throw new Error('GOOGLE_GEMINI_API_KEY not set')

  const body = {
    contents: [{ role: 'user', parts: [{ text: user }] }],
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.1,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    const e = new Error(`gemini ${res.status}: ${err.slice(0, 200)}`)
    e.status = res.status
    throw e
  }
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''
  return { text, usage: data.usageMetadata, model }
}

async function callGroq({ system, user, model = 'llama-3.3-70b-versatile', json = false, maxTokens = 1024 }) {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY not set')
  const messages = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: user })

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, messages, max_tokens: maxTokens, temperature: 0.1,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    const e = new Error(`groq ${res.status}: ${err.slice(0, 200)}`)
    e.status = res.status
    throw e
  }
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content || ''
  return { text, usage: data.usage, model }
}

/**
 * Run an LLM completion. Try Gemini first; on rate-limit (429) or server
 * error (5xx), fall back to Groq. Throws on both failures.
 */
async function complete(opts) {
  try {
    return await callGemini(opts)
  } catch (e) {
    if (e.status === 429 || (e.status >= 500 && e.status < 600)) {
      console.warn('Gemini failed, falling back to Groq:', e.message)
      return await callGroq(opts)
    }
    throw e
  }
}

module.exports = { complete, callGemini, callGroq }
