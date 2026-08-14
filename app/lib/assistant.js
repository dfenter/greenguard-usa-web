// Shared Claude tool-calling runner for the in-portal assistants
// (customer + admin/tech). Each tool is { name, description, input_schema, run }.
// The runner loops on `tool_use` stops, executes the matching tool, feeds the
// result back, and returns the final assistant text plus the list of tools used.

const { client: getClient } = require('./claude')

const DEFAULT_MODEL = process.env.ASSISTANT_MODEL || 'claude-opus-5'

async function runAssistant({
  system,
  history = [],
  userMessage,
  images = [], // [{ media_type, data (base64) }] — sent as vision blocks ahead of the text
  tools = [],
  model = DEFAULT_MODEL,
  maxTokens = 1024,
  maxTurns = 6,
}) {
  const client = getClient()
  const toolDefs = tools.map(({ name, description, input_schema }) => ({ name, description, input_schema }))
  const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]))

  const messages = [
    ...(Array.isArray(history) ? history : [])
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content })),
    {
      role: 'user',
      content: Array.isArray(images) && images.length
        ? [
            ...images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.media_type, data: i.data } })),
            { type: 'text', text: userMessage },
          ]
        : userMessage,
    },
  ]

  const actions = []
  for (let turn = 0; turn < maxTurns; turn++) {
    const resp = await client.messages.create({
      model, max_tokens: maxTokens, system,
      output_config: { effort: 'low' },
      ...(toolDefs.length ? { tools: toolDefs } : {}),
      messages,
    })

    if (resp.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: resp.content })
      const toolResults = []
      for (const block of resp.content.filter((b) => b.type === 'tool_use')) {
        const tool = toolMap[block.name]
        let result
        try {
          result = tool ? await tool.run(block.input || {}) : { error: `unknown tool: ${block.name}` }
          actions.push({ name: block.name, input: block.input })
        } catch (e) {
          result = { error: e.message || 'tool failed' }
        }
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
      }
      messages.push({ role: 'user', content: toolResults })
      continue
    }

    const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
    return { reply: text, actions }
  }

  return { reply: "I couldn't finish that one. I've flagged it for the team to follow up.", actions }
}

module.exports = { runAssistant }
