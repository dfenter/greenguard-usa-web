import { useState, useRef, useEffect } from 'react'

// Floating ops-assistant widget for admin/tech pages. Gold-themed to
// distinguish it from the customer (green) assistant. Posts to
// /api/admin/assistant which runs Claude with read + SMS tools.
export default function AdminChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Ops assistant. Ask me about today's route, a customer, tank inventory, or say 'text [name] I'm on my way'." },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)

  useEffect(() => { if (open && endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' }) }, [messages, open])

  async function send() {
    const msg = input.trim()
    if (!msg || busy) return
    setBusy(true); setInput('')
    const next = [...messages, { role: 'user', content: msg }]
    setMessages(next)
    try {
      const res = await fetch('/api/admin/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history: messages.filter((m) => typeof m.content === 'string') }),
      })
      const j = await res.json()
      setMessages([...next, { role: 'assistant', content: res.ok ? j.reply : (j.error || 'Something went wrong.') }])
    } catch {
      setMessages([...next, { role: 'assistant', content: 'Connection trouble. Try again.' }])
    } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="Open ops assistant"
        style={{ position: 'fixed', right: 20, bottom: 88, zIndex: 95, width: 56, height: 56, borderRadius: '50%',
          background: '#0d1a10', color: '#5bc4ff', border: '1px solid rgba(91,196,255,0.45)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)', fontSize: '1.6rem', cursor: 'pointer' }}>
        💬
      </button>
    )
  }

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 88, zIndex: 95,
      width: 'min(400px, calc(100vw - 40px))', height: 'min(560px, calc(100vh - 120px))',
      background: '#0d1a10', borderRadius: 16, overflow: 'hidden',
      border: '1px solid rgba(201,168,76,0.35)', boxShadow: '0 12px 36px rgba(0,0,0,0.55)',
      display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ padding: '14px 18px', background: 'rgba(201,168,76,0.07)', borderBottom: '1px solid rgba(201,168,76,0.2)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 900, color: '#c9a84c', fontSize: '1rem' }}>Ops Assistant</div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(212,230,202,0.5)' }}>Route · customers · inventory · SMS</div>
        </div>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(212,230,202,0.6)', cursor: 'pointer', fontSize: '1.4rem' }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ margin: '8px 0', display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '85%', padding: '10px 14px', borderRadius: 12,
              background: m.role === 'user' ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.05)',
              color: '#e3f0db', fontSize: '0.9rem', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
              {m.content}
            </div>
          </div>
        ))}
        {busy && <div style={{ color: 'rgba(212,230,202,0.4)', fontSize: '0.85rem', padding: '6px 12px' }}>working…</div>}
        <div ref={endRef} />
      </div>

      <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(122,171,130,0.15)', display: 'flex', gap: 8 }}>
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Ask the ops assistant…" disabled={busy}
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', color: '#e3f0db',
            border: '1px solid rgba(122,171,130,0.25)', fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit' }} />
        <button onClick={send} disabled={busy || !input.trim()}
          style={{ padding: '10px 16px', borderRadius: 8, border: 'none', cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
            background: busy || !input.trim() ? 'rgba(201,168,76,0.2)' : '#c9a84c', color: '#0d1a10', fontWeight: 800, fontSize: '0.85rem' }}>
          Send
        </button>
      </div>
    </div>
  )
}
