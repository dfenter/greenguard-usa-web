// Pure time helpers for the admin calendar drag-and-drop reschedule
// (pages/admin/calendar.js). Kept out of the page module so they can be
// unit tested.

const TZ = 'America/Chicago'

// Build the UTC instant for a given America/Chicago wall-clock date/time.
// `new Date(dayStr + 'T' + hh + ':' + mm)` parses in the browser's local
// timezone, not CT, so it silently misbooks from any non-CT browser and is
// unsafe across DST transitions. CT only ever runs at UTC-05:00 (CDT) or
// UTC-06:00 (CST), so try both and keep whichever one's CT-rendered
// wall-clock actually matches the requested day/hour/minute.
function ctWallTimeToUTC(dayStr, hour, minute) {
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  for (const offset of ['-05:00', '-06:00']) {
    const candidate = new Date(`${dayStr}T${hh}:${mm}:00${offset}`)
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(candidate)
    const get = (t) => parts.find((p) => p.type === t).value
    const rendered = `${get('year')}-${get('month')}-${get('day')}T${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`
    if (rendered === `${dayStr}T${hh}:${mm}`) return candidate
  }
  // Fallback (should be unreachable for valid CT wall-clock times): CDT.
  return new Date(`${dayStr}T${hh}:${mm}:00-05:00`)
}

// Day-view drop target from the vertical drag distance, in 30-minute steps
// relative to the event's own start. Returns the new start as minutes from
// midnight (snapped to a 30-minute boundary and clamped to the visible grid),
// or null when the drag moved less than half a step (same slot, no move).
// Using the delta instead of the collided slot keeps a 60+ minute event that
// is nudged slightly in its own slot.
function dayViewDropMinutes(startMin, deltaY, pxPerMin, dayStartHour, dayEndHour) {
  const steps = Math.round(deltaY / pxPerMin / 30)
  if (!steps) return null
  const target = Math.round((startMin + steps * 30) / 30) * 30
  return Math.min(Math.max(target, dayStartHour * 60), dayEndHour * 60 - 30)
}

module.exports = { ctWallTimeToUTC, dayViewDropMinutes }
