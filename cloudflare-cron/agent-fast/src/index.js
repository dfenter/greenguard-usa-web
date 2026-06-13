// greenguard-cron-agent-fast — cron dispatcher.
//
// daily 8am CT: email-agent (Gmail draft processing, once per day)
// 15-min:       books-ingest (Stripe ledger sync) + inline site-health check

const PORTAL = 'https://portal.greenguard-usa.com'
const AGENT  = 'https://greenguard-agent-new.onrender.com'

const JOBS = {
  '0 13 * * *': [
    { name: 'email-agent', url: `${AGENT}/cron/email-agent` },
  ],
  '*/5 * * * *': [
    { name: 'keep-alive', url: `${AGENT}/health`, method: 'GET' },
  ],
  '*/15 * * * *': [
    { name: 'books-ingest', url: `${PORTAL}/api/cron/books-ingest?days=2` },
    { name: 'site-health',  handler: 'siteHealth' },
  ],
}

async function runHttp(job, env) {
  const res = await fetch(job.url, {
    method: job.method || 'POST',
    headers: {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      'x-cron-key': env.CRON_SECRET,
      'User-Agent': 'greenguard-cron-agent-fast/1.0',
    },
  })
  const body = await res.text()
  const line = `[${job.name}] → ${res.status}`
  if (!res.ok) console.error(`${line}\n${body.slice(0, 500)}`)
  else console.log(line)
  return { name: job.name, status: res.status, ok: res.ok }
}

async function sendAlert(env, subject, html) {
  if (!env.RESEND_API_KEY) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'alerts@greenguard-usa.com',
      to: ['admin@greenguard-usa.com'],
      subject, html,
    }),
  })
}

async function siteHealth(env) {
  const checks = [
    { name: 'site',   url: 'https://www.greenguard-usa.com' },
    { name: 'portal', url: `${PORTAL}/api/ping` },
  ]
  const results = {}
  for (const c of checks) {
    try {
      const r = await fetch(c.url, { method: 'GET', cf: { cacheTtl: 0 } })
      results[c.name] = r.status
    } catch (e) {
      results[c.name] = `err:${e.message.slice(0, 40)}`
    }
  }

  if (results.site !== 200 && env.VERCEL_SITE_DEPLOY_HOOK) {
    await fetch(env.VERCEL_SITE_DEPLOY_HOOK, { method: 'POST' })
    await sendAlert(env, '🚨 GreenGuard site is DOWN — auto-healing',
      `<p><strong>www.greenguard-usa.com returned HTTP ${results.site}</strong></p>
       <p>A redeploy has been triggered automatically. Should be back within 60 seconds.</p>`)
  }
  if (results.portal !== 200) {
    await sendAlert(env, '🚨 GreenGuard PORTAL is DOWN',
      `<p><strong>portal.greenguard-usa.com is not responding.</strong></p>
       <p>Health check: HTTP ${results.portal}</p>
       <p>Check Vercel dashboard.</p>`)
  }
  console.log(`[site-health] ${JSON.stringify(results)}`)
  return { name: 'site-health', ...results }
}

async function runJob(job, env) {
  if (job.handler === 'siteHealth') return siteHealth(env)
  return runHttp(job, env)
}

export default {
  async scheduled(event, env, ctx) {
    const jobs = JOBS[event.cron] || []
    if (!jobs.length) return console.warn(`no jobs for "${event.cron}"`)
    ctx.waitUntil(Promise.all(jobs.map((j) => runJob(j, env))))
  },
  async fetch(req, env) {
    const url = new URL(req.url)
    if (url.pathname === '/run') {
      const name = url.searchParams.get('name')
      const job = Object.values(JOBS).flat().find((j) => j.name === name)
      if (!job) return new Response(`unknown: ${name}`, { status: 404 })
      return new Response(JSON.stringify(await runJob(job, env)),
        { headers: { 'content-type': 'application/json' } })
    }
    return new Response('greenguard-cron-agent-fast', { status: 200 })
  },
}
