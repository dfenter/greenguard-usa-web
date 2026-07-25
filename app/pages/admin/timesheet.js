// Timesheet — the tech's own page. Mobile-first: the clock button is the
// biggest thing on the screen because it is tapped from a truck.
// The owner sees the same page for their own record plus a link into Payroll.
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
  // The business day is decided by CALENDAR_TIMEZONE on the server, never by
  // the phone's timezone — a tech in Denver (or a shift crossing Central
  // midnight) would otherwise edit the wrong day and overwrite real hours.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: process.env.CALENDAR_TIMEZONE || 'America/Chicago' })
  return { props: { email: session.email, isOwner: isOwnerEmail(session.email), serverToday: today } }
}

const usd = (cents) => ((Number(cents) || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

function fmtDay(dateStr) {
  if (!dateStr) return ''
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function fmtClock(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function elapsedLabel(sinceIso, now) {
  const ms = now - new Date(sinceIso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '0:00'
  const mins = Math.floor(ms / 60000)
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`
}

const STATUS_STYLE = {
  open:      { label: 'Open',      color: 'var(--text-muted)', bg: 'rgba(var(--text-rgb),0.08)' },
  submitted: { label: 'Submitted', color: 'var(--info)',       bg: 'rgba(var(--info-rgb),0.10)' },
  approved:  { label: 'Approved',  color: 'var(--ok)',         bg: 'rgba(var(--ok-rgb),0.12)' },
  paid:      { label: 'Paid',      color: 'var(--green)',      bg: 'rgba(var(--green-rgb),0.12)' },
}

function StatusChip({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.open
  return (
    <span style={{
      fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
      color: s.color, background: s.bg, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  )
}

function KPI({ label, value, sub, warn }) {
  return (
    <div style={{ flex: '1 1 130px', background: 'var(--bg-card)', border: `1px solid ${warn ? 'rgba(var(--warn-rgb),0.25)' : 'rgba(var(--green-rgb),0.15)'}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: warn ? 'var(--warn)' : 'var(--text-dim)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '1.45rem', fontWeight: 900, lineHeight: 1, color: warn ? 'var(--warn)' : 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid rgba(var(--green-rgb),0.25)', background: 'var(--bg-card)',
  color: 'var(--text)', fontSize: '1rem', boxSizing: 'border-box', outline: 'none',
  fontFamily: 'inherit',
}

const labelStyle = { fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: 5 }

export default function Timesheet({ email, isOwner, serverToday }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [editing, setEditing] = useState(null)   // work_date being edited
  const [form, setForm] = useState({ hours: '', break_minutes: '', stops: '', miles: '', notes: '' })
  const flash = useRef(null)

  // `from` bounds the list: a whole season of day cards would be a
  // multi-thousand-node scroll on a phone.
  const load = useCallback(async () => {
    try {
      const from = new Date(`${serverToday}T12:00:00`)
      from.setDate(from.getDate() - 45)
      const r = await fetch(`/api/admin/timesheet?from=${from.toLocaleDateString('en-CA')}`, { credentials: 'same-origin' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Failed to load')
      setData(j)
      setErr(null)
    } catch (e) {
      // Keep whatever is on screen — a dropped request in a driveway must not
      // replace the clock with an error page.
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }, [serverToday])

  useEffect(() => { load() }, [load])

  // Tick the running-clock label once a minute (cheap, and the label only has
  // minute resolution anyway).
  useEffect(() => {
    if (!data?.openClock) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [data?.openClock])

  function say(text, ms = 2500) {
    setMsg(text)
    clearTimeout(flash.current)
    flash.current = setTimeout(() => setMsg(null), ms)
  }

  async function post(url, body, method = 'POST') {
    setBusy(true)
    try {
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Request failed')
      await load()
      return j
    } catch (e) {
      say(e.message, 5000)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function clock(action) {
    // Clocking out of a shift that started on an earlier day would bank the
    // whole overnight gap. Make the tech confirm it and fix the hours after.
    if (action === 'out' && data?.openClock && data.openClock.work_date !== serverToday) {
      const ok = window.confirm(
        `Your clock has been running since ${data.openClock.work_date}. Clocking out now records the whole span (${elapsedLabel(data.openClock.clock_in, Date.now())}).\n\nClock out anyway, then correct the hours?`
      )
      if (!ok) return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/admin/timesheet-clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        // Forgot to clock out on an earlier day — offer to close that shift
        // instead of dead-ending on the error.
        if (j.code === 'STALE_CLOCK' && window.confirm(`${j.error}\n\nClock out of the ${j.workDate} shift now?`)) {
          setBusy(false)
          return clock('out')
        }
        throw new Error(j.error || 'Request failed')
      }
      await load()
      say(action === 'in' ? 'Clocked in.' : 'Clocked out — hours saved.')
    } catch (e) {
      say(e.message, 5000)
    } finally {
      setBusy(false)
    }
  }

  function startEdit(entry) {
    setEditing(entry.work_date)
    setForm({
      hours: entry.hours ?? '',
      break_minutes: entry.break_minutes || '',
      stops: entry.stops || '',
      miles: entry.miles || '',
      notes: entry.notes || '',
    })
  }

  async function saveEntry(workDate) {
    const j = await post('/api/admin/timesheet', {
      workDate,
      hours: form.hours === '' ? null : Number(form.hours),
      breakMinutes: Number(form.break_minutes) || 0,
      stops: Number(form.stops) || 0,
      miles: Number(form.miles) || 0,
      notes: form.notes ?? '',
      submit: true,
    })
    if (j) { setEditing(null); say('Saved.') }
  }

  async function submitWeek() {
    // Everything in this week that isn't still on the clock: manual days have
    // no clock pair, so filtering on clock_out would skip them entirely.
    const ids = (data?.entries || [])
      .filter((e) => e.work_date >= data.week.weekStart && (e.status === 'open' || e.status === 'submitted') && !e.running)
      .map((e) => e.id)
    if (!ids.length) return say('Nothing to submit.')
    const j = await post('/api/admin/timesheet', { action: 'submit', ids }, 'PATCH')
    if (j) {
      const n = j.entries?.length ?? 0
      say(n ? `Submitted ${n} ${n === 1 ? 'day' : 'days'} for approval.` : 'Nothing left to submit.')
    }
  }

  const entries = data?.entries || []
  const week = data?.week
  const openClock = data?.openClock
  const today = serverToday
  const todayEntry = entries.find((e) => e.work_date === today)
  const noRecord = err && /no employee record/i.test(err)

  return (
    <>
      <Head><title>Timesheet · GreenGuard USA</title></Head>
      <PortalLayout isAdmin title="Timesheet" logoHref="/admin/tech">

        {err && data && (
          <div style={{ marginBottom: 18, padding: '12px 14px', borderRadius: 10, background: 'rgba(var(--warn-rgb),0.08)', border: '1px solid rgba(var(--warn-rgb),0.3)', color: 'var(--warn)', fontSize: '0.88rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>Couldn&apos;t refresh ({err}). Showing the last known hours.</span>
            <button onClick={load} style={{ background: 'none', border: 'none', color: 'inherit', fontWeight: 900, cursor: 'pointer' }}>Retry</button>
          </div>
        )}

        {msg && (
          <div style={{ marginBottom: 18, padding: '12px 14px', borderRadius: 10, background: 'rgba(var(--info-rgb),0.08)', border: '1px solid rgba(var(--info-rgb),0.25)', color: 'var(--info)', fontSize: '0.9rem', fontWeight: 700 }}>
            {msg}
          </div>
        )}

        {noRecord ? (
          <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(var(--warn-rgb),0.3)', borderRadius: 12, padding: '24px 20px' }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>No employee record yet</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {email} isn&apos;t linked to an employee record, so there&apos;s nothing to track hours against.
              {isOwner
                ? <> Add it on the <Link href="/admin/payroll" style={{ color: 'var(--green)', fontWeight: 700 }}>Payroll page</Link>.</>
                : ' Ask Dan to add you on the Payroll page.'}
            </div>
          </div>
        ) : err && !data ? (
          <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(var(--danger-rgb),0.3)', borderRadius: 12, padding: '20px', color: 'var(--danger)', fontWeight: 700 }}>
            {err}
          </div>
        ) : loading ? (
          <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
        ) : (
          <>
            {/* ── Clock ─────────────────────────────────────────────── */}
            <section style={{ marginBottom: 30 }}>
              <button
                onClick={() => clock(openClock ? 'out' : 'in')}
                disabled={busy}
                style={{
                  width: '100%', padding: '26px 20px', borderRadius: 16, cursor: busy ? 'wait' : 'pointer',
                  border: `2px solid ${openClock ? 'rgba(var(--danger-rgb),0.45)' : 'rgba(var(--green-rgb),0.45)'}`,
                  background: openClock ? 'rgba(var(--danger-rgb),0.08)' : 'rgba(var(--green-rgb),0.08)',
                  color: openClock ? 'var(--danger)' : 'var(--green)',
                  fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.01em', fontFamily: 'inherit',
                  opacity: busy ? 0.6 : 1, transition: 'opacity 0.15s',
                }}
              >
                {busy ? 'Saving…' : openClock ? 'Clock Out' : 'Clock In'}
                <div style={{ fontSize: '0.85rem', fontWeight: 700, marginTop: 8, color: 'var(--text-muted)' }}>
                  {openClock
                    ? `Running ${elapsedLabel(openClock.clock_in, now)} · in at ${fmtClock(openClock.clock_in)}`
                    : todayEntry
                      ? `Today: ${(todayEntry.paidHours ?? 0).toFixed(2)} h banked${todayEntry.clock_out ? ` (out at ${fmtClock(todayEntry.clock_out)})` : ''}`
                      : 'Not clocked in'}
                </div>
              </button>
            </section>

            {/* ── This week ─────────────────────────────────────────── */}
            <section style={{ marginBottom: 30 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 14 }}>
                This week — from {fmtDay(week?.weekStart)}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <KPI label="Hours" value={(week?.hours ?? 0).toFixed(2)} sub={`${(week?.regularHours ?? 0).toFixed(2)} regular`} />
                <KPI label="Overtime" value={(week?.otHours ?? 0).toFixed(2)} sub="over 40 h" warn={(week?.otHours ?? 0) > 0} />
                <KPI
                  label={week?.payBasis === 'period-salary' ? 'Salary (period)' : 'Est. pay'}
                  value={usd(week?.estimatedPayCents)}
                  sub={week?.payBasis === 'period-salary' ? 'full pay period, before taxes' : 'this week, before taxes'} />
                {(week?.miles ?? 0) > 0 && <KPI label="Miles" value={week.miles} sub={usd(week?.reimbursementCents) + ' reimb.'} />}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <button onClick={submitWeek} disabled={busy}
                  style={{ padding: '11px 18px', borderRadius: 8, border: '1px solid rgba(var(--info-rgb),0.35)', background: 'rgba(var(--info-rgb),0.08)', color: 'var(--info)', fontSize: '0.92rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Submit week for approval
                </button>
                <Link href="/admin/expenses" style={{ padding: '11px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.92rem', fontWeight: 800, textDecoration: 'none' }}>
                  Receipts →
                </Link>
                {isOwner && (
                  <Link href="/admin/payroll" style={{ padding: '11px 18px', borderRadius: 8, border: '1px solid rgba(var(--gold-rgb),0.35)', background: 'rgba(var(--gold-rgb),0.08)', color: 'var(--gold)', fontSize: '0.92rem', fontWeight: 800, textDecoration: 'none' }}>
                    Payroll →
                  </Link>
                )}
              </div>
            </section>

            {/* ── Days ──────────────────────────────────────────────── */}
            <section style={{ marginBottom: 30 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                  Recent days
                </div>
                {editing !== today && !todayEntry && (
                  <button onClick={() => { setEditing(today); setForm({ hours: '', break_minutes: '', stops: '', miles: '', notes: '' }) }}
                    style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(var(--green-rgb),0.3)', background: 'transparent', color: 'var(--green)', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                    + Enter hours manually
                  </button>
                )}
              </div>

              {editing === today && !todayEntry && (
                <EntryForm
                  dateLabel={`Today — ${fmtDay(today)}`}
                  form={form} setForm={setForm} busy={busy}
                  onSave={() => saveEntry(today)} onCancel={() => setEditing(null)}
                />
              )}

              {entries.length === 0 && editing !== today && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(var(--green-rgb),0.15)', borderRadius: 12, padding: '28px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  No hours logged yet. Tap Clock In when you start your route.
                </div>
              )}

              {entries.map((e) => {
                const locked = e.status === 'paid' || e.payroll_run_id
                const isEditing = editing === e.work_date
                return (
                  <div key={e.id} style={{ background: 'var(--bg-card)', border: '1px solid rgba(var(--green-rgb),0.15)', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 800 }}>{fmtDay(e.work_date)}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 900, fontSize: '1.05rem' }}>{(e.paidHours ?? 0).toFixed(2)} h</span>
                        <StatusChip status={e.status} />
                      </div>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {(e.clock_in || e.clock_out) && <span>{fmtClock(e.clock_in)} → {fmtClock(e.clock_out)}</span>}
                      {e.break_minutes > 0 && <span>{e.break_minutes} min break (unpaid)</span>}
                      {e.stops > 0 && <span>{e.stops} stops</span>}
                      {e.miles > 0 && <span>{e.miles} mi</span>}
                    </div>
                    {e.notes && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>{e.notes}</div>}

                    {isEditing ? (
                      <div style={{ marginTop: 12 }}>
                        <EntryForm
                          dateLabel={`Edit ${fmtDay(e.work_date)}`}
                          form={form} setForm={setForm} busy={busy}
                          onSave={() => saveEntry(e.work_date)} onCancel={() => setEditing(null)}
                        />
                      </div>
                    ) : !locked ? (
                      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                        <button onClick={() => startEdit(e)} disabled={busy}
                          style={{ padding: '7px 13px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            const warn = e.status === 'approved'
                              ? `${fmtDay(e.work_date)} has already been approved. Delete it anyway?`
                              : `Delete ${fmtDay(e.work_date)}?`
                            if (!window.confirm(warn)) return
                            const j = await post(`/api/admin/timesheet?id=${e.id}`, {}, 'DELETE')
                            if (j) say('Deleted.')
                          }}
                          disabled={busy}
                          style={{ padding: '7px 13px', borderRadius: 7, border: '1px solid rgba(var(--danger-rgb),0.3)', background: 'transparent', color: 'var(--danger)', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Delete
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 10 }}>
                        Locked — included in payroll run #{e.payroll_run_id}
                      </div>
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

function EntryForm({ dateLabel, form, setForm, busy, onSave, onCancel }) {
  const set = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.value }))
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(var(--green-rgb),0.25)', borderRadius: 12, padding: '16px', marginBottom: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>{dateLabel}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 12 }}>
        Enter hours <strong>before</strong> the break.{' '}
        {Number(form.hours) > 0 && (
          <>Paid: <strong>{Math.max(0, Number(form.hours) - (Number(form.break_minutes) || 0) / 60).toFixed(2)} h</strong></>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
        <label><span style={labelStyle}>Hours worked</span>
          <input type="number" inputMode="decimal" step="0.25" min="0" max="24" value={form.hours} onChange={set('hours')} style={inputStyle} />
        </label>
        <label><span style={labelStyle}>Break (min)</span>
          <input type="number" inputMode="numeric" step="5" min="0" value={form.break_minutes} onChange={set('break_minutes')} style={inputStyle} />
        </label>
        <label><span style={labelStyle}>Stops</span>
          <input type="number" inputMode="numeric" step="1" min="0" value={form.stops} onChange={set('stops')} style={inputStyle} />
        </label>
        <label><span style={labelStyle}>Miles</span>
          <input type="number" inputMode="decimal" step="0.1" min="0" value={form.miles} onChange={set('miles')} style={inputStyle} />
        </label>
      </div>
      <label style={{ display: 'block', marginTop: 12 }}><span style={labelStyle}>Notes</span>
        <textarea rows={2} value={form.notes} onChange={set('notes')} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
      </label>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button onClick={onSave} disabled={busy}
          style={{ padding: '11px 20px', borderRadius: 8, border: 'none', background: 'var(--green)', color: '#fff', fontSize: '0.92rem', fontWeight: 800, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
          Save
        </button>
        <button onClick={onCancel} disabled={busy}
          style={{ padding: '11px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.92rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}
