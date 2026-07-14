import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import PortalLayout from '../../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../../lib/auth'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }
  return { props: {} }
}

const SUGGESTIONS = [
  'How much revenue last month?',
  'Top 5 customers by lifetime revenue',
  'How much did Brady Archambo pay this year?',
  'Total Stripe fees this quarter',
  'Revenue by category for May',
  'How many invoices were paid last week?',
]

export default function BooksChatPage() {
  const [messages, setMessages] = useState([])  // {role, content, sql?, rows?, rowCount?}
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function ask(text) {
    const question = (text || input).trim()
    if (!question || loading) return
    setMessages((m) => [...m, { role: 'user', content: question }])
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/admin/books-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const j = await res.json()
      if (res.ok) {
        setMessages((m) => [...m, { role: 'assistant', content: j.summary, sql: j.sql, rows: j.rows, rowCount: j.rowCount, explanation: j.explanation }])
      } else {
        setMessages((m) => [...m, { role: 'assistant', content: `⚠ ${j.error}`, error: true }])
      }
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `⚠ ${e.message}`, error: true }])
    }
    setLoading(false)
  }

  return (
    <>
      <Head><title>Books Chat · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <div style={{ marginBottom: 18 }}>
          <Link href="/admin/books" style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>← Back to Books</Link>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.9rem)', fontWeight: 900, margin: '4px 0 4px' }}>Ask the Books</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', margin: 0 }}>
            Ask anything in plain English. Powered by Gemini with read-only access to the ledger.
          </p>
        </div>

        {messages.length === 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>Try one</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)}
                  style={{ padding: '8px 12px', borderRadius: 16, border: '1px solid rgba(var(--green-rgb),0.30)', background: 'var(--bg-alt)', color: 'var(--text)', fontSize: '0.82rem', cursor: 'pointer' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              padding: '12px 16px', borderRadius: 10,
              maxWidth: '92%', alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              background: m.role === 'user' ? 'rgba(var(--green-rgb),0.10)' : 'var(--bg-alt)',
              border: `1px solid ${m.error ? 'rgba(var(--danger-rgb),0.30)' : m.role === 'user' ? 'rgba(var(--green-rgb),0.30)' : 'rgba(var(--green-rgb),0.18)'}`,
              fontSize: '0.92rem', lineHeight: 1.4, color: 'var(--text)',
            }}>
              {m.role === 'user' ? <strong>You: </strong> : <strong style={{ color: 'var(--green)' }}>📘 </strong>}
              {m.content}
              {m.role === 'assistant' && m.rows?.length > 0 && (
                <details style={{ marginTop: 10, fontSize: '0.78rem' }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>
                    Show {m.rowCount} row{m.rowCount === 1 ? '' : 's'} · query
                  </summary>
                  <pre style={{ fontSize: '0.72rem', color: 'rgba(var(--green-rgb),0.70)', background: 'var(--bg-alt)', padding: '8px 10px', borderRadius: 6, overflowX: 'auto', marginTop: 8 }}>{m.sql}</pre>
                  <div style={{ overflowX: 'auto', marginTop: 8 }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                      <thead>
                        <tr>{Object.keys(m.rows[0]).map((k) => (
                          <th key={k} style={{ padding: '4px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-dim)', borderBottom: '1px solid rgba(var(--green-rgb),0.20)' }}>{k}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {m.rows.slice(0, 50).map((row, ri) => (
                          <tr key={ri} style={{ borderBottom: '1px solid rgba(var(--green-rgb),0.06)' }}>
                            {Object.values(row).map((v, vi) => (
                              <td key={vi} style={{ padding: '4px 10px', color: 'var(--text)' }}>
                                {v === null ? <span style={{ opacity: 0.3 }}>—</span> : (typeof v === 'object' ? JSON.stringify(v) : String(v))}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {m.rowCount > 50 && <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>...{m.rowCount - 50} more rows hidden</p>}
                  </div>
                </details>
              )}
            </div>
          ))}
          {loading && (
            <div style={{ alignSelf: 'flex-start', padding: '12px 16px', borderRadius: 10, background: 'var(--bg-alt)', border: '1px solid rgba(var(--green-rgb),0.18)', color: 'var(--text-muted)' }}>
              📘 Thinking…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); ask() }}
          style={{ display: 'flex', gap: 8, position: 'sticky', bottom: 76, padding: 10, background: 'var(--bg-deep)', borderRadius: 10, border: '1px solid rgba(var(--green-rgb),0.20)' }}>
          <input value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the books… (e.g. revenue last month)"
            disabled={loading}
            style={{ flex: 1, padding: '10px 14px', borderRadius: 6, border: '1px solid rgba(var(--green-rgb),0.25)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.95rem' }} />
          <button disabled={!input.trim() || loading}
            style={{ padding: '10px 18px', borderRadius: 6, border: 'none', background: input.trim() && !loading ? 'var(--green)' : 'rgba(var(--green-rgb),0.20)', color: 'var(--text-on-accent)', fontWeight: 900, fontSize: '0.95rem', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed' }}>
            Ask
          </button>
        </form>
      </PortalLayout>
    </>
  )
}
