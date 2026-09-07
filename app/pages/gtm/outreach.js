import Head from 'next/head'
import { useMemo, useState } from 'react'
import GtmLayout from '../../components/gtm/GtmLayout'
import { gtmServerSideProps } from '../../lib/gtm-page'
import { getPage, getTargets } from '../../lib/gtm-content'
import { mergeTemplate } from '../../lib/gtm-merge'

export const getServerSideProps = gtmServerSideProps(() => {
  const firstEmail = getPage('07-outreach/outreach-first-email')
  const sequence = getPage('07-outreach/outreach-sequence')
  const { rows } = getTargets()
  const targets = rows.map((r) => ({ firm: r.firm, person: r.person, hook: r.hook }))
  return { props: { firstEmail, sequence, targets } }
})

export default function GtmOutreach({ session, firstEmail, sequence, targets }) {
  const [firmIdx, setFirmIdx] = useState('')
  const [copied, setCopied] = useState(null)
  const selected = firmIdx !== '' ? targets[Number(firmIdx)] : null

  const preview = useMemo(() => {
    if (!selected) return null
    const fields = {
      first_name: (selected.person || '').split(' ')[0] || '',
      firm: selected.firm,
      hook: selected.hook,
    }
    const template = '{{first_name}},\n\n{{hook}}\n\nWould a 30-minute call with one of your Ignition architects make sense in the next two weeks?\n\n{{signature}}'
    return mergeTemplate(template, fields)
  }, [selected])

  function copyPreview() {
    if (!preview) return
    navigator.clipboard?.writeText(preview.text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <GtmLayout title="Outreach" session={session}>
      <Head><title>GTM Outreach — GreenGuard USA</title></Head>

      <div style={{ border: '1px solid var(--border-gold)', borderRadius: 10, padding: 16, marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>Live merge preview</h2>
        <select value={firmIdx} onChange={(e) => setFirmIdx(e.target.value)} style={{ marginBottom: 10 }}>
          <option value="">Pick a firm / person</option>
          {targets.map((t, i) => <option key={t.firm} value={i}>{t.firm} — {t.person}</option>)}
        </select>
        {preview && (
          <>
            <pre style={{ whiteSpace: 'pre-wrap', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
              {preview.text.split(/(\{\{[^}]+\}\})/).map((part, i) =>
                preview.unresolved.some((u) => part.includes(u)) && part.startsWith('{{')
                  ? <mark key={i} style={{ background: '#b23', color: '#fff' }}>{part}</mark>
                  : <span key={i}>{part}</span>
              )}
            </pre>
            <button onClick={copyPreview}>{copied ? 'Copied' : 'Copy'}</button>
          </>
        )}
      </div>

      {firstEmail && (
        <div style={{ marginBottom: 32 }}>
          <h2>{firstEmail.title}</h2>
          <div dangerouslySetInnerHTML={{ __html: firstEmail.html }} />
        </div>
      )}

      {sequence && (
        <div>
          <h2>{sequence.title}</h2>
          <div dangerouslySetInnerHTML={{ __html: sequence.html }} />
        </div>
      )}
    </GtmLayout>
  )
}
