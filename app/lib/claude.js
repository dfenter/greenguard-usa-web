// Shared Claude client + helpers. Default to Claude Haiku 4.5 for cost; bump
// to Sonnet for tasks that need stronger reasoning.

const Anthropic = require('@anthropic-ai/sdk').default

const MODEL_FAST = 'claude-haiku-4-5-20251001'
const MODEL_SMART = 'claude-sonnet-4-6'

let _client
function client() {
  if (_client) return _client
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

// JSON-mode helper. Prompts Claude to return strict JSON; parses + returns.
async function askJSON({ system, user, model = MODEL_FAST, max_tokens = 1024 }) {
  const msg = await client().messages.create({
    model, max_tokens,
    system: system + '\n\nRespond with VALID JSON only — no prose, no markdown fences. Start with { and end with }.',
    messages: [{ role: 'user', content: user }],
  })
  const text = (msg.content || []).map((b) => b.text || '').join('').trim()
  // Strip accidental code fences
  const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim()
  return JSON.parse(cleaned)
}

// Vision helper. Takes an image URL, returns parsed JSON per `system` prompt.
async function visionJSON({ system, imageUrl, prompt, model = MODEL_FAST, max_tokens = 1024 }) {
  // Fetch image as base64 (Claude vision accepts URL or base64; base64 is safer for blob URLs)
  const r = await fetch(imageUrl)
  if (!r.ok) throw new Error(`image fetch ${r.status}`)
  const buf = Buffer.from(await r.arrayBuffer())
  const mediaType = r.headers.get('content-type') || 'image/jpeg'
  const data = buf.toString('base64')

  const msg = await client().messages.create({
    model, max_tokens,
    system: system + '\n\nRespond with VALID JSON only — no prose, no markdown fences.',
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
        { type: 'text', text: prompt },
      ],
    }],
  })
  const text = (msg.content || []).map((b) => b.text || '').join('').trim()
  const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim()
  return JSON.parse(cleaned)
}

// Conversational helper with optional tool use.
async function chat({ system, messages, tools, model = MODEL_FAST, max_tokens = 1024 }) {
  return client().messages.create({
    model, max_tokens, system, messages,
    ...(tools ? { tools } : {}),
  })
}

module.exports = { client, askJSON, visionJSON, chat, MODEL_FAST, MODEL_SMART }
