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
    ctx.strokeStyle = '#0d1a10'
    ctx.fillStyle = '#fff'
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
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, r.width, r.height)
    setHasInk(false)
  }

  function save() {
    if (!hasInk) return
    const url = canvasRef.current.toDataURL('image/png')
    onSave?.(url)
  }

  return (
    <div style={{ background: '#0d1a10', border: '1px solid rgba(122,171,130,0.25)', borderRadius: 10, padding: 14, color: '#d4e6ca' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.5)', marginBottom: 8 }}>
        {label}
      </div>
      <canvas ref={canvasRef}
        style={{ display: 'block', width: '100%', height: 160, background: '#fff', borderRadius: 6, touchAction: 'none', cursor: 'crosshair' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <p style={{ fontSize: '0.7rem', color: 'rgba(212,230,202,0.4)', margin: '8px 0 12px' }}>
        Sign with finger or stylus to acknowledge service was completed.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={clear} type="button"
          style={{ flex: '1 1 70px', padding: '9px 12px', borderRadius: 6, border: '1px solid rgba(212,230,202,0.2)', background: 'transparent', color: 'rgba(212,230,202,0.7)', cursor: 'pointer', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
          Clear
        </button>
        {onCancel && (
          <button onClick={onCancel} type="button"
            style={{ flex: '1 1 70px', padding: '9px 12px', borderRadius: 6, border: '1px solid rgba(255,100,100,0.3)', background: 'transparent', color: '#ff8080', cursor: 'pointer', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
            Skip
          </button>
        )}
        <button onClick={save} type="button" disabled={!hasInk}
          style={{ flex: '2 1 140px', padding: '9px 12px', borderRadius: 6, border: 'none', background: hasInk ? '#7dffaa' : 'rgba(125,255,170,0.2)', color: '#0d1a10', cursor: hasInk ? 'pointer' : 'not-allowed', fontWeight: 900, fontFamily: 'Inter, sans-serif' }}>
          Save signature
        </button>
      </div>
    </div>
  )
}
