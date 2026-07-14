import { useState } from 'react'

export default function TankCalendar({ tankCalendar = {}, scheduleByDate = {}, onDayClick = () => {}, today, currentStock = 0, expectedDelivery = 0 }) {
  const [viewDate, setViewDate] = useState(new Date())
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Build running stock forecast from today forward
  const forecastMap = {}
  let runningStock = currentStock
  const todayObj = new Date((today || new Date().toISOString().slice(0, 10)) + 'T12:00:00')
  for (let d = 0; d < 60; d++) {
    const dt = new Date(todayObj.getTime() + d * 86400 * 1000)
    const ds = dt.toLocaleDateString('en-CA')
    const isWed = dt.getDay() === 3
    const dayData = scheduleByDate[ds] || { tanks: 0, appts: 0 }
    if (isWed && d > 0) runningStock += expectedDelivery
    runningStock -= dayData.tanks
    forecastMap[ds] = { tanks: dayData.tanks, appts: dayData.appts, forecast: runningStock }
  }

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ d, dateStr, log: tankCalendar[dateStr] || null, sched: forecastMap[dateStr] || null })
  }

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>‹</button>
        <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>{monthLabel}</span>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 3, marginBottom: 3 }}>
        {dayLabels.map((l) => (
          <div key={l} style={{ textAlign: 'center', fontSize: '0.62rem', fontWeight: 800, color: 'var(--text-dim)', letterSpacing: '0.04em', padding: '4px 0' }}>{l}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 3 }}>
        {cells.map((cell, i) => {
          if (!cell) return <div key={`e${i}`} />
          const { d, dateStr, log, sched } = cell
          const isToday = dateStr === today
          const tanks = sched?.tanks || 0
          const appts = sched?.appts || 0
          const forecast = sched?.forecast
          const hasLog = !!log
          const deficit = forecast != null && tanks > 0 && forecast < 0

          let bg = 'var(--bg-alt)'
          let border = 'var(--border)'
          if (tanks > 0) {
            if (deficit) { bg = 'rgba(var(--danger-rgb),0.10)'; border = 'rgba(var(--danger-rgb),0.35)' }
            else { bg = 'rgba(var(--ok-rgb),0.08)'; border = 'rgba(var(--ok-rgb),0.35)' }
          }
          if (hasLog) { bg = 'rgba(var(--gold-rgb),0.08)'; border = 'var(--border-gold)' }
          if (isToday) border = 'var(--gold)'

          return (
            <div key={dateStr} onClick={() => onDayClick(dateStr, log, tanks)}
              style={{ borderRadius: 6, border: `1px solid ${border}`, background: bg, padding: '6px 3px', cursor: 'pointer', minHeight: 72, minWidth: 0, overflow: 'hidden' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: isToday ? 900 : 600, color: isToday ? 'var(--gold)' : 'var(--text)', marginBottom: 2, textAlign: 'center' }}>{d}</div>
              {tanks > 0 && (
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: deficit ? 'var(--danger)' : 'var(--ok)', textAlign: 'center', lineHeight: 1.15 }}>
                  {tanks}t
                </div>
              )}
              {appts > 0 && (
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.15 }}>{appts}v</div>
              )}
              {hasLog && (
                <div style={{ fontSize: '0.62rem', color: 'var(--gold)', fontWeight: 700, marginTop: 2, textAlign: 'center' }}>✓</div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: '0.68rem', color: 'var(--text-dim)', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: 'rgba(var(--ok-rgb),0.12)', border: '1px solid rgba(var(--ok-rgb),0.35)', display: 'inline-block' }} /> On track</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: 'rgba(var(--danger-rgb),0.12)', border: '1px solid rgba(var(--danger-rgb),0.35)', display: 'inline-block' }} /> Deficit</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: 'rgba(var(--gold-rgb),0.10)', border: '1px solid var(--border-gold)', display: 'inline-block' }} /> Logged</span>
        <span style={{ color: 'var(--text-dim)' }}>t = tanks · v = visits</span>
      </div>
    </div>
  )
}
