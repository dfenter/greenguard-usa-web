const { localComplete } = require('./claude-local')
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
  // Local-first: Claude CLI (Opus, low effort) on the office Mac.
  const local = await localComplete({ system: opts.system || '', prompt: opts.user, json: !!opts.json })
  if (local) return { text: local.text, usage: local.usage, model: 'claude-cli-opus-low' }
  // Skip Gemini entirely when the key is missing or known-bad.
  if (process.env.GOOGLE_GEMINI_API_KEY) {
    try {
      return await callGemini(opts)
    } catch (e) {
      // Fall back to Groq on rate-limit, server error, or any auth issue.
      const fallback = e.status === 429
        || (e.status >= 500 && e.status < 600)
        || e.status === 400  // includes "API key not valid"
        || e.status === 401 || e.status === 403
      if (!fallback) throw e
      console.warn('Gemini failed, falling back to Groq:', e.message.slice(0, 120))
    }
  }
  return await callGroq(opts)
}

module.exports = { complete, callGemini, callGroq }
