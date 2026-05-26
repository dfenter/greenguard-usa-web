import { useState, useRef, useEffect } from 'react'

// Floating chat widget for customer dashboard.
// Collapsed: round button bottom-right. Expanded: 360x520 panel.
export default function CustomerChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I can answer simple questions about your service, billing, or next visit. What can I help with?" },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    if (open && endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  async function send() {
    const msg = input.trim()
    if (!msg || busy) return
    setBusy(true)
    setInput('')
    const next = [...messages, { role: 'user', content: msg }]
    setMessages(next)
    try {
      const res = await fetch('/api/customer/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history: messages }),
      })
      const j = await res.json()
      if (res.ok) {
        setMessages([...next, { role: 'assistant', content: j.reply, escalated: j.escalated }])
      } else {
        setMessages([...next, { role: 'assistant', content: j.error || 'Sorry, something went wrong. Please email admin@greenguard-usa.com.' }])
      }
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: "I'm having trouble connecting. Please try again or email admin@greenguard-usa.com." }])
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open chat"
        style={{
          position: 'fixed', right: 20, bottom: 20, zIndex: 200,
          width: 60, height: 60, borderRadius: '50%',
          background: '#0d1a10', color: '#7dffaa',
          border: '1px solid rgba(125,255,170,0.4)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          fontSize: '1.8rem', cursor: 'pointer',
        }}
      >💬</button>
    )
  }

  return (
    <div style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 200,
      width: 'min(380px, calc(100vw - 40px))', height: 'min(540px, calc(100vh - 100px))',
      background: '#0d1a10', borderRadius: 16, overflow: 'hidden',
      border: '1px solid rgba(125,255,170,0.3)', boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
      display: 'flex', flexDirection: 'column', fontFamily: 'Nunito Sans, sans-serif',
    }}>
      <div style={{
        padding: '14px 18px', background: 'rgba(125,255,170,0.06)',
        borderBottom: '1px solid rgba(125,255,170,0.15)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontWeight: 900, color: '#7dffaa', fontSize: '1rem' }}>GreenGuard Assistant</div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(212,230,202,0.5)' }}>Powered by AI · Escalates to humans</div>
        </div>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(212,230,202,0.6)', cursor: 'pointer', fontSize: '1.4rem' }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            margin: '8px 0', display: 'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '85%', padding: '10px 14px', borderRadius: 12,
              background: m.role === 'user' ? 'rgba(125,255,170,0.15)' : 'rgba(255,255,255,0.05)',
              color: '#d4e6ca', fontSize: '0.9rem', lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
              ...(m.escalated ? { borderLeft: '3px solid #c9a84c' } : {}),
            }}>
              {m.content}
              {m.escalated && <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#c9a84c' }}>⚑ Flagged for the team</div>}
            </div>
          </div>
        ))}
        {busy && <div style={{ color: 'rgba(212,230,202,0.4)', fontSize: '0.85rem', padding: '6px 12px' }}>thinking…</div>}
        <div ref={endRef} />
      </div>

      <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(122,171,130,0.15)', display: 'flex', gap: 8 }}>
        <input
          type="text" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Type a question…" disabled={busy}
          style={{
            flex: 1, padding: '10px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.05)', color: '#d4e6ca',
            border: '1px solid rgba(122,171,130,0.25)', fontSize: '0.9rem',
            outline: 'none', fontFamily: 'inherit',
          }}
        />
        <button
          onClick={send} disabled={busy || !input.trim()}
          style={{
            padding: '10px 16px', borderRadius: 8, border: 'none', cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
            background: busy || !input.trim() ? 'rgba(125,255,170,0.2)' : '#7dffaa',
            color: '#0d1a10', fontWeight: 800, fontSize: '0.85rem',
          }}
        >Send</button>
      </div>
    </div>
  )
}
