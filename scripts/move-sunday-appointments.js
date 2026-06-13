#!/usr/bin/env node
/**
 * Finds all upcoming Sunday appointments and moves each to the
 * most efficient day (Mon–Fri) of that same business week — defined
 * as whichever weekday already has the most appointments.
 *
 * Run: node scripts/move-sunday-appointments.js [--dry-run]
 */

require('dotenv').config({ path: require('path').join(__dirname, '../app/.env') })

const { google } = require('googleapis')

const DRY_RUN = process.argv.includes('--dry-run')
const CALENDAR_ID = process.env.CALENDAR_ID || 'admin@greenguard-usa.com'
const BOOKING_TAG = 'GreenGuard USA'
const TZ = 'America/Chicago'

function getAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return auth
}

function toLocalDate(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
}

function toLocalDay(iso) {
  return new Date(iso).getDay() // 0=Sun in CT
}

// Given a Sunday date string (YYYY-MM-DD), return Mon–Fri of the same business week
function weekdaysFor(sundayStr) {
  const sun = new Date(sundayStr + 'T12:00:00')
  const days = []
  for (let i = 1; i <= 5; i++) {
    const d = new Date(sun)
    d.setDate(sun.getDate() + i)
    days.push(d.toLocaleDateString('en-CA'))
  }
  return days // ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
}

// Shift an ISO datetime string by N days, preserving time
function shiftDays(iso, days) {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

async function main() {
  const cal = google.calendar({ version: 'v3', auth: getAuth() })

  const now = new Date()
  const twoMonthsOut = new Date(now)
  twoMonthsOut.setMonth(twoMonthsOut.getMonth() + 2)

  // Fetch all upcoming events
  const res = await cal.events.list({
    calendarId: CALENDAR_ID,
    timeMin: now.toISOString(),
    timeMax: twoMonthsOut.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 500,
    q: BOOKING_TAG,
  })

  const events = res.data.items || []
  console.log(`Fetched ${events.length} events`)

  // Bucket all events by local date
  const byDate = {}
  for (const ev of events) {
    const iso = ev.start?.dateTime || ev.start?.date
    if (!iso) continue
    const d = toLocalDate(iso)
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(ev)
  }

  // Find Sunday events
  const sundayEvents = events.filter(ev => {
    const iso = ev.start?.dateTime || ev.start?.date
    return iso && toLocalDay(iso) === 0
  })

  if (sundayEvents.length === 0) {
    console.log('No Sunday appointments found. Nothing to move.')
    return
  }

  console.log(`\nFound ${sundayEvents.length} Sunday appointment(s):`)

  for (const ev of sundayEvents) {
    const startIso = ev.start.dateTime
    const endIso = ev.end.dateTime
    const sundayStr = toLocalDate(startIso)
    const weekdays = weekdaysFor(sundayStr) // Mon–Fri of that week

    // Pick the weekday with the most appointments (most efficient route day)
    let bestDay = weekdays[0] // default Mon
    let bestCount = (byDate[bestDay] || []).length
    for (const d of weekdays.slice(1)) {
      const count = (byDate[d] || []).length
      if (count > bestCount) {
        bestCount = count
        bestDay = d
      }
    }

    // Calculate day offset from Sunday to target day
    const sunDate = new Date(sundayStr + 'T12:00:00')
    const targetDate = new Date(bestDay + 'T12:00:00')
    const offsetDays = Math.round((targetDate - sunDate) / 86400000)

    const newStart = shiftDays(startIso, offsetDays)
    const newEnd = shiftDays(endIso, offsetDays)

    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const targetDayName = dayNames[new Date(bestDay + 'T12:00:00').getDay()]

    console.log(`\n  "${ev.summary}"`)
    console.log(`    From: Sun ${sundayStr}  ${startIso.slice(11,16)}`)
    console.log(`    To:   ${targetDayName} ${bestDay}  (${bestCount} existing appts — most loaded weekday)`)

    if (!DRY_RUN) {
      await cal.events.patch({
        calendarId: CALENDAR_ID,
        eventId: ev.id,
        sendUpdates: 'none',
        requestBody: {
          start: { dateTime: newStart, timeZone: 'America/Chicago' },
          end: { dateTime: newEnd, timeZone: 'America/Chicago' },
        },
      })
      console.log(`    Moved.`)

      // Update byDate so subsequent Sundays in the same week account for this move
      if (!byDate[bestDay]) byDate[bestDay] = []
      byDate[bestDay].push(ev)
    } else {
      console.log(`    [dry-run — skipped]`)
    }
  }

  if (DRY_RUN) {
    console.log('\nDry run complete. Run without --dry-run to apply changes.')
  } else {
    console.log('\nDone.')
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
