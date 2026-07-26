// Payroll — owner only. Four tabs:
//   Approve Time · Run Payroll · History · Crew & Settings
// Nothing here is a wizard: every step is reversible until a run is finalized,
// and a finalized run can still be voided (which releases the hours again).
import { useState, useEffect, useCallback, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isOwnerEmail, isAdminEmail } from '../../lib/auth'
import { suggestPeriod, PAY_FREQUENCIES } from '../../lib/payroll'

export async function getServerSideProps({ req, res }) {
  res?.setHeader('Cache-Control', 'no-store')
  const session = await getSessionFromRequest(req, res)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  // Pay rates and W-4 data are owner-only; a tech admin lands on their timesheet.
  if (!isOwnerEmail(session.email)) {
    return { redirect: { destination: isAdminEmail(session.email) ? '/admin/timesheet' : '/dashboard', permanent: false } }
  }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: process.env.CALENDAR_TIMEZONE || 'America/Chicago' })
  return { props: { email: session.email, today, taxYear: Number(today.slice(0, 4)) } }
}

const usd = (cents) => ((Number(cents) || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const hrs = (h) => (Number(h) || 0).toFixed(2)
const centsFromDollars = (v) => Math.round((Number(v) || 0) * 100)
const dollarsFromCents = (c) => ((Number(c) || 0) / 100).toString()

function fmtDay(d) {
  if (!d) return '—'
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const card = { background: 'var(--bg-card)', border: '1px solid rgba(var(--green-rgb),0.15)', borderRadius: 12, padding: '16px 18px' }
const input = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(var(--green-rgb),0.25)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }
const lbl = { fontSize: '0.64rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: 5 }
const btn = (kind = 'ghost') => {
  const map = {
    primary: { background: 'var(--green)', color: '#fff', border: 'none' },
    gold:    { background: 'rgba(var(--gold-rgb),0.10)', color: 'var(--gold)', border: '1px solid rgba(var(--gold-rgb),0.35)' },
    info:    { background: 'rgba(var(--info-rgb),0.08)', color: 'var(--info)', border: '1px solid rgba(var(--info-rgb),0.30)' },
    danger:  { background: 'transparent', color: 'var(--danger)', border: '1px solid rgba(var(--danger-rgb),0.30)' },
    ghost:   { background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' },
  }
  return { padding: '10px 16px', borderRadius: 8, fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', ...map[kind] }
}
const th = { textAlign: 'left', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', padding: '8px 10px', whiteSpace: 'nowrap' }
const td = { padding: '10px', fontSize: '0.88rem', borderTop: '1px solid var(--border)', whiteSpace: 'nowrap' }

const TABS = [
  ['approve', 'Approve Time'],
  ['run', 'Run Payroll'],
  ['history', 'History'],
  ['crew', 'Crew & Settings'],
]

export default function Payroll({ today, taxYear }) {
  const [tab, setTab] = useState('approve')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [crew, setCrew] = useState({ employees: [], settings: null, ytd: {} })
  const [runs, setRuns] = useState([])
  // Run-tab state lives up here so switching tabs (to fix one timesheet entry,
  // say) doesn't throw away a set of adjustments and a preview.
  const [runState, setRunState] = useState({ period: null, adjust: {}, preview: null, draft: null })

  const api = useCallback(async (url, { method = 'GET', body } = {}) => {
    setBusy(true)
    try {
      const r = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`)
      return j
    } catch (e) {
      setMsg({ kind: 'error', text: e.message })
      return null
    } finally {
      setBusy(false)
    }
  }, [])

  const loadCrew = useCallback(async () => {
    const j = await api('/api/admin/payroll-employees')
    if (j) setCrew({ employees: j.employees || [], settings: j.settings || null, ytd: j.ytd || {} })
  }, [api])

  const loadRuns = useCallback(async () => {
    const j = await api('/api/admin/payroll-run')
    if (j) setRuns(j.runs || [])
  }, [api])

  useEffect(() => { loadCrew(); loadRuns() }, [loadCrew, loadRuns])

  const nameById = useMemo(
    () => Object.fromEntries(crew.employees.map((e) => [e.id, e.name])),
    [crew.employees]
  )

  return (
    <>
      <Head><title>Payroll · GreenGuard USA</title></Head>
      <PortalLayout isAdmin title="Payroll">

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 22 }}>
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              ...btn(tab === key ? 'gold' : 'ghost'),
              fontWeight: tab === key ? 900 : 700,
            }}>{label}</button>
          ))}
          <Link href="/admin/timesheet" style={{ ...btn('ghost'), textDecoration: 'none' }}>My Timesheet →</Link>
          <Link href="/admin/expenses" style={{ ...btn('ghost'), textDecoration: 'none' }}>Expenses →</Link>
        </div>

        {msg && (
          <div style={{
            marginBottom: 18, padding: '12px 14px', borderRadius: 10, fontSize: '0.9rem', fontWeight: 700,
            background: msg.kind === 'error' ? 'rgba(var(--danger-rgb),0.08)' : 'rgba(var(--ok-rgb),0.08)',
            border: `1px solid ${msg.kind === 'error' ? 'rgba(var(--danger-rgb),0.3)' : 'rgba(var(--ok-rgb),0.3)'}`,
            color: msg.kind === 'error' ? 'var(--danger)' : 'var(--ok)',
            display: 'flex', justifyContent: 'space-between', gap: 12,
          }}>
            <span>{msg.text}</span>
            <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 900 }}>×</button>
          </div>
        )}

        {tab === 'approve' && <ApproveTab api={api} busy={busy} nameById={nameById} setMsg={setMsg} today={today} />}
        {tab === 'run' && (
          <RunTab api={api} busy={busy} setMsg={setMsg} today={today}
            employees={crew.employees} settings={crew.settings}
            state={runState} setState={setRunState}
            onChanged={() => { loadRuns() }} />
        )}
        {tab === 'history' && <HistoryTab api={api} runs={runs} busy={busy} setMsg={setMsg} reload={loadRuns} taxYear={taxYear} />}
        {tab === 'crew' && <CrewTab api={api} busy={busy} crew={crew} reload={loadCrew} setMsg={setMsg} />}

      </PortalLayout>
    </>
  )
}

// ── Approve Time ────────────────────────────────────────────────────────────

// Hoisted so ticking a checkbox doesn't remount every row (a new component
// type each render means React rebuilds the whole table and drops focus).
function EntryRow({ e, nameById, sel, setSel, showCheck }) {
  return (
    <tr>
      {showCheck && (
        <td style={td}>
          <input type="checkbox" checked={Boolean(sel[e.id])}
            onChange={(ev) => setSel((s) => ({ ...s, [e.id]: ev.target.checked }))} />
        </td>
      )}
      <td style={td}>{fmtDay(e.work_date)}</td>
      <td style={td}>{nameById[e.employee_id] || `#${e.employee_id}`}</td>
      <td style={{ ...td, fontWeight: 800 }}>{hrs(e.paidHours ?? e.hours)}</td>
      <td style={td}>{e.stops || '—'}</td>
      <td style={td}>{e.miles || '—'}</td>
      <td style={{ ...td, color: 'var(--text-dim)', whiteSpace: 'normal', minWidth: 160 }}>{e.notes || ''}</td>
      <td style={{ ...td, color: 'var(--text-dim)' }}>{e.clock_out ? 'clocked' : e.source}</td>
    </tr>
  )
}

const ENTRY_HEAD = ['Date', 'Who', 'Hours', 'Stops', 'Miles', 'Notes', 'Source']

function ApproveTab({ api, busy, nameById, setMsg, today }) {
  const [entries, setEntries] = useState([])
  const [sel, setSel] = useState({})
  const [range, setRange] = useState(() => {
    const from = new Date(`${today}T12:00:00`)
    from.setDate(from.getDate() - 28)
    return { from: from.toLocaleDateString('en-CA'), to: today }
  })

  const load = useCallback(async () => {
    const j = await api(`/api/admin/timesheet?all=1&from=${range.from}&to=${range.to}`)
    if (j) { setEntries(j.entries || []); setSel({}) }
  }, [api, range.from, range.to])

  useEffect(() => { load() }, [load])

  // A day that is still on the clock has no final hours yet — approving it
  // would claim it into a run at 0 h and lock the tech out of clocking out.
  const running = entries.filter((e) => e.running)
  const pending = entries.filter((e) => !e.running && (e.status === 'submitted' || e.status === 'open'))
  const approved = entries.filter((e) => e.status === 'approved')
  const selectedIds = Object.entries(sel).filter(([, v]) => v).map(([k]) => Number(k))

  async function act(action, ids) {
    if (!ids.length) return setMsg({ kind: 'error', text: 'Nothing selected' })
    const j = await api('/api/admin/timesheet', { method: 'PATCH', body: { action, ids } })
    if (j) {
      setMsg({ kind: 'ok', text: `${action === 'approve' ? 'Approved' : 'Sent back'} ${j.entries?.length ?? 0} entries` })
      load()
    }
  }

  return (
    <>
      <div style={{ ...card, marginBottom: 18, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ flex: '1 1 140px' }}><span style={lbl}>From</span>
          <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} style={input} />
        </label>
        <label style={{ flex: '1 1 140px' }}><span style={lbl}>To</span>
          <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} style={input} />
        </label>
        <a href={`/api/admin/payroll-export?timesheets=1&from=${range.from}&to=${range.to}`}
          target="_blank" rel="noopener noreferrer"
          style={{ ...btn('ghost'), textDecoration: 'none' }}>Export CSV</a>
      </div>

      {running.length > 0 && (
        <div style={{ ...card, marginBottom: 18, borderColor: 'rgba(var(--info-rgb),0.35)' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--info)', marginBottom: 6 }}>
            Still on the clock
          </div>
          {running.map((e) => (
            <div key={e.id} style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              {nameById[e.employee_id] || `#${e.employee_id}`} — clocked in {fmtDay(e.work_date)}. Nothing to approve until they clock out.
            </div>
          ))}
        </div>
      )}

      <section style={{ marginBottom: 30 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--green)' }}>
            Waiting on approval — {pending.length}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btn('ghost')} disabled={busy}
              onClick={() => setSel(Object.fromEntries(pending.map((e) => [e.id, true])))}>Select all</button>
            <button style={btn('primary')} disabled={busy || !selectedIds.length}
              onClick={() => act('approve', selectedIds)}>Approve selected</button>
          </div>
        </div>

        {pending.length === 0 ? (
          <div style={{ ...card, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Nothing waiting. All submitted time is approved.</div>
        ) : (
          <div style={{ ...card, overflowX: 'auto', padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}></th>{ENTRY_HEAD.map((h) => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>{pending.map((e) => (
                <EntryRow key={e.id} e={e} nameById={nameById} sel={sel} setSel={setSel} showCheck />
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            Approved, not yet paid — {approved.length} ({hrs(approved.reduce((s, e) => s + (e.paidHours ?? e.hours ?? 0), 0))} h)
          </div>
          {approved.length > 0 && (
            <button style={btn('danger')} disabled={busy}
              onClick={() => {
                if (!window.confirm(`Send all ${approved.length} approved entries back for edits?`)) return
                act('unapprove', approved.map((e) => e.id))
              }}>Send all back</button>
          )}
        </div>
        {approved.length > 0 && (
          <div style={{ ...card, overflowX: 'auto', padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{ENTRY_HEAD.map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{approved.map((e) => (
                <EntryRow key={e.id} e={e} nameById={nameById} sel={sel} setSel={setSel} />
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

// ── Run Payroll ─────────────────────────────────────────────────────────────

function RunTab({ api, busy, setMsg, today, employees, settings, state, setState, onChanged }) {
  const freq = settings?.defaultPayFrequency || 'biweekly'
  const period = state.period || (() => {
    const p = suggestPeriod(today, freq)
    return { start: p.start, end: p.end, payDate: today }
  })()
  const { adjust, preview, draft } = state

  // Editing the dates or the adjustments invalidates the numbers on screen, so
  // the preview is dropped — but NOT the draft: a draft exists in the database
  // holding real timesheet hours, and hiding it would leave the owner unable to
  // finalize or void it from this tab.
  const setPeriod = (fn) =>
    setState((s) => {
      const cur = s.period || period
      return { ...s, period: typeof fn === 'function' ? fn(cur) : fn, preview: null }
    })
  const setAdjust = (fn) =>
    setState((s) => ({ ...s, adjust: typeof fn === 'function' ? fn(s.adjust) : fn, preview: null }))

  // Seed the suggested period from the business pay frequency, and reseed if
  // that setting changes — but never stomp dates the owner typed themselves.
  useEffect(() => {
    const p = suggestPeriod(today, freq)
    setState((s) => (s.periodTouched || (s.period && s.seededFreq === freq)
      ? s
      : { ...s, period: { start: p.start, end: p.end, payDate: today }, seededFreq: freq }))
  }, [today, freq, setState])

  function adjustments() {
    const out = {}
    for (const [id, a] of Object.entries(adjust || {})) {
      const bonusCents = centsFromDollars(a.bonus)
      const otherDeductionCents = centsFromDollars(a.deduction)
      if (bonusCents || otherDeductionCents) {
        out[id] = { bonusCents, otherDeductionCents, otherDeductionLabel: a.label || null }
      }
    }
    return out
  }

  async function doPreview() {
    const j = await api('/api/admin/payroll-run', {
      method: 'POST',
      body: {
        action: 'preview',
        periodStart: period.start, periodEnd: period.end, payDate: period.payDate,
        adjustments: adjustments(),
        // A draft has already claimed its entries; without its id the preview
        // would come back empty ("no approved time") while the draft holds it.
        runId: draft?.run?.id || null,
      },
    })
    if (j) {
      setState((s) => ({ ...s, preview: { ...j.preview, form941Due: j.form941Due } }))
      if (!j.preview.items.length) setMsg({ kind: 'error', text: 'No approved time in that period — approve time first.' })
    }
  }

  async function doCreate() {
    const j = await api('/api/admin/payroll-run', {
      method: 'POST',
      body: { action: 'create', periodStart: period.start, periodEnd: period.end, payDate: period.payDate, adjustments: adjustments() },
    })
    if (j) {
      setState((s) => ({ ...s, draft: j }))
      setMsg({ kind: 'ok', text: `Draft run #${j.run.id} created. Review it, then finalize.` })
      onChanged()
    }
  }

  async function doFinalize() {
    if (!draft) return
    if (!window.confirm(`Finalize run #${draft.run.id}? This locks the hours as paid and posts the expense to the books.`)) return
    const j = await api('/api/admin/payroll-run', { method: 'POST', body: { action: 'finalize', runId: draft.run.id } })
    if (j) {
      setState((s) => ({ ...s, draft: j }))
      setMsg({ kind: 'ok', text: `Run #${j.run.id} finalized. Net to pay: ${usd(j.run.netCents)}.` })
      onChanged()
    }
  }

  const shown = draft ? { items: draft.items, totals: null, run: draft.run } : preview
  const warnings = preview?.warnings || []

  return (
    <>
      <div style={{ ...card, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <label><span style={lbl}>Period start</span>
            <input type="date" value={period.start} onChange={(e) => { setState((s) => ({ ...s, periodTouched: true })); setPeriod((p) => ({ ...p, start: e.target.value })) }} style={input} />
          </label>
          <label><span style={lbl}>Period end</span>
            <input type="date" value={period.end} onChange={(e) => { setState((s) => ({ ...s, periodTouched: true })); setPeriod((p) => ({ ...p, end: e.target.value })) }} style={input} />
          </label>
          <label><span style={lbl}>Pay date</span>
            <input type="date" value={period.payDate} onChange={(e) => { setState((s) => ({ ...s, periodTouched: true })); setPeriod((p) => ({ ...p, payDate: e.target.value })) }} style={input} />
          </label>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 10, lineHeight: 1.6 }}>
          Only <strong>approved</strong> time inside the period is picked up. Overtime is figured per workweek
          (starting {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][settings?.weekStartDay ?? 0]}),
          so keep the period aligned to whole weeks. The pay date&apos;s year sets the tax tables.
        </div>
        {draft?.run?.status === 'draft' && (
          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(var(--info-rgb),0.08)', border: '1px solid rgba(var(--info-rgb),0.3)', color: 'var(--info)', fontSize: '0.85rem', fontWeight: 700 }}>
            Draft run #{draft.run.id} ({draft.run.periodStart} – {draft.run.periodEnd}) is holding those hours.
            Finalize it, or void it from the History tab, before running a different period.
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <button style={btn('info')} disabled={busy} onClick={doPreview}>Preview</button>
          {preview?.items?.length > 0 && !draft && (
            <button style={btn('primary')} disabled={busy} onClick={doCreate}>Create draft run</button>
          )}
          {draft?.run?.status === 'draft' && (
            <button style={btn('gold')} disabled={busy} onClick={doFinalize}>Finalize run #{draft.run.id}</button>
          )}
        </div>
      </div>

      {/* Per-employee bonus / deduction */}
      <div style={{ ...card, marginBottom: 18, overflowX: 'auto' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 12 }}>
          Adjustments (optional)
        </div>
        {employees.filter((e) => e.active).map((e) => (
          <div key={e.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,1fr) 110px 110px minmax(120px,1fr)', gap: 10, alignItems: 'end', marginBottom: 10, minWidth: 520 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{e.name}</div>
            <label><span style={lbl}>Bonus $</span>
              <input type="number" step="0.01" min="0" value={adjust?.[e.id]?.bonus || ''} style={input}
                onChange={(ev) => setAdjust((a) => ({ ...a, [e.id]: { ...a[e.id], bonus: ev.target.value } }))} />
            </label>
            <label><span style={lbl}>Deduct $</span>
              <input type="number" step="0.01" min="0" value={adjust?.[e.id]?.deduction || ''} style={input}
                onChange={(ev) => setAdjust((a) => ({ ...a, [e.id]: { ...a[e.id], deduction: ev.target.value } }))} />
            </label>
            <label><span style={lbl}>Deduction label</span>
              <input value={adjust?.[e.id]?.label || ''} placeholder="e.g. uniform" style={input}
                onChange={(ev) => setAdjust((a) => ({ ...a, [e.id]: { ...a[e.id], label: ev.target.value } }))} />
            </label>
          </div>
        ))}
        <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
          Bonuses are taxable wages and raise the overtime regular rate only if they&apos;re non-discretionary — check with your CPA for production bonuses.
        </div>
      </div>

      {warnings.length > 0 && (
        <div style={{ ...card, marginBottom: 18, borderColor: 'rgba(var(--warn-rgb),0.35)' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--warn)', marginBottom: 8 }}>
            Check before you pay
          </div>
          {warnings.map((w, i) => (
            <div key={i} style={{ color: 'var(--warn)', fontSize: '0.86rem', fontWeight: 700, lineHeight: 1.6, marginBottom: 4 }}>{w}</div>
          ))}
        </div>
      )}

      {shown?.items?.length > 0 && (
        <RunTable
          run={draft?.run}
          items={shown.items}
          totals={preview && !draft ? preview.totals : null}
          form941Due={preview?.form941Due}
        />
      )}
    </>
  )
}

function RunTable({ run, items, totals, form941Due }) {
  const sum = (k) => items.reduce((s, i) => s + (Number(i[k]) || 0), 0)
  return (
    <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
      {run && (
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 800 }}>
            Run #{run.id} · {fmtDay(run.periodStart)} – {fmtDay(run.periodEnd)} · pay {fmtDay(run.payDate)}
            <span style={{ marginLeft: 10, fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: run.status === 'finalized' ? 'var(--ok)' : run.status === 'void' ? 'var(--danger)' : 'var(--info)' }}>
              {run.status}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <a href={`/api/admin/payroll-export?run=${run.id}`} target="_blank" rel="noopener noreferrer" style={{ ...btn('ghost'), textDecoration: 'none' }}>CSV</a>
          </div>
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
        <thead><tr>
          <th style={th}>Employee</th><th style={th}>Reg</th><th style={th}>OT</th>
          <th style={th}>Gross</th><th style={th}>Fed WH</th><th style={th}>SS</th><th style={th}>Medicare</th>
          <th style={th}>Other</th><th style={th}>Reimb.</th><th style={th}>Net pay</th><th style={th}>Employer tax</th><th style={th}></th>
        </tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.employeeId}>
              <td style={{ ...td, fontWeight: 800 }}>
                {i.employeeName}
                {i.classification === 'contractor' && <span style={{ marginLeft: 6, fontSize: '0.66rem', color: 'var(--warn)', fontWeight: 800 }}>1099</span>}
              </td>
              <td style={td}>{hrs(i.regularHours)}</td>
              <td style={{ ...td, color: i.otHours > 0 ? 'var(--warn)' : 'inherit', fontWeight: i.otHours > 0 ? 800 : 400 }}>{hrs(i.otHours)}</td>
              <td style={td}>{usd(i.taxableGrossCents)}</td>
              <td style={td}>{usd(i.fedIncomeTaxCents)}</td>
              <td style={td}>{usd(i.employeeSsCents)}</td>
              <td style={td}>{usd(i.employeeMedicareCents + i.employeeAddlMedicareCents)}</td>
              <td style={td}>{usd(i.otherDeductionCents)}</td>
              <td style={td} title="mileage + approved receipts">{usd(i.reimbursementCents + (i.expenseReimbursementCents || 0))}</td>
              <td style={{ ...td, fontWeight: 900, color: 'var(--green)' }}>{usd(i.netCents)}</td>
              <td style={td}>{usd(i.employerTaxCents)}</td>
              <td style={td}>
                {run?.id && (
                  <Link href={`/admin/paystub?run=${run.id}&employee=${i.employeeId}`} style={{ color: 'var(--info)', fontWeight: 700, fontSize: '0.82rem' }}>
                    Paystub →
                  </Link>
                )}
              </td>
            </tr>
          ))}
          <tr>
            <td style={{ ...td, fontWeight: 900 }}>Totals</td>
            <td style={{ ...td, fontWeight: 800 }}>{hrs(sum('regularHours'))}</td>
            <td style={{ ...td, fontWeight: 800 }}>{hrs(sum('otHours'))}</td>
            <td style={{ ...td, fontWeight: 800 }}>{usd(sum('taxableGrossCents'))}</td>
            <td style={{ ...td, fontWeight: 800 }}>{usd(sum('fedIncomeTaxCents'))}</td>
            <td style={{ ...td, fontWeight: 800 }}>{usd(sum('employeeSsCents'))}</td>
            <td style={{ ...td, fontWeight: 800 }}>{usd(sum('employeeMedicareCents') + sum('employeeAddlMedicareCents'))}</td>
            <td style={{ ...td, fontWeight: 800 }}>{usd(sum('otherDeductionCents'))}</td>
            <td style={{ ...td, fontWeight: 800 }}>{usd(sum('reimbursementCents') + sum('expenseReimbursementCents'))}</td>
            <td style={{ ...td, fontWeight: 900, color: 'var(--green)' }}>{usd(sum('netCents'))}</td>
            <td style={{ ...td, fontWeight: 800 }}>{usd(sum('employerTaxCents'))}</td>
            <td style={td}></td>
          </tr>
        </tbody>
      </table>
      <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
        <div><strong>Cash out the door:</strong> {usd(sum('netCents'))} to the crew + {usd(sum('fedIncomeTaxCents') + sum('employeeSsCents') + sum('employeeMedicareCents') + sum('employeeAddlMedicareCents') + sum('employerSsCents') + sum('employerMedicareCents') + sum('employerFutaCents') + sum('employerSutaCents'))} in payroll taxes.</div>
        <div>
          <strong>Total labor cost:</strong>{' '}
          {usd(sum('grossCents') - sum('expenseReimbursementCents') + sum('employerTaxCents'))}
          {totals ? ` · ${hrs(totals.hours)} h` : ''}
          {sum('expenseReimbursementCents') > 0 && (
            <span style={{ color: 'var(--text-dim)' }}>
              {' '}(excludes {usd(sum('expenseReimbursementCents'))} of reimbursed receipts — already booked as their own expense)
            </span>
          )}
        </div>
        {form941Due && <div>941 deposit due by <strong>{fmtDay(form941Due)}</strong> (monthly depositor). TX SUTA files quarterly with the TWC.</div>}
      </div>
    </div>
  )
}

// ── History ─────────────────────────────────────────────────────────────────

function HistoryTab({ api, runs, busy, setMsg, reload, taxYear }) {
  const [open, setOpen] = useState(null)
  const [detail, setDetail] = useState(null)

  async function fetchDetail(runId) {
    const j = await api(`/api/admin/payroll-run?id=${runId}`)
    if (j) { setOpen(runId); setDetail(j) }
  }

  async function show(runId) {
    if (open === runId) { setOpen(null); setDetail(null); return }
    await fetchDetail(runId)
  }

  async function act(action, runId) {
    const label = action === 'finalize' ? 'Finalize' : action === 'void' ? 'Void' : 'Re-post'
    if (!window.confirm(`${label} run #${runId}?`)) return
    const j = await api('/api/admin/payroll-run', { method: 'POST', body: { action, runId } })
    if (j) {
      setMsg({ kind: 'ok', text: `Run #${runId} ${action === 'void' ? 'voided — hours released' : action === 'finalize' ? 'finalized' : 'posted to books'}.` })
      reload()
      // Re-fetch rather than toggling — show() would collapse the panel the
      // owner is watching.
      if (open === runId) fetchDetail(runId)
    }
  }

  const year = taxYear || new Date().getFullYear()

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <a href={`/api/admin/payroll-export?year=${year}`} target="_blank" rel="noopener noreferrer" style={{ ...btn('ghost'), textDecoration: 'none' }}>Export {year} register (CSV)</a>
      </div>

      {runs.length === 0 ? (
        <div style={{ ...card, color: 'var(--text-muted)', fontSize: '0.9rem' }}>No payroll runs yet.</div>
      ) : runs.map((r) => (
        <div key={r.id} style={{ ...card, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 800 }}>
                #{r.id} · {fmtDay(r.periodStart)} – {fmtDay(r.periodEnd)}
                <span style={{ marginLeft: 10, fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: r.status === 'finalized' ? 'var(--ok)' : r.status === 'void' ? 'var(--danger)' : 'var(--info)' }}>
                  {r.status}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 4 }}>
                Paid {fmtDay(r.payDate)} · net {usd(r.netCents)} · gross {usd(r.grossCents)} · employer tax {usd(r.employerTaxCents)}
                {r.postedToBooks ? ' · in books' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={btn('ghost')} disabled={busy} onClick={() => show(r.id)}>{open === r.id ? 'Hide' : 'Details'}</button>
              {r.status === 'draft' && <button style={btn('gold')} disabled={busy} onClick={() => act('finalize', r.id)}>Finalize</button>}
              {r.status === 'finalized' && !r.postedToBooks && <button style={btn('info')} disabled={busy} onClick={() => act('post-books', r.id)}>Post to books</button>}
              {r.status !== 'void' && <button style={btn('danger')} disabled={busy} onClick={() => act('void', r.id)}>Void</button>}
            </div>
          </div>
          {open === r.id && detail && (
            <div style={{ marginTop: 14 }}>
              <RunTable run={detail.run} items={detail.items} form941Due={detail.form941Due} />
            </div>
          )}
        </div>
      ))}
    </>
  )
}

// ── Crew & Settings ─────────────────────────────────────────────────────────

const BLANK_EMP = {
  name: '', email: '', phone: '', classification: 'employee', pay_type: 'hourly',
  pay_frequency: 'biweekly', hourly_rate: '', salary_annual: '', per_stop: '', mileage_rate: '70',
  ot_eligible: true, exempt: false, fww: false, salary_hours_per_week: '40',
  filing_status: 'single', w4_multiple_jobs: false,
  w4_dependents_credit: '', w4_other_income: '', w4_deductions: '',
  w4_extra_withholding: '', fed_withholding_mode: 'table', fed_flat_pct: '',
  hired_on: '', active: true, notes: '',
}

function empToForm(e) {
  return {
    ...BLANK_EMP,
    ...e,
    hourly_rate: dollarsFromCents(e.hourly_rate_cents),
    salary_annual: dollarsFromCents(e.salary_annual_cents),
    per_stop: dollarsFromCents(e.per_stop_cents),
    mileage_rate: String(e.mileage_rate_cents || 0),
    w4_dependents_credit: dollarsFromCents(e.w4_dependents_credit_cents),
    w4_other_income: dollarsFromCents(e.w4_other_income_cents),
    w4_deductions: dollarsFromCents(e.w4_deductions_cents),
    w4_extra_withholding: dollarsFromCents(e.w4_extra_withholding_cents),
    fed_flat_pct: e.fed_flat_pct ? String(e.fed_flat_pct) : '',
    hired_on: e.hired_on || '',
  }
}

function formToPayload(f) {
  return {
    name: f.name, email: f.email, phone: f.phone || null,
    classification: f.classification, pay_type: f.pay_type, pay_frequency: f.pay_frequency,
    hourly_rate_cents: centsFromDollars(f.hourly_rate),
    salary_annual_cents: centsFromDollars(f.salary_annual),
    per_stop_cents: centsFromDollars(f.per_stop),
    mileage_rate_cents: Math.round(Number(f.mileage_rate) || 0),
    ot_eligible: true,                 // statutory for non-exempt W-2 staff
    exempt: Boolean(f.exempt),
    fww: Boolean(f.fww),
    salary_hours_per_week: Number(f.salary_hours_per_week) || 40,
    filing_status: f.filing_status,
    w4_multiple_jobs: Boolean(f.w4_multiple_jobs),
    w4_dependents_credit_cents: centsFromDollars(f.w4_dependents_credit),
    w4_other_income_cents: centsFromDollars(f.w4_other_income),
    w4_deductions_cents: centsFromDollars(f.w4_deductions),
    w4_extra_withholding_cents: centsFromDollars(f.w4_extra_withholding),
    fed_withholding_mode: f.fed_withholding_mode,
    fed_flat_pct: Number(f.fed_flat_pct) || 0,
    hired_on: f.hired_on || null,
    active: Boolean(f.active),
    notes: f.notes || null,
  }
}

function CrewTab({ api, busy, crew, reload, setMsg }) {
  const [form, setForm] = useState(null)          // null = closed, {} = new
  const [settings, setSettings] = useState(null)

  useEffect(() => { if (crew.settings) setSettings({ ...crew.settings }) }, [crew.settings])

  const set = (k) => (ev) => {
    const v = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function save() {
    if (!form.name?.trim() || !form.email?.trim()) return setMsg({ kind: 'error', text: 'Name and email are required' })
    if (form.fed_withholding_mode === 'flat' && !(Number(form.fed_flat_pct) > 0)) {
      return setMsg({ kind: 'error', text: 'Flat withholding needs a percentage above 0 (or pick "None (1099)" to withhold nothing).' })
    }
    if (form.pay_type === 'hourly' && form.classification === 'employee'
        && !(Number(form.hourly_rate) > 0) && !(Number(form.per_stop) > 0)) {
      return setMsg({ kind: 'error', text: 'An hourly employee needs an hourly rate (or a per-stop rate).' })
    }
    const payload = formToPayload(form)
    const j = form.id
      ? await api('/api/admin/payroll-employees', { method: 'PATCH', body: { id: form.id, ...payload } })
      : await api('/api/admin/payroll-employees', { method: 'POST', body: payload })
    if (j) { setMsg({ kind: 'ok', text: `Saved ${j.employee.name}` }); setForm(null); reload() }
  }

  async function saveSettings() {
    // An emptied field means "leave it alone", not "set it to zero" — a blank
    // SUTA rate saved as 0 would understate employer tax on every future run.
    const body = {
      legalName: settings.legalName, ein: settings.ein, address: settings.address,
      twcAccount: settings.twcAccount, defaultPayFrequency: settings.defaultPayFrequency,
      weekStartDay: Number(settings.weekStartDay) || 0,
    }
    if (settings.sutaRate !== '' && settings.sutaRate != null) body.sutaRate = Number(settings.sutaRate)
    if (settings.mileageRateCents !== '' && settings.mileageRateCents != null) {
      body.mileageRateCents = Math.round(Number(settings.mileageRateCents))
    }
    const j = await api('/api/admin/payroll-employees', { method: 'POST', body: { settings: body } })
    if (j) { setMsg({ kind: 'ok', text: 'Settings saved' }); reload() }
  }

  return (
    <>
      <section style={{ marginBottom: 30 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--green)' }}>Crew</div>
          <button style={btn('primary')} disabled={busy}
            onClick={() => setForm({ ...BLANK_EMP, mileage_rate: String(crew.settings?.mileageRateCents ?? 70) })}>+ Add employee</button>
        </div>

        {form && (
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 14 }}>{form.id ? `Edit ${form.name}` : 'New employee'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <label><span style={lbl}>Name *</span><input value={form.name} onChange={set('name')} style={input} /></label>
              <label><span style={lbl}>Portal email *</span><input type="email" value={form.email} onChange={set('email')} style={input} /></label>
              <label><span style={lbl}>Phone</span><input value={form.phone || ''} onChange={set('phone')} style={input} /></label>
              <label><span style={lbl}>Hired on</span><input type="date" value={form.hired_on || ''} onChange={set('hired_on')} style={input} /></label>
              <label><span style={lbl}>Classification</span>
                <select value={form.classification} onChange={set('classification')} style={input}>
                  <option value="employee">W-2 employee</option>
                  <option value="contractor">1099 contractor</option>
                </select>
              </label>
              <label><span style={lbl}>Pay type</span>
                <select value={form.pay_type} onChange={set('pay_type')} style={input}>
                  <option value="hourly">Hourly</option>
                  <option value="salary">Salary</option>
                </select>
              </label>
              <label><span style={lbl}>Pay frequency</span>
                <select value={form.pay_frequency} onChange={set('pay_frequency')} style={input}>
                  {Object.keys(PAY_FREQUENCIES).map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <label><span style={lbl}>Hourly rate $</span><input type="number" step="0.01" min="0" value={form.hourly_rate} onChange={set('hourly_rate')} style={input} /></label>
              <label><span style={lbl}>Salary $/yr</span><input type="number" step="1" min="0" value={form.salary_annual} onChange={set('salary_annual')} style={input} /></label>
              <label><span style={lbl}>Per-stop bonus $</span><input type="number" step="0.01" min="0" value={form.per_stop} onChange={set('per_stop')} style={input} /></label>
              <label><span style={lbl}>Mileage ¢/mi</span><input type="number" step="1" min="0" value={form.mileage_rate} onChange={set('mileage_rate')} style={input} /></label>
              <label><span style={lbl}>W-4 filing status</span>
                <select value={form.filing_status} onChange={set('filing_status')} style={input}>
                  <option value="single">Single / married filing separately</option>
                  <option value="married">Married filing jointly</option>
                  <option value="head">Head of household</option>
                </select>
              </label>
              <label><span style={lbl}>Dependents credit $ (W-4 3)</span><input type="number" step="1" min="0" value={form.w4_dependents_credit} onChange={set('w4_dependents_credit')} style={input} /></label>
              <label><span style={lbl}>Other income $ (W-4 4a)</span><input type="number" step="1" min="0" value={form.w4_other_income} onChange={set('w4_other_income')} style={input} /></label>
              <label><span style={lbl}>Deductions $ (W-4 4b)</span><input type="number" step="1" min="0" value={form.w4_deductions} onChange={set('w4_deductions')} style={input} /></label>
              <label><span style={lbl}>Extra withholding $ (W-4 4c)</span><input type="number" step="0.01" min="0" value={form.w4_extra_withholding} onChange={set('w4_extra_withholding')} style={input} /></label>
              <label><span style={lbl}>Fed withholding method</span>
                <select value={form.fed_withholding_mode} onChange={set('fed_withholding_mode')} style={input}>
                  <option value="table">IRS percentage method</option>
                  <option value="flat">Flat %</option>
                  {/* Zero withholding needs a W-4 exempt certification, so it
                      is offered for contractors only. */}
                  {form.classification === 'contractor' && <option value="none">None (1099)</option>}
                </select>
              </label>
              {form.fed_withholding_mode === 'flat' && (
                <label><span style={lbl}>Flat %</span><input type="number" step="0.1" min="0" max="100" value={form.fed_flat_pct} onChange={set('fed_flat_pct')} style={input} /></label>
              )}
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap' }}>
              {/* No free-standing "overtime eligible" switch: a non-exempt W-2
                  employee is entitled to overtime by law, so exemption is the
                  only thing that can turn it off. */}
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem', fontWeight: 700 }}
                title="Only a bona-fide executive/administrative/professional role qualifies. Service technicians do NOT, salaried or not.">
                <input type="checkbox" checked={Boolean(form.exempt)} onChange={set('exempt')} /> FLSA exempt (no overtime)
              </label>
              {form.pay_type === 'salary' && !form.exempt && (
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem', fontWeight: 700 }}
                  title="Half-time overtime on a fluctuating workweek is only lawful with a fixed salary and a written mutual understanding. Without it, overtime is a full 1.5x on salary ÷ 40.">
                  <input type="checkbox" checked={Boolean(form.fww)} onChange={set('fww')} /> Fluctuating-workweek agreement on file
                </label>
              )}
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem', fontWeight: 700 }}>
                <input type="checkbox" checked={Boolean(form.w4_multiple_jobs)} onChange={set('w4_multiple_jobs')} /> W-4 Step 2 box checked
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem', fontWeight: 700 }}>
                <input type="checkbox" checked={Boolean(form.active)} onChange={set('active')} /> Active
              </label>
            </div>
            <label style={{ display: 'block', marginTop: 12 }}><span style={lbl}>Notes</span>
              <textarea rows={2} value={form.notes || ''} onChange={set('notes')} style={{ ...input, resize: 'vertical' }} />
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button style={btn('primary')} disabled={busy} onClick={save}>Save</button>
              <button style={btn('ghost')} disabled={busy} onClick={() => setForm(null)}>Cancel</button>
            </div>
          </div>
        )}

        {crew.employees.length === 0 ? (
          <div style={{ ...card, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No employees yet. Add the technician here first — the email must match the login they use for the portal.
          </div>
        ) : (
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead><tr>
                <th style={th}>Name</th><th style={th}>Email</th><th style={th}>Type</th><th style={th}>Rate</th>
                <th style={th}>YTD gross</th><th style={th}>YTD fed WH</th><th style={th}>YTD hours</th><th style={th}></th>
              </tr></thead>
              <tbody>
                {crew.employees.map((e) => {
                  const y = crew.ytd[e.id] || {}
                  return (
                    <tr key={e.id} style={{ opacity: e.active ? 1 : 0.5 }}>
                      <td style={{ ...td, fontWeight: 800 }}>{e.name}{!e.active && ' (inactive)'}</td>
                      <td style={td}>{e.email}</td>
                      <td style={td}>{e.classification === 'contractor' ? '1099' : 'W-2'} · {e.pay_type}</td>
                      <td style={td}>{e.pay_type === 'salary' ? `${usd(e.salary_annual_cents)}/yr` : `${usd(e.hourly_rate_cents)}/h`}</td>
                      <td style={td}>{usd(y.grossCents)}</td>
                      <td style={td}>{usd(y.fedIncomeTaxCents)}</td>
                      <td style={td}>{hrs(y.hours)}</td>
                      <td style={td}>
                        <button style={{ ...btn('ghost'), padding: '6px 12px' }} onClick={() => setForm(empToForm(e))}>Edit</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {settings && (
        <section>
          <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 12 }}>
            Business settings
          </div>
          <div style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <label><span style={lbl}>Legal name</span><input value={settings.legalName || ''} onChange={(e) => setSettings((s) => ({ ...s, legalName: e.target.value }))} style={input} /></label>
              <label><span style={lbl}>EIN</span><input value={settings.ein || ''} onChange={(e) => setSettings((s) => ({ ...s, ein: e.target.value }))} style={input} placeholder="12-3456789" /></label>
              <label><span style={lbl}>TWC account</span><input value={settings.twcAccount || ''} onChange={(e) => setSettings((s) => ({ ...s, twcAccount: e.target.value }))} style={input} /></label>
              <label><span style={lbl}>TX SUTA rate (decimal)</span><input type="number" step="0.0001" min="0" max="1" value={settings.sutaRate ?? ''} onChange={(e) => setSettings((s) => ({ ...s, sutaRate: e.target.value }))} style={input} /></label>
              <label><span style={lbl}>Mileage ¢/mi default</span><input type="number" step="1" min="0" value={settings.mileageRateCents ?? ''} onChange={(e) => setSettings((s) => ({ ...s, mileageRateCents: e.target.value }))} style={input} /></label>
              <label><span style={lbl}>Workweek starts</span>
                <select value={settings.weekStartDay ?? 0} onChange={(e) => setSettings((s) => ({ ...s, weekStartDay: e.target.value }))} style={input}>
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </label>
              <label><span style={lbl}>Default pay frequency</span>
                <select value={settings.defaultPayFrequency} onChange={(e) => setSettings((s) => ({ ...s, defaultPayFrequency: e.target.value }))} style={input}>
                  {Object.keys(PAY_FREQUENCIES).map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <label style={{ gridColumn: '1 / -1' }}><span style={lbl}>Address (printed on paystubs)</span><input value={settings.address || ''} onChange={(e) => setSettings((s) => ({ ...s, address: e.target.value }))} style={input} /></label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button style={btn('primary')} disabled={busy} onClick={saveSettings}>Save settings</button>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 12, lineHeight: 1.7 }}>
              Texas has no state income tax, so employees have federal withholding + FICA only. Employer side is
              FICA match + 0.6% FUTA on the first $7,000 and your TWC SUTA rate on the first $9,000 per employee per year.
              Deposit 941 taxes on your assigned schedule (monthly depositors: the 15th of the following month) and file
              the TWC wage report quarterly.
            </div>
          </div>
        </section>
      )}
    </>
  )
}
