// Slack incoming webhook — post operational alerts to #ops.
// Set SLACK_WEBHOOK_URL in Vercel env to enable. Silently skips if not set.
// Create a webhook at: api.slack.com → Your Apps → Incoming Webhooks

async function postToOps(text) {
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) return { ok: false, reason: 'SLACK_WEBHOOK_URL not set' }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    return { ok: res.ok, status: res.status }
  } catch (e) {
    console.error('slack postToOps:', e.message)
    return { ok: false, error: e.message }
  }
}

module.exports = { postToOps }
