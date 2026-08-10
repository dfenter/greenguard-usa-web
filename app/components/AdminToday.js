import { useState, useEffect } from 'react'
import Link from 'next/link'
import { StopRow, CompletedRoundsSection } from './StopCard'
import { EmptyState } from './ui'

// Shared building blocks for the two admin dashboards (/admin/home and
// /admin/tech) so the KPI strip, distances, invoice-finalization state, and
// the Today stops section render identically on both.

export function fmtDayLabel(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export function getGreeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export function SectionLabel({ color = 'var(--text-dim)', children, style }) {
  return (
    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 'var(--w-head)', letterSpacing: '0.14em', textTransform: 'uppercase', color, ...style }}>
      {children}
    </div>
  )
}

export function Kpi({ label, value, sub, warn }) {
  return (
    <div style={{ flex: '1 1 130px', background: 'var(--bg-card)', border: `1px solid ${warn ? 'rgba(var(--warn-rgb),0.25)' : 'rgba(var(--green-rgb),0.15)'}`, borderRadius: 'var(--radius-sm)', padding: '14px 16px' }}>
      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 'var(--w-head)', letterSpacing: '0.12em', textTransform: 'uppercase', color: warn ? 'var(--warn)' : 'var(--text-dim)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '1.45rem', fontWeight: 900, lineHeight: 1, color: warn ? 'var(--warn)' : 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-dim)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// The four tank KPI cards shared by both dashboards.
export function TankKpiStrip({ todayStops, tomorrowStops, fullTanksOnHand, tanksNeededThisWeek, expectedDeliveryThisWeek }) {
  const tanksToday = todayStops.reduce((s, x) => s + (x.tanks || 0), 0)
  const tanksTomorrow = tomorrowStops.reduce((s, x) => s + (x.tanks || 0), 0)
  const onHand = fullTanksOnHand
  const incoming = expectedDeliveryThisWeek || 0
  const projectedTotal = (onHand ?? 0) + incoming
  const weekNeed = tanksNeededThisWeek
  const depotShort = onHand != null && weekNeed != null && projectedTotal < weekNeed
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
      <Kpi
        label="Tanks Needed Today"
        value={tanksToday}
        sub={todayStops.length === 0 ? 'no stops' : `across ${todayStops.length} stop${todayStops.length === 1 ? '' : 's'}`}
        warn={onHand != null && tanksToday > onHand}
      />
      <Kpi
        label="Tanks Needed Tomorrow"
        value={tanksTomorrow}
        sub={tomorrowStops.length === 0 ? 'no stops' : `across ${tomorrowStops.length} stop${tomorrowStops.length === 1 ? '' : 's'}`}
      />
      <Kpi
        label="Tanks at Depot"
        value={onHand != null ? onHand : '–'}
        sub={onHand == null ? 'no log yet' : incoming > 0 ? `+${incoming} Wed delivery → ${projectedTotal} projected` : 'on hand'}
        warn={depotShort}
      />
      <Kpi
        label="Tanks Needed This Week"
        value={weekNeed != null ? weekNeed : '–'}
        sub="rolling next 7 days"
      />
    </div>
  )
}

// Driving distance from the tech's current location to each stop.
export function useStopDistances(todayStops) {
  const [distances, setDistances] = useState({})
  const [distLoading, setDistLoading] = useState(false)

  function refreshDistances() {
    const addressable = todayStops.filter((s) => s.address)
    if (!addressable.length || !navigator.geolocation) return
    setDistLoading(true)
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const origin = `${pos.coords.latitude},${pos.coords.longitude}`
      try {
        const res = await fetch('/api/admin/distances', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin, addresses: addressable.map((s) => ({ id: s.email || s.title, address: s.address })) }),
        })
        setDistances(await res.json())
      } catch {}
      setDistLoading(false)
    }, () => setDistLoading(false))
  }

  useEffect(() => { refreshDistances() }, [todayStops]) // eslint-disable-line react-hooks/exhaustive-deps

  return { distances, distLoading, refreshDistances }
}

// Invoice status per stop (same endpoint /admin/rounds uses) — a stop with
// an invoice is finalized and drops into the Completed Rounds area.
export function useStopInvoices(todayStops, todayStr) {
  const [stopInvoices, setStopInvoices] = useState({})
  useEffect(() => {
    const payload = todayStops
      .map((s, i) => ({ key: String(i), email: s.email, calBookingUid: s.calBookingUid, serviceDate: todayStr }))
      .filter((s) => s.email)
    if (payload.length === 0) { setStopInvoices({}); return }
    let cancelled = false
    fetch('/api/admin/stop-invoices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stops: payload }),
    })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.invoices) setStopInvoices(d.invoices) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [todayStops, todayStr])
  return stopInvoices
}

// The Today stops section: label row with My Distance + All Rounds, the
// working stop list, and the Completed Rounds bin at the bottom.
export function TodayStopsSection({ todayStops, todayStr, distances, distLoading, refreshDistances, stopInvoices }) {
  const finalized = (i) => !!stopInvoices[String(i)]
  const completed = todayStops.map((_, i) => i).filter(finalized)
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <SectionLabel color="var(--green)">
          Today · {todayStops.length} {todayStops.length === 1 ? 'stop' : 'stops'}
        </SectionLabel>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={refreshDistances} disabled={distLoading}
            title="Recalculate driving distance from your current location to each stop"
            style={{ padding: '10px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(var(--info-rgb),0.35)', background: 'rgba(var(--info-rgb),0.08)', color: 'var(--info)', fontSize: 'var(--fs-sm)', fontWeight: 'var(--w-head)', cursor: distLoading ? 'wait' : 'pointer', opacity: distLoading ? 0.6 : 1 }}>
            {distLoading ? 'Locating…' : 'My Distance'}
          </button>
          <Link href="/admin/rounds" style={{ fontSize: 'var(--fs-sm)', color: 'var(--green-muted)', fontWeight: 'var(--w-emph)' }}>All Rounds →</Link>
        </div>
      </div>

      {todayStops.length === 0 ? (
        <EmptyState icon="🗓" title="No stops scheduled for today." />
      ) : (
        <>
          {todayStops.map((stop, i) => finalized(i) ? null : (
            <StopRow key={stop.id || i} stop={stop} index={i} dateStr={todayStr} distance={distances[stop.email || stop.title]} />
          ))}
          <CompletedRoundsSection count={completed.length}>
            {completed.map((i) => (
              <StopRow key={todayStops[i].id || i} stop={todayStops[i]} index={i} dateStr={todayStr} done distance={distances[todayStops[i].email || todayStops[i].title]} />
            ))}
          </CompletedRoundsSection>
        </>
      )}
    </section>
  )
}

// Quick Access tile grid shared by both dashboards.
export function QuickAccessGrid({ items }) {
  return (
    <section>
      <SectionLabel style={{ marginBottom: 12 }}>Quick Access</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {items.map(({ label, href, desc }) => (
          <Link key={href} href={href} style={{ display: 'block', padding: '15px 17px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', border: '1px solid rgba(var(--green-rgb),0.15)', textDecoration: 'none' }}>
            <div style={{ fontWeight: 'var(--w-head)', fontSize: 'var(--fs-sm)', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{desc}</div>
          </Link>
        ))}
      </div>
    </section>
  )
}
