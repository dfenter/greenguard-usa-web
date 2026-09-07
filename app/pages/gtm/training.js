import Head from 'next/head'
import { useEffect, useState } from 'react'
import GtmLayout from '../../components/gtm/GtmLayout'
import { gtmServerSideProps } from '../../lib/gtm-page'
import { getPdfList } from '../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps(() => {
  const pdfs = getPdfList().filter((f) => f.startsWith('02-training__'))
  return { props: { pdfs } }
})

function labelFor(fileName) {
  const base = fileName.replace('02-training__', '').replace(/\.pdf$/i, '')
  return base.replace(/[-_]/g, ' ')
}

const CERTS = [
  { id: 'cert-quiz', label: 'Passed the SE training quiz' },
  { id: 'cert-demo', label: 'Ran a live product demo' },
  { id: 'cert-shadow-call', label: 'Shadowed a discovery call' },
]

export default function GtmTraining({ session, pdfs }) {
  const [done, setDone] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/gtm/progress').then((r) => r.json()).then((data) => {
      if (cancelled) return
      const map = {}
      for (const row of data.rows || []) map[row.item_id] = row.done
      setDone(map)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  async function toggle(itemId) {
    const prev = done[itemId]
    setDone((d) => ({ ...d, [itemId]: !prev }))
    try {
      const res = await fetch('/api/gtm/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, done: !prev }),
      })
      if (!res.ok) throw new Error('save failed')
    } catch {
      setDone((d) => ({ ...d, [itemId]: prev }))
    }
  }

  const certDone = CERTS.filter((c) => done[c.id]).length

  return (
    <GtmLayout title="Training" session={session}>
      <Head><title>GTM Training · GreenGuard USA</title></Head>
      <p>SE training modules, quiz, and price cheat sheet.</p>

      <div style={{ border: '1px solid var(--border-gold)', borderRadius: 10, padding: 16, marginBottom: 28 }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 800, marginTop: 0 }}>Certification ({certDone}/3)</h2>
        {!loading && CERTS.map((c) => (
          <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <input type="checkbox" checked={Boolean(done[c.id])} onChange={() => toggle(c.id)} />
            {c.label}
          </label>
        ))}
      </div>

      {pdfs.length === 0 && <p>No training PDFs found. Run scripts/build-gtm-content.js.</p>}
      {pdfs.map((f) => (
        <div key={f} style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>{labelFor(f)}</h2>
          <a href={`/gtm/${f}`} target="_blank" rel="noreferrer">Open PDF</a>
          <div style={{ border: '1px solid var(--border-gold)', borderRadius: 8, marginTop: 8 }}>
            <iframe src={`/gtm/${f}`} title={labelFor(f)} style={{ width: '100%', height: 560, border: 0 }} />
          </div>
        </div>
      ))}
    </GtmLayout>
  )
}
