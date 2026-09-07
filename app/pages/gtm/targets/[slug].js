import Head from 'next/head'
import { useEffect, useState } from 'react'
import GtmLayout from '../../../components/gtm/GtmLayout'
import { gtmServerSideProps } from '../../../lib/gtm-page'
import { slugifyFirm } from '../../../lib/gtm-slug'
import { getTargets } from '../../../lib/gtm-content'
import { mergeTemplate } from '../../../lib/gtm-merge'

export const getServerSideProps = gtmServerSideProps((ctx) => {
  const { slug } = ctx.params
  const { rows } = getTargets()
  const row = rows.find((r) => slugifyFirm(r.firm) === slug)
  if (!row) return { redirect: { destination: '/gtm/targets', permanent: false } }
  return { props: { row } }
})

const STAGES = ['Contacted', 'Call booked', 'Review delivered', 'Partner signed', 'Pilot live', 'Production measured']

const TOUCH_TEMPLATES = {
  1: '{first name},\n\nGreenGuard USA has been building and benchmarking an alternative architecture for distributed Ignition deployments that have outgrown backend fan-in. {{hook}}\n\nWould a 30-minute call make sense in the next two weeks?',
  2: 'Hello {{first_name}}, one specific thing from your work at {{firm}}: {{hook}}. Is there someone on the team who owns that design?',
  3: 'Hello {{first_name}}, no pitch, one page comparing architectures at 40 sites. If not relevant, a one-word reply saves us both a note.',
  4: 'Hello {{first_name}}, thanks for the conversation. We are forming a small group of Architecture Partners at {{firm}} and beyond, ten seats, invitation only.',
}

export default function GtmFirmPage({ session, row }) {
  const [touches, setTouches] = useState([])
  const [callReports, setCallReports] = useState([])
  const [deal, setDeal] = useState(null)
  const [stage, setStage] = useState('')
  const [copiedTouch, setCopiedTouch] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [touchRes, reportRes, dealRes] = await Promise.all([
        fetch(`/api/gtm/touches?firm=${encodeURIComponent(row.firm)}`).then((r) => r.json()),
        fetch(`/api/gtm/call-reports?firm=${encodeURIComponent(row.firm)}`).then((r) => r.json()),
        fetch(`/api/gtm/deals?firm=${encodeURIComponent(row.firm)}`).then((r) => r.json()),
      ])
      if (cancelled) return
      setTouches(touchRes.rows || [])
      setCallReports(reportRes.rows || [])
      setDeal(dealRes.deal || null)
      setStage(dealRes.deal?.stage || '')
    }
    load()
    return () => { cancelled = true }
  }, [row.firm])

  async function saveStage(newStage) {
    setStage(newStage)
    await fetch('/api/gtm/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firm: row.firm, stage: newStage }),
    })
  }

  function composeTouch(n) {
    const fields = { first_name: (row.person || '').split(' ')[0], firm: row.firm, hook: row.hook }
    const { text, unresolved } = mergeTemplate(TOUCH_TEMPLATES[n], fields)
    navigator.clipboard?.writeText(text).catch(() => {})
    setCopiedTouch({ n, text, unresolved })
  }

  const contacts = [1, 2, 3].map((n) => ({
    person: row[n === 1 ? 'person' : `person${n}`],
    title: row[n === 1 ? 'title' : `title${n}`],
    email: row[n === 1 ? 'email' : `email${n}`],
    linkedin: row[n === 1 ? 'linkedin' : `linkedin${n}`],
  })).filter((c) => c.person)

  return (
    <GtmLayout title={row.firm} session={session}>
      <Head><title>{row.firm} · GTM · GreenGuard USA</title></Head>

      <h2>Contacts</h2>
      {contacts.map((c, i) => (
        <p key={i}>{c.person} · {c.title} {c.email && `(${c.email})`} {c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}</p>
      ))}

      <h2>Hook</h2>
      <p>{row.hook}</p>
      <p>Score: {row.score || '-'} Tier: {row.tier || '-'}</p>

      <h2>Stage</h2>
      <select value={stage} onChange={(e) => saveStage(e.target.value)}>
        <option value="">Not started</option>
        {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      <h2>Compose touch</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        {[1, 2, 3, 4].map((n) => (
          <button key={n} onClick={() => composeTouch(n)}>Touch {n}</button>
        ))}
      </div>
      {copiedTouch && (
        <div style={{ marginTop: 12, border: '1px solid var(--border-gold)', borderRadius: 8, padding: 12 }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Copied to clipboard.</p>
          <pre style={{ whiteSpace: 'pre-wrap' }}>
            {copiedTouch.text.split(/(\{\{[^}]+\}\})/).map((part, i) =>
              copiedTouch.unresolved.some((u) => part.includes(u)) && part.startsWith('{{')
                ? <mark key={i} style={{ background: '#b23', color: '#fff' }}>{part}</mark>
                : <span key={i}>{part}</span>
            )}
          </pre>
        </div>
      )}

      <h2>Touches</h2>
      {touches.map((t) => (
        <p key={t.id}>{t.sent_at?.slice(0, 10)} · touch {t.touch} to {t.person} via {t.channel} {t.reply && '(replied)'}</p>
      ))}

      <h2>Call reports</h2>
      {callReports.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No call reports yet.</p>}
      {callReports.map((c) => (
        <p key={c.id}>{c.created_at?.slice(0, 10)} · {c.contact_email || c.email}</p>
      ))}
    </GtmLayout>
  )
}
