// greenguard-cron-portal — Vercel portal cron dispatcher.
//
// 5 schedules; each cron fires scheduled() with event.cron set to the
// literal pattern. We dispatch one or more HTTP calls per pattern.

const PORTAL = 'https://portal.greenguard-usa.com'

const JOBS = {
  '0 11 * * *': [
    { name: 'billing-warn', url: `${PORTAL}/api/cron/billing-run?mode=warn` },
  ],
  '0 12 * * *': [
    { name: 'billing-run',  url: `${PORTAL}/api/cron/billing-run?mode=run` },
    { name: 'books-daily',  url: `${PORTAL}/api/cron/books-daily` },
  ],
  '0 11 1 * *': [
    { name: 'books-close', url: `${PORTAL}/api/cron/books-close` },
  ],
  '0 * * * *': [
    { name: 'acuity-leak', url: `${PORTAL}/api/cron/acuity-leak` },
  ],
}

async function runJob(job, env) {
  const res = await fetch(job.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      'x-cron-key': env.CRON_SECRET,
      'User-Agent': 'greenguard-cron-portal/1.0',
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
    return new Response('greenguard-cron-portal', { status: 200 })
  },
}
