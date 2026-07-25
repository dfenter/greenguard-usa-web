// Expenses & receipts.
//
// Crew view: snap a receipt, type the amount, done — the form is built around a
// phone camera. Owner view: a review queue with the receipt image next to the
// amount, plus what's owed back to the crew.
//
// Approving a personal-card receipt books the expense AND queues a non-taxable
// reimbursement on the next payroll run. A company-card receipt is only booked.
import { useState, useEffect, useCallback, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail, isOwnerEmail } from '../../lib/auth'

export async function getServerSideProps({ req, res }) {
  res?.setHeader('Cache-Control', 'no-store')
  const session = await getSessionFromRequest(req, res)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: process.env.CALENDAR_TIMEZONE || 'America/Chicago' })
  return { props: { email: session.email, isOwner: isOwnerEmail(session.email), serverToday: today } }
}

const usd = (cents) => ((Number(cents) || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

function fmtDay(d) {
  if (!d) return ''
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const STATUS = {
  submitted: { label: 'Waiting on Dan', color: 'var(--info)',       bg: 'rgba(var(--info-rgb),0.10)' },
  approved:  { label: 'Approved',       color: 'var(--ok)',         bg: 'rgba(var(--ok-rgb),0.12)' },
  recorded:  { label: 'Recorded',       color: 'var(--green)',      bg: 'rgba(var(--green-rgb),0.12)' },
  paid:      { label: 'Reimbursed',     color: 'var(--green)',      bg: 'rgba(var(--green-rgb),0.12)' },
  rejected:  { label: 'Rejected',       color: 'var(--danger)',     bg: 'rgba(var(--danger-rgb),0.10)' },
}

function Chip({ status }) {
  const s = STATUS[status] || STATUS.submitted
  return (
    <span style={{
      fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
      color: s.color, background: s.bg, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  )
}

function KPI({ label, value, sub, warn }) {
  return (
    <div style={{ flex: '1 1 150px', background: 'var(--bg-card)', border: `1px solid ${warn ? 'rgba(var(--warn-rgb),0.25)' : 'rgba(var(--green-rgb),0.15)'}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: warn ? 'var(--warn)' : 'var(--text-dim)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '1.45rem', fontWeight: 900, lineHeight: 1, color: warn ? 'var(--warn)' : 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

const input = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid rgba(var(--green-rgb),0.25)', background: 'var(--bg-card)',
  color: 'var(--text)', fontSize: '1rem', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
}
const lbl = { fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: 5 }
const card = { background: 'var(--bg-card)', border: '1px solid rgba(var(--green-rgb),0.15)', borderRadius: 12, padding: '16px 18px' }
const btn = (kind = 'ghost') => {
  const map = {
    primary: { background: 'var(--green)', color: '#fff', border: 'none' },
    ok:      { background: 'rgba(var(--ok-rgb),0.10)', color: 'var(--ok)', border: '1px solid rgba(var(--ok-rgb),0.35)' },
    danger:  { background: 'transparent', color: 'var(--danger)', border: '1px solid rgba(var(--danger-rgb),0.30)' },
    ghost:   { background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' },
  }
  return { padding: '10px 16px', borderRadius: 8, fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', ...map[kind] }
}

const BLANK = { amountDollars: '', incurredOn: '', vendor: '', description: '', categoryLabel: '', paymentMethod: 'personal' }

export default function Expenses({ email, isOwner, serverToday }) {
  const [mine, setMine] = useState(null)
  const [everyone, setEveryone] = useState(null)
  const [view, setView] = useState('mine')       // owner can flip to 'all'
  const [form, setForm] = useState({ ...BLANK, incurredOn: serverToday })
  const [receipt, setReceipt] = useState(null)   // { url, mime, bytes, previewUrl }
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const [editing, setEditing] = useState(null)
  const fileRef = useRef(null)
  const flash = useRef(null)
  const submitting = useRef(false)   // React state is async; a ref is not

  const say = (text, kind = 'ok', ms = 3500) => {
    setMsg({ text, kind })
    clearTimeout(flash.current)
    flash.current = setTimeout(() => setMsg(null), ms)
  }

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        fetch('/api/admin/expenses', { credentials: 'same-origin' }).then((r) => r.json().then((j) => ({ ok: r.ok, j }))),
        isOwner
          ? fetch('/api/admin/expenses?all=1', { credentials: 'same-origin' }).then((r) => r.json().then((j) => ({ ok: r.ok, j })))
          : Promise.resolve(null),
      ])
      if (!a.ok) throw new Error(a.j.error || 'Failed to load')
      setMine(a.j)
      if (b?.ok) setEveryone(b.j)
      setErr(null)
    } catch (e) {
      setErr(e.message)
    }
  }, [isOwner])

  useEffect(() => { load() }, [load])

  async function api(url, { method = 'POST', body } = {}) {
    setBusy(true)
    try {
      const r = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Request failed')
      await load()
      return j
    } catch (e) {
      say(e.message, 'error', 6000)
      return null
    } finally {
      setBusy(false)
    }
  }

  // The receipt goes up on its own so a flaky upload never loses the typed
  // amount, and so the form can show a thumbnail before saving.
  async function pickReceipt(file) {
    if (!file) return
    setUploading(true)
    try {
      const r = await fetch('/api/admin/expense-receipt', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Upload failed')
      setReceipt({ ...j, previewUrl: file.type?.startsWith('image/') ? URL.createObjectURL(file) : null })
      say('Receipt attached.')
    } catch (e) {
      say(e.message, 'error', 6000)
    } finally {
      setUploading(false)
    }
  }

  async function submit() {
    // A double-tap on a phone lands both taps before `busy` re-renders, which
    // would file the same receipt twice. The ref closes that window; the server
    // also refuses a second claim for the same uploaded photo.
    if (submitting.current || uploading) return
    if (!(Number(form.amountDollars) > 0)) return say('Enter the amount', 'error')
    if (!form.categoryLabel) return say('Pick a category', 'error')
    if (!form.description.trim()) return say('Say what it was for', 'error')
    submitting.current = true
    try {
    const j = await api('/api/admin/expenses', {
      body: {
        ...form,
        amountDollars: Number(form.amountDollars),
        receiptUrl: receipt?.url || null,
        receiptMime: receipt?.mime || null,
        receiptBytes: receipt?.bytes || null,
      },
    })
    if (j) {
      setForm({ ...BLANK, incurredOn: serverToday })
      setReceipt(null)
      if (fileRef.current) fileRef.current.value = ''
      say('Receipt submitted for approval.')
    }
    } finally {
      submitting.current = false
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const categories = mine?.categories || []
  const list = view === 'all' ? (everyone?.expenses || []) : (mine?.expenses || [])
  const nameById = Object.fromEntries((everyone?.employees || []).map((e) => [e.id, e.name]))
  const noRecord = err && /no employee record/i.test(err)

  return (
    <>
      <Head><title>Expenses · GreenGuard USA</title></Head>
      <PortalLayout isAdmin title="Expenses & Receipts" logoHref={isOwner ? '/admin/home' : '/admin/tech'}>

        {msg && (
          <div style={{
            marginBottom: 18, padding: '12px 14px', borderRadius: 10, fontSize: '0.9rem', fontWeight: 700,
            background: msg.kind === 'error' ? 'rgba(var(--danger-rgb),0.08)' : 'rgba(var(--ok-rgb),0.08)',
            border: `1px solid ${msg.kind === 'error' ? 'rgba(var(--danger-rgb),0.3)' : 'rgba(var(--ok-rgb),0.3)'}`,
            color: msg.kind === 'error' ? 'var(--danger)' : 'var(--ok)',
          }}>{msg.text}</div>
        )}

        {noRecord ? (
          <div style={{ ...card, borderColor: 'rgba(var(--warn-rgb),0.3)' }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>No employee record yet</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {email} isn&apos;t linked to an employee record, so there&apos;s nowhere to file receipts.
              {isOwner
                ? <> Add it on the <Link href="/admin/payroll" style={{ color: 'var(--green)', fontWeight: 700 }}>Payroll page</Link>.</>
                : ' Ask Dan to add you on the Payroll page.'}
            </div>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <section style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
              {isOwner ? (
                <>
                  <KPI label="Awaiting review" value={everyone?.totals ? usd(everyone.totals.awaitingReviewCents) : '—'}
                    sub={`${everyone?.totals?.awaitingReviewCount ?? 0} receipt(s)`}
                    warn={(everyone?.totals?.awaitingReviewCount ?? 0) > 0} />
                  <KPI label="Owed to crew" value={everyone?.totals ? usd(everyone.totals.owedToCrewCents) : '—'}
                    sub="approved, next payroll run" />
                </>
              ) : (
                <>
                  <KPI label="Waiting on Dan" value={mine?.totals ? usd(mine.totals.awaitingReviewCents) : '—'} sub="submitted" />
                  <KPI label="Owed to you" value={mine?.totals ? usd(mine.totals.owedToMeCents) : '—'}
                    sub="approved — paid on the next check" />
                </>
              )}
              <div style={{ flex: '1 1 150px', display: 'flex', alignItems: 'center' }}>
                <Link href="/admin/timesheet" style={{ ...btn('ghost'), textDecoration: 'none' }}>Timesheet →</Link>
              </div>
            </section>

            {/* Submit */}
            <section style={{ marginBottom: 30 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 14 }}>
                New receipt
              </div>
              <div style={card}>
                {/* Camera / file */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                  <label style={{ ...btn('primary'), display: 'inline-block' }}>
                    {uploading ? 'Uploading…' : receipt ? 'Replace photo' : '📷 Photo of receipt'}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*,application/pdf"
                      capture="environment"
                      onChange={(e) => pickReceipt(e.target.files?.[0])}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {receipt && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {receipt.previewUrl
                        ? <img src={receipt.previewUrl} alt="Receipt" style={{ height: 56, borderRadius: 6, border: '1px solid var(--border)' }} />
                        : <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>PDF attached</span>}
                      <button onClick={() => { setReceipt(null); if (fileRef.current) fileRef.current.value = '' }}
                        style={{ ...btn('ghost'), padding: '6px 12px' }}>Remove</button>
                    </div>
                  )}
                  {!receipt && <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Optional, but keep it for the IRS</span>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                  <label><span style={lbl}>Amount $</span>
                    <input type="number" inputMode="decimal" step="0.01" min="0" value={form.amountDollars} onChange={set('amountDollars')} style={input} />
                  </label>
                  <label><span style={lbl}>Date</span>
                    <input type="date" max={serverToday} value={form.incurredOn} onChange={set('incurredOn')} style={input} />
                  </label>
                  <label><span style={lbl}>Store / vendor</span>
                    <input value={form.vendor} onChange={set('vendor')} placeholder="Home Depot" style={input} />
                  </label>
                  <label><span style={lbl}>Category</span>
                    <select value={form.categoryLabel} onChange={set('categoryLabel')} style={input}>
                      <option value="">Pick one…</option>
                      {categories.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                    </select>
                  </label>
                  <label><span style={lbl}>Paid with</span>
                    <select value={form.paymentMethod} onChange={set('paymentMethod')} style={input}>
                      <option value="personal">My own money (reimburse me)</option>
                      <option value="company">Company card</option>
                    </select>
                  </label>
                </div>
                <label style={{ display: 'block', marginTop: 12 }}><span style={lbl}>What was it for?</span>
                  <input value={form.description} onChange={set('description')} placeholder="CO2 regulator for the Smith trap" style={input} />
                </label>

                <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={submit} disabled={busy || uploading} style={{ ...btn('primary'), opacity: busy || uploading ? 0.6 : 1 }}>
                    Submit receipt
                  </button>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                    {form.paymentMethod === 'personal'
                      ? 'Approved receipts are paid back on your next check, tax-free.'
                      : 'Company-card receipts are just recorded for the books.'}
                  </span>
                </div>
              </div>
            </section>

            {/* Owner review toggle */}
            {isOwner && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                <button onClick={() => setView('mine')} style={{ ...btn(view === 'mine' ? 'ok' : 'ghost') }}>My receipts</button>
                <button onClick={() => setView('all')} style={{ ...btn(view === 'all' ? 'ok' : 'ghost') }}>
                  Everyone {everyone?.totals?.awaitingReviewCount ? `(${everyone.totals.awaitingReviewCount} to review)` : ''}
                </button>
              </div>
            )}

            {/* List */}
            <section>
              <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 14 }}>
                {view === 'all' ? 'All receipts' : 'Your receipts'} — {list.length}
              </div>

              {list.length === 0 ? (
                <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', padding: '28px 20px' }}>
                  Nothing filed yet. Snap a photo above when you buy something for a job.
                </div>
              ) : list.map((x) => {
                const locked = x.status === 'paid' || x.payrollRunId
                const canReview = isOwner && !locked && x.status !== 'paid'
                return (
                  <div key={x.id} style={{ ...card, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
                          {usd(x.amountCents)}
                          <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            {' · '}{fmtDay(x.incurredOn)}
                            {view === 'all' && ` · ${nameById[x.employeeId] || `#${x.employeeId}`}`}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.9rem', marginTop: 4 }}>
                          {x.vendor ? <strong>{x.vendor}</strong> : null}{x.vendor ? ' — ' : ''}{x.description}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <span>{x.categoryLabel}</span>
                          <span>{x.paymentMethod === 'company' ? 'company card' : 'out of pocket'}</span>
                          {x.postedToBooks && <span>in books</span>}
                          {isOwner && mine?.employee?.id === x.employeeId && x.approvedBy && <span>self-approved</span>}
                          {x.payrollRunId && <span>run #{x.payrollRunId}</span>}
                        </div>
                        {x.rejectedReason && (
                          <div style={{ fontSize: '0.85rem', color: 'var(--danger)', marginTop: 6, fontWeight: 700 }}>
                            Rejected: {x.rejectedReason}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                        <Chip status={x.status} />
                        {/* Only ever link out to our own blob storage — the
                            server enforces this too. */}
                        {x.receiptUrl && /^https:\/\/[\w.-]+\.blob\.vercel-storage\.com\//.test(x.receiptUrl) && (
                          <a href={x.receiptUrl} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: '0.8rem', color: 'var(--info)', fontWeight: 700 }}>
                            View receipt →
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      {canReview && x.status === 'submitted' && (
                        <>
                          <button style={btn('ok')} disabled={busy}
                            onClick={() => api('/api/admin/expenses', { method: 'PATCH', body: { id: x.id, action: 'approve' } })
                              .then((j) => j && say(x.paymentMethod === 'company' ? 'Recorded in the books.' : 'Approved — will be reimbursed on the next payroll run.'))}>
                            Approve
                          </button>
                          <button style={btn('danger')} disabled={busy}
                            onClick={() => {
                              const reason = window.prompt('Why is this rejected? (they will see this)')
                              if (!reason) return
                              api('/api/admin/expenses', { method: 'PATCH', body: { id: x.id, action: 'reject', reason } })
                                .then((j) => j && say('Rejected.'))
                            }}>
                            Reject
                          </button>
                        </>
                      )}
                      {canReview && (x.status === 'approved' || x.status === 'recorded') && !x.postedToBooks && (
                        <button style={btn('ghost')} disabled={busy}
                          onClick={() => api('/api/admin/expenses', { method: 'PATCH', body: { id: x.id, action: 'post-books' } })
                            .then((j) => j && say(j.posted ? 'Posted to the books.' : `Not posted — ${j.reason || 'nothing to post'}`, j.posted ? 'ok' : 'error'))}>
                          Post to books
                        </button>
                      )}
                      {!locked && (isOwner || x.status === 'submitted' || x.status === 'rejected') && (
                        <>
                          <button style={{ ...btn('ghost'), padding: '7px 13px' }} disabled={busy}
                            onClick={() => setEditing(editing === x.id ? null : x.id)}>
                            {editing === x.id ? 'Close' : 'Edit'}
                          </button>
                          <button style={{ ...btn('danger'), padding: '7px 13px' }} disabled={busy}
                            onClick={() => {
                              if (!window.confirm(`Delete this ${usd(x.amountCents)} receipt?`)) return
                              api(`/api/admin/expenses?id=${x.id}`, { method: 'DELETE' }).then((j) => j && say('Deleted.'))
                            }}>
                            Delete
                          </button>
                        </>
                      )}
                      {locked && <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Reimbursed on payroll run #{x.payrollRunId} — locked</span>}
                    </div>

                    {editing === x.id && (
                      <EditRow claim={x} categories={categories} busy={busy} serverToday={serverToday}
                        onSave={(patch) => api('/api/admin/expenses', { method: 'PATCH', body: { id: x.id, ...patch } })
                          .then((j) => { if (j) { setEditing(null); say('Updated — back in the review queue.') } })}
                        onCancel={() => setEditing(null)} />
                    )}
                  </div>
                )
              })}
            </section>
          </>
        )}
      </PortalLayout>
    </>
  )
}

function EditRow({ claim, categories, busy, serverToday, onSave, onCancel }) {
  const [f, setF] = useState({
    amountDollars: (claim.amountCents / 100).toFixed(2),
    incurred_on: claim.incurredOn,
    vendor: claim.vendor || '',
    description: claim.description,
    category_label: claim.categoryLabel,
    payment_method: claim.paymentMethod,
  })
  const set = (k) => (e) => setF((cur) => ({ ...cur, [k]: e.target.value }))
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <label><span style={lbl}>Amount $</span>
          <input type="number" step="0.01" min="0" value={f.amountDollars} onChange={set('amountDollars')} style={input} />
        </label>
        <label><span style={lbl}>Date</span>
          <input type="date" max={serverToday} value={f.incurred_on} onChange={set('incurred_on')} style={input} />
        </label>
        <label><span style={lbl}>Vendor</span>
          <input value={f.vendor} onChange={set('vendor')} style={input} />
        </label>
        <label><span style={lbl}>Category</span>
          <select value={f.category_label} onChange={set('category_label')} style={input}>
            {categories.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
          </select>
        </label>
        <label><span style={lbl}>Paid with</span>
          <select value={f.payment_method} onChange={set('payment_method')} style={input}>
            <option value="personal">Out of pocket</option>
            <option value="company">Company card</option>
          </select>
        </label>
      </div>
      <label style={{ display: 'block', marginTop: 12 }}><span style={lbl}>What was it for?</span>
        <input value={f.description} onChange={set('description')} style={input} />
      </label>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button style={btn('primary')} disabled={busy} onClick={() => onSave(f)}>Save</button>
        <button style={btn('ghost')} disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
