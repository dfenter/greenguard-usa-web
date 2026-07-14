import { useEffect, useRef, useState } from 'react'

/**
 * Minimal canvas signature pad with no external deps.
 * onSave receives a data:image/png base64 string. Parent decides what to
 * do with it (upload to Blob, attach to invoice, etc.).
 */
export default function SignaturePad({ onSave, onCancel, label = 'Customer signature' }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const lastRef = useRef({ x: 0, y: 0 })
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    // Crispness on retina
    const ratio = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    c.width = rect.width * ratio
    c.height = rect.height * ratio
    const ctx = c.getContext('2d')
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111111'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
  }, [])

  function pos(e) {
    const c = canvasRef.current
    const r = c.getBoundingClientRect()
    const p = e.touches ? e.touches[0] : e
    return { x: p.clientX - r.left, y: p.clientY - r.top }
  }

  function start(e) {
    e.preventDefault()
    drawingRef.current = true
    lastRef.current = pos(e)
    setHasInk(true)
  }
  function move(e) {
    if (!drawingRef.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(lastRef.current.x, lastRef.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastRef.current = p
  }
  function end() { drawingRef.current = false }

  function clear() {
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    const r = c.getBoundingClientRect()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, r.width, r.height)
    setHasInk(false)
  }

  function save() {
    if (!hasInk) return
    const url = canvasRef.current.toDataURL('image/png')
    onSave?.(url)
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, color: 'var(--text)' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>
        {label}
      </div>
      <canvas ref={canvasRef}
        style={{ display: 'block', width: '100%', height: 160, background: '#ffffff', borderRadius: 6, touchAction: 'none', cursor: 'crosshair' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', margin: '8px 0 12px' }}>
        Sign with finger or stylus to acknowledge service was completed.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={clear} type="button"
          style={{ flex: '1 1 70px', padding: '9px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 700 }}>
          Clear
        </button>
        {onCancel && (
          <button onClick={onCancel} type="button"
            style={{ flex: '1 1 70px', padding: '9px 12px', borderRadius: 6, border: '1px solid rgba(var(--danger-rgb),0.45)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontWeight: 700 }}>
            Skip
          </button>
        )}
        <button onClick={save} type="button" disabled={!hasInk}
          style={{ flex: '2 1 140px', padding: '9px 12px', borderRadius: 6, border: 'none', background: hasInk ? 'var(--green)' : 'rgba(var(--green-rgb),0.20)', color: 'var(--text-on-accent)', cursor: hasInk ? 'pointer' : 'not-allowed', fontWeight: 900 }}>
          Save signature
        </button>
      </div>
    </div>
  )
}
