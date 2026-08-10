import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// Shared UI primitives for the class-based design system in globals.css.
// All visual decisions live in the .btn/.field/.toast/.sheet/... classes so
// every tenant build styles them from its own tokens.

export function Button({ variant = 'primary', className = '', ...props }) {
  return <button className={`btn btn-${variant} ${className}`.trim()} {...props} />
}

export function Field({ label, className = '', ...props }) {
  const control = <input className={`field ${className}`.trim()} {...props} />
  if (!label) return control
  return (
    <label style={{ display: 'block' }}>
      <span className="field-label">{label}</span>
      {control}
    </label>
  )
}

export function EmptyState({ icon, title, hint, action }) {
  return (
    <div className="empty-state">
      {icon && <div style={{ fontSize: '1.6rem', marginBottom: 'var(--space-2)' }} aria-hidden="true">{icon}</div>}
      {title && <div className="empty-title">{title}</div>}
      {hint && <div>{hint}</div>}
      {action && <div style={{ marginTop: 'var(--space-3)' }}>{action}</div>}
    </div>
  )
}

export function Skeleton({ lines = 1, height = 16, width = '100%', style }) {
  return (
    <div aria-hidden="true" style={{ display: 'grid', gap: 'var(--space-2)', ...style }}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={{ height, width: i === lines - 1 && lines > 1 ? '70%' : width }} />
      ))}
    </div>
  )
}

// ── Toasts ─────────────────────────────────────────────────────────
const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const push = useCallback((message, kind) => {
    const id = ++idRef.current
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  const api = useRef({
    ok: (message) => push(message, 'ok'),
    error: (message) => push(message, 'error'),
  }).current

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map((t) => (
            <div key={t.id} className={t.kind === 'error' ? 'toast toast-error' : 'toast'} role="status">
              <span aria-hidden="true">{t.kind === 'error' ? '⚠️' : '✓'}</span>
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

// ── Confirm sheet ──────────────────────────────────────────────────
// Promise-based replacement for window.alert/confirm/prompt.
//   const ok  = await confirm({ title, body, confirmLabel, cancelLabel, danger })   → true/false
//   const val = await confirm({ title, body, input: { type, placeholder, presets, unit } }) → string|null
const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null)

  const confirm = useCallback((options) => new Promise((resolve) => {
    setReq({ options, resolve })
  }), [])

  const close = useCallback((value) => {
    setReq((r) => {
      if (r) r.resolve(value)
      return null
    })
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {req && <ConfirmSheetImpl options={req.options} onClose={close} />}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  return useContext(ConfirmContext)
}

function ConfirmSheetImpl({ options, onClose }) {
  // alert: acknowledge-only sheet (no cancel button) for detail-heavy notices.
  const { title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, input, alert = false } = options
  const [value, setValue] = useState(input?.defaultValue ?? '')
  const sheetRef = useRef(null)
  const confirmRef = useRef(null)
  const restoreRef = useRef(null)

  const cancelValue = input ? null : false
  const submit = () => onClose(input ? String(value) : true)

  useEffect(() => {
    restoreRef.current = document.activeElement
    confirmRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(cancelValue) }
      // Keep Tab inside the sheet
      if (e.key === 'Tab' && sheetRef.current) {
        const focusables = sheetRef.current.querySelectorAll('button, input, [tabindex]')
        if (!focusables.length) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      restoreRef.current?.focus?.()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sheet-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(cancelValue) }}>
      <div className="sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-label={title}>
        {title && <h2 className="sheet-title">{title}</h2>}
        {body && <p className="sheet-body" style={{ whiteSpace: 'pre-line' }}>{body}</p>}
        {input && (
          <>
            {input.presets?.length > 0 && (
              <div className="sheet-presets">
                {input.presets.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="preset-chip"
                    aria-pressed={String(value) === String(p)}
                    onClick={() => setValue(String(p))}>
                    {p}{input.unit ? ` ${input.unit}` : ''}
                  </button>
                ))}
              </div>
            )}
            <input
              className="field"
              type={input.type || 'text'}
              inputMode={input.type === 'number' ? 'numeric' : undefined}
              placeholder={input.placeholder || ''}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              style={{ marginBottom: 'var(--space-4)' }}
            />
          </>
        )}
        <div className="sheet-actions">
          {!alert && <button type="button" className="btn btn-quiet" onClick={() => onClose(cancelValue)}>{cancelLabel}</button>}
          <button type="button" ref={confirmRef} className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={submit}>
            {alert && confirmLabel === 'Confirm' ? 'OK' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
