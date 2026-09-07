import Head from 'next/head'
import { useEffect, useState } from 'react'
import GtmLayout from '../../components/gtm/GtmLayout'
import { gtmServerSideProps } from '../../lib/gtm-page'

export const getServerSideProps = gtmServerSideProps()

const COLUMNS = [
  ['competitor', 'Competitor / approach'],
  ['best_at', 'Best at'],
  ['difference', 'Where SparkBridge differs'],
  ['do_not_claim', 'Do not claim'],
  ['heard_in_field', 'Heard in the field (date, firm)'],
]

const EMPTY = { competitor: '', best_at: '', difference: '', do_not_claim: '', heard_in_field: '' }

export default function GtmCompetitive({ session }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    const data = await fetch('/api/gtm/library?kind=competitive').then((r) => r.json())
    setRows(data.rows || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/gtm/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'competitive', data: form }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'save failed')
    } else {
      setForm(EMPTY)
      await load()
    }
    setSaving(false)
  }

  return (
    <GtmLayout title="Competitive" session={session}>
      <Head><title>GTM Competitive · GreenGuard USA</title></Head>
      <p>Living document. Honest by rule: name what each does well. Where a module-MQTT cell reads the same as ours, say so.</p>

      {loading ? <p>Loading...</p> : (
        <div style={{ overflowX: 'auto', marginBottom: 28 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                {COLUMNS.map(([key, label]) => (
                  <th key={key} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border-gold)' }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {COLUMNS.map(([key]) => (
                    <td key={key} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-gold)', verticalAlign: 'top' }}>{r.data?.[key] || ''}</td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={COLUMNS.length} style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>No rows yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 12 }}>Add row</h2>
      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 560 }}>
        {COLUMNS.map(([key, label]) => (
          <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
            {label}
            <input
              type="text"
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-gold)' }}
            />
          </label>
        ))}
        <button type="submit" disabled={saving} style={{
          alignSelf: 'flex-start', padding: '10px 20px', borderRadius: 8, fontWeight: 800,
          background: 'var(--gold)', border: 'none', cursor: 'pointer',
        }}>
          {saving ? 'Saving...' : 'Add row'}
        </button>
      </form>
    </GtmLayout>
  )
}
