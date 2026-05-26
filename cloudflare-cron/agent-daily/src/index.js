// greenguard-cron-agent-daily — Render webhook daily cron dispatcher.

const AGENT = 'https://greenguard-agent-tmw2.onrender.com'

const JOBS = {
  '30 12 * * 1-6': [{ name: 'daily-route',           url: `${AGENT}/cron/daily-route` }],
  '0 13 * * *':    [{ name: 'post-appointment',      url: `${AGENT}/cron/post-appointment` }],
  '15 14 * * *':   [{ name: 'review-followup',       url: `${AGENT}/cron/review-followup` }],
  '0 18 * * *':    [{ name: 'appointment-reminders', url: `${AGENT}/cron/appointment-reminders` }],
  '0 15 * * 1':    [{ name: 'route-optimizer',       url: `${AGENT}/cron/route-optimizer` }],
}

async function runJob(job, env) {
  const res = await fetch(job.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      'x-cron-key': env.CRON_SECRET,
      'User-Agent': 'greenguard-cron-agent-daily/1.0',
    },
  })
  const body = await res.text()
  const line = `[${job.name}] → ${res.status}`
  if (!res.ok) console.error(`${line}\n${body.slice(0, 500)}`)
  else console.log(line)
  return { name: job.name, status: res.status, ok: res.ok }
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
    return new Response('greenguard-cron-agent-daily', { status: 200 })
  },
}
