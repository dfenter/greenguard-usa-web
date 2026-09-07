import { useState, useRef, useEffect } from 'react'

// MBA program assistant widget for the internal GTM portal. Reuses the gold
// styling and open/close/scroll/typing behavior of AdminChat. Posts to
// /api/gtm/chat (local-only, never the metered API).
export default function GtmChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "MBA program assistant. Ask about the sprint plan, SparkBridge pricing, partner terms, targets, or outreach." },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const endRef = useRef(null)

  useEffect(() => { if (open && endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' }) }, [messages, open])

  async function send() {
    const msg = input.trim()
    if (!msg || busy) return
    setBusy(true); setInput(''); setError(null)
    const next = [...messages, { role: 'user', content: msg }]
    setMessages(next)
    try {
      const res = await fetch('/api/gtm/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: messages.filter((m) => typeof m.content === 'string').map(({ role, content }) => ({ role, content })),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok && typeof j.reply === 'string') {
        setMessages([...next, { role: 'assistant', content: j.reply }])
      } else {
        setError(j.error || 'Something went wrong.')
      }
    } catch {
      setError('Connection trouble. Try again.')
    } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="Open MBA assistant"
        style={{ position: 'fixed', right: 20, bottom: 88, zIndex: 95, width: 56, height: 56, borderRadius: '50%',
          background: 'var(--bg-card)', color: 'var(--gold)', border: '1px solid var(--border-gold)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.16)', fontSize: '1.6rem', cursor: 'pointer' }}>
        💬
      </button>
    )
  }

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 88, zIndex: 95,
        width: 'min(400px, calc(100vw - 40px))', height: 'min(560px, calc(100vh - 120px))',
        background: 'var(--bg-card)', borderRadius: 16, overflow: 'hidden',
        border: '1px solid var(--border-gold)', boxShadow: '0 12px 36px rgba(0,0,0,0.20)',
        display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 18px', background: 'rgba(var(--gold-rgb),0.10)', borderBottom: '1px solid var(--border-gold)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 900, color: 'var(--gold)', fontSize: '1rem' }}>MBA Assistant</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Plan · pricing · targets · outreach</div>
        </div>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.4rem' }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ margin: '8px 0', display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '85%', padding: '10px 14px', borderRadius: 12,
              background: m.role === 'user' ? 'rgba(var(--gold-rgb),0.10)' : 'rgba(0,0,0,0.04)',
              color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
              {m.content}
            </div>
          </div>
        ))}
        {busy && <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', padding: '6px 12px' }}>working…</div>}
        {error && <div style={{ color: 'var(--danger, #b45309)', fontSize: '0.85rem', padding: '6px 12px' }}>{error}</div>}
        <div ref={endRef} />
      </div>

      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Ask the MBA assistant…" disabled={busy}
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--text)',
            border: '1px solid var(--border)', fontSize: '0.9rem', fontFamily: 'inherit' }} />
        <button onClick={send} disabled={busy || !input.trim()}
          style={{ padding: '10px 16px', borderRadius: 8, border: 'none', cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
            background: busy || !input.trim() ? 'rgba(var(--gold-rgb),0.20)' : 'var(--gold)', color: 'var(--text-on-accent)', fontWeight: 800, fontSize: '0.85rem' }}>
          Send
        </button>
      </div>
    </div>
  )
}
