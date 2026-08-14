import { useState, useRef, useEffect } from 'react'

// Ops-assistant widget for admin/tech pages. Gold-themed to distinguish it
// from the customer (green) assistant. Posts to /api/admin/assistant which
// runs Claude with read + SMS tools.
// variant="floating" (default): fixed bubble that expands to a panel.
// variant="inline": always-open panel embedded in the page flow (tech view).
export default function AdminChat({ variant = 'floating' }) {
  const inline = variant === 'inline'
  const [open, setOpen] = useState(inline)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Ops assistant. Ask me about today's route, a customer, tank inventory, or say 'text [name] I'm on my way'." },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [attachment, setAttachment] = useState(null) // { dataUrl, data (base64), media_type }
  const endRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => { if (open && endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' }) }, [messages, open])

  // Downscale to <=1568px JPEG so a phone photo fits the 8MB body limit and
  // doesn't waste vision tokens at full resolution.
  async function pickImage(file) {
    if (!file || !file.type.startsWith('image/')) return
    try {
      const bitmap = await createImageBitmap(file)
      const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      setAttachment({ dataUrl, data: dataUrl.split(',')[1], media_type: 'image/jpeg' })
    } catch {}
  }

  async function send() {
    const msg = input.trim()
    if ((!msg && !attachment) || busy) return
    const att = attachment
    setBusy(true); setInput(''); setAttachment(null)
    const text = msg || 'Take a look at this photo.'
    const next = [...messages, { role: 'user', content: text, imageUrl: att?.dataUrl }]
    setMessages(next)
    try {
      const res = await fetch('/api/admin/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.filter((m) => typeof m.content === 'string').map(({ role, content }) => ({ role, content })),
          images: att ? [{ media_type: att.media_type, data: att.data }] : [],
        }),
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
          background: 'var(--bg-card)', color: 'var(--info)', border: '1px solid rgba(var(--info-rgb),0.35)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.16)', fontSize: '1.6rem', cursor: 'pointer' }}>
        💬
      </button>
    )
  }

  return (
    <div style={inline
      ? { background: 'var(--bg-card)', borderRadius: 'var(--radius)', overflow: 'hidden',
          border: '1px solid var(--border-gold)', boxShadow: 'var(--shadow-sm)',
          display: 'flex', flexDirection: 'column', height: 'min(440px, 60vh)' }
      : { position: 'fixed', right: 20, bottom: 88, zIndex: 95,
          width: 'min(400px, calc(100vw - 40px))', height: 'min(560px, calc(100vh - 120px))',
          background: 'var(--bg-card)', borderRadius: 16, overflow: 'hidden',
          border: '1px solid var(--border-gold)', boxShadow: '0 12px 36px rgba(0,0,0,0.20)',
          display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 18px', background: 'rgba(var(--gold-rgb),0.10)', borderBottom: '1px solid var(--border-gold)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 900, color: 'var(--gold)', fontSize: '1rem' }}>Ops Assistant</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Route · customers · inventory · SMS</div>
        </div>
        {!inline && (
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.4rem' }}>×</button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ margin: '8px 0', display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '85%', padding: '10px 14px', borderRadius: 12,
              background: m.role === 'user' ? 'rgba(var(--gold-rgb),0.10)' : 'rgba(0,0,0,0.04)',
              color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
              {m.imageUrl && (
                <img src={m.imageUrl} alt="attachment"
                  style={{ display: 'block', maxWidth: '100%', maxHeight: 180, borderRadius: 8, marginBottom: m.content ? 8 : 0 }} />
              )}
              {m.content}
            </div>
          </div>
        ))}
        {busy && <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', padding: '6px 12px' }}>working…</div>}
        <div ref={endRef} />
      </div>

      {attachment && (
        <div style={{ padding: '8px 14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={attachment.dataUrl} alt="pending attachment" style={{ height: 44, borderRadius: 6, border: '1px solid var(--border)' }} />
          <button onClick={() => setAttachment(null)} aria-label="Remove attachment"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
        </div>
      )}
      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = '' }} />
        <button onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Attach photo"
          style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', cursor: busy ? 'not-allowed' : 'pointer',
            background: 'var(--bg-card)', fontSize: '1rem', lineHeight: 1 }}>
          📷
        </button>
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Ask the ops assistant…" disabled={busy}
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--text)',
            border: '1px solid var(--border)', fontSize: '0.9rem', fontFamily: 'inherit' }} />
        <button onClick={send} disabled={busy || (!input.trim() && !attachment)}
          style={{ padding: '10px 16px', borderRadius: 8, border: 'none', cursor: busy || (!input.trim() && !attachment) ? 'not-allowed' : 'pointer',
            background: busy || (!input.trim() && !attachment) ? 'rgba(var(--gold-rgb),0.20)' : 'var(--gold)', color: 'var(--text-on-accent)', fontWeight: 800, fontSize: '0.85rem' }}>
          Send
        </button>
      </div>
    </div>
  )
}
