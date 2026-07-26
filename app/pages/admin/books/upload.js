import Head from 'next/head'
import Link from 'next/link'
import { useState, useRef } from 'react'
import PortalLayout from '../../../components/PortalLayout'
import { getSessionFromRequest, isOwnerEmail } from '../../../lib/auth'
import { q } from '../../../lib/db'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isOwnerEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }

  const cats = await q(`SELECT id, label, type FROM categories ORDER BY type, label`)
  return { props: { categories: cats.rows } }
}

function fmt$(cents) {
  const sign = cents < 0 ? '-' : ''
  return sign + '$' + (Math.abs(cents) / 100).toFixed(2)
}
function fmtDate(iso) { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }

export default function UploadCsvPage({ categories }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [parseErrors, setParseErrors] = useState([])
  const [rows, setRows] = useState([])
  const [importResult, setImportResult] = useState(null)
  const fileRef = useRef(null)

  const grouped = categories.reduce((m, c) => { (m[c.type] ||= []).push(c); return m }, {})

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setError(null); setRows([]); setImportResult(null); setParseErrors([])
    try {
      const text = await file.text()
      const res = await fetch('/api/admin/books-upload-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', csv: text }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setRows((j.rows || []).map((r) => ({
        ...r,
        category_label: r.suggested?.label || 'Unknown',
        category_id: r.suggested?.id || null,
        include: true,
      })))
      setParseErrors(j.errors || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function updateRow(i, patch) {
    setRows((rs) => rs.map((r, j) => j === i ? { ...r, ...patch } : r))
  }

  function pickCategory(i, label) {
    const cat = categories.find((c) => c.label === label)
    updateRow(i, { category_label: label, category_id: cat?.id || null })
  }

  async function doImport() {
    const toImport = rows.filter((r) => r.include)
    if (toImport.length === 0) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/admin/books-upload-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import',
          rows: toImport.map((r) => ({
            occurred_at: r.occurred_at,
            amount_cents: r.amount_cents,
            description: r.description,
            category_id: r.category_id,
            category_label: r.category_label,
          })),
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setImportResult(j)
      setRows([])
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const selectedCount = rows.filter((r) => r.include).length
  const selectedSum = rows.filter((r) => r.include).reduce((s, r) => s + r.amount_cents, 0)

  const inputStyle = { padding: '6px 8px', borderRadius: 5, border: '1px solid rgba(var(--green-rgb),0.25)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.78rem' }

  return (
    <>
      <Head><title>Upload CSV · Books</title></Head>
      <PortalLayout isAdmin>
        <div style={{ marginBottom: 18 }}>
          <Link href="/admin/books" style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textDecoration: 'none' }}>← Books</Link>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, margin: '4px 0' }}>Upload Statement CSV</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', margin: 0 }}>
            Export from your card issuer (Amex, Chase, Capital One, etc). Gemini suggests a category per row; review and import.
          </p>
        </div>

        <div style={{ padding: 16, background: 'var(--bg-alt)', border: '1px dashed rgba(var(--green-rgb),0.35)', borderRadius: 10, marginBottom: 18 }}>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} disabled={busy}
            style={{ color: 'var(--text)', fontSize: '0.85rem' }} />
          {busy && <span style={{ marginLeft: 12, color: 'var(--gold)', fontSize: '0.82rem' }}>Parsing &amp; categorizing…</span>}
        </div>

        {error && (
          <div style={{ padding: 12, background: 'rgba(var(--danger-rgb),0.10)', border: '1px solid var(--danger)', borderRadius: 8, color: 'var(--danger)', marginBottom: 18, fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {parseErrors.length > 0 && (
          <div style={{ padding: 10, background: 'rgba(var(--gold-rgb),0.08)', border: '1px solid rgba(var(--gold-rgb),0.35)', borderRadius: 8, color: 'var(--gold)', marginBottom: 18, fontSize: '0.78rem' }}>
            <strong>{parseErrors.length} parse warning{parseErrors.length === 1 ? '' : 's'}:</strong>
            <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
              {parseErrors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
              {parseErrors.length > 5 && <li>… {parseErrors.length - 5} more</li>}
            </ul>
          </div>
        )}

        {importResult && (
          <div style={{ padding: 12, background: 'rgba(var(--ok-rgb),0.10)', border: '1px solid var(--ok)', borderRadius: 8, color: 'var(--ok)', marginBottom: 18, fontSize: '0.85rem' }}>
            ✓ Imported {importResult.inserted} new transaction{importResult.inserted === 1 ? '' : 's'}
            {importResult.skipped > 0 && <> · skipped {importResult.skipped} duplicate{importResult.skipped === 1 ? '' : 's'}</>}.
            {' '}<Link href="/admin/books" style={{ color: 'var(--green)', textDecoration: 'underline' }}>View books</Link>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {rows.length} rows parsed · {selectedCount} selected · net <strong style={{ color: selectedSum >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{fmt$(selectedSum)}</strong>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: true })))}
                  style={{ ...inputStyle, cursor: 'pointer' }}>Select all</button>
                <button onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: false })))}
                  style={{ ...inputStyle, cursor: 'pointer' }}>Select none</button>
                <button onClick={doImport} disabled={busy || selectedCount === 0}
                  style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: 'var(--green)', color: 'var(--text-on-accent)', fontWeight: 800, fontSize: '0.85rem', cursor: busy || selectedCount === 0 ? 'not-allowed' : 'pointer', opacity: busy || selectedCount === 0 ? 0.5 : 1 }}>
                  Import {selectedCount}
                </button>
              </div>
            </div>

            <div style={{ background: 'var(--bg-alt)', borderRadius: 8, border: '1px solid rgba(var(--green-rgb),0.12)', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', width: 32 }}></th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Date</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Description</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Category</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', width: 60 }}>AI</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid rgba(var(--green-rgb),0.06)', opacity: r.include ? 1 : 0.4 }}>
                      <td style={{ padding: '6px 10px' }}>
                        <input type="checkbox" checked={r.include} onChange={(e) => updateRow(i, { include: e.target.checked })} />
                      </td>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{fmtDate(r.occurred_at)}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text)' }}>{r.description}</td>
                      <td style={{ padding: '6px 10px' }}>
                        <select value={r.category_label} onChange={(e) => pickCategory(i, e.target.value)} style={inputStyle}>
                          {Object.keys(grouped).map((type) => (
                            <optgroup key={type} label={type.toUpperCase()}>
                              {grouped[type].map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: r.amount_cents >= 0 ? 'var(--green)' : 'var(--danger)', whiteSpace: 'nowrap' }}>{fmt$(r.amount_cents)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                        {r.suggested?.confidence ? Math.round(r.suggested.confidence * 100) + '%' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </PortalLayout>
    </>
  )
}
