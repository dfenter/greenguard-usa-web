#!/usr/bin/env node
/**
 * Appointment watcher — Mac-local booking lifecycle notifications.
 *
 * Runs INSIDE the local notify daemon process (local-notify-daemon.js calls
 * start()) so its iMessage sends are covered by the daemon's existing macOS
 * Automation grant, and every send originates from this Mac (Mac-first, per
 * owner). Polls Google Calendar every 5 minutes and:
 *
 *  1. WELCOME TEXT — a property assessment event created since the last poll
 *     gets the customer a text within ~5 minutes of booking. Assessments get
 *     no 48-hour/2-hour reminders (deliberate, see greenguard_agent's
 *     appointment_reminder.py), so this is their only automated touch.
 *
 *  2. RESCHEDULE NOTICE — when an event's start time changes AND the OLD start
 *     was inside the next 48 hours, the customer is notified (they already
 *     received the 48-hour reminder email carrying the stale time). Email
 *     primary; text only when no email is on file (channel policy). Moves made
 *     further out stay silent, matching the existing no-notify rule.
 *
 * State lives in appointment-watcher-state.json next to this file (this Mac is
 * the only sender, so no shared KV claims are needed and the KV request budget
 * is untouched). First run bootstraps state silently — no sends for events
 * that existed before the feature.
 *
 * Manual test:  node scripts/appointment-watcher.js --once [--dry-run]
 * (--dry-run lists what WOULD be sent; touches no state, sends nothing.)
 */
const fs = require('fs')
const path = require('path')

const STATE_PATH = path.join(__dirname, 'appointment-watcher-state.json')
const TZ = process.env.CALENDAR_TIMEZONE || 'America/Chicago'
const POLL_INTERVAL_MS = 5 * 60 * 1000
const LOOKAHEAD_DAYS = 90
// Only welcome events CREATED recently. Events far out drift into the lookahead
// window over time and would otherwise look "new" months after booking.
const WELCOME_MAX_CREATED_AGE_MS = 6 * 60 * 60 * 1000
const RESCHEDULE_WINDOW_MS = 48 * 60 * 60 * 1000
const PRUNE_UNSEEN_MS = 14 * 24 * 60 * 60 * 1000

function fmtDay(iso) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(iso))
}
function fmtTime(iso) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) } catch { return null }
}
function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 1))
}

function isAssessment(summary) {
  return /property assessment/i.test(summary || '')
}

// Rebooking via Cal.com cancels and recreates the event under a NEW id, so
// event-id dedup alone re-welcomes the same customer (Amber Ellis got two,
// Aug 9 + Aug 10). Welcomes are therefore also deduped by phone digits.
const WELCOME_PHONE_DEDUP_MS = 30 * 24 * 60 * 60 * 1000
function phoneKey(phone) {
  const d = String(phone || '').replace(/\D/g, '')
  return d.length > 10 ? d.slice(-10) : d
}

// Render a plain text-message body as a branded email — used when a customer's
// number turns out to be unreachable (Apple-side delivery failure): the text
// is IMPOSSIBLE, so email replaces it (owner-approved swap 2026-08-10; not a
// double-notify).
function textBodyToEmail(subject, textBody) {
  const { emailShell, escapeHtml } = require('../lib/email')
  const paras = String(textBody)
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const link = l.match(/^https?:\/\/\S+$/)
      const inner = link ? `<a href="${escapeHtml(l)}" style="color:#2d6a3f;">${escapeHtml(l)}</a>` : escapeHtml(l)
      return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#33443a;font-family:Arial,sans-serif;">${inner}</p>`
    })
    .join('')
  return { subject, html: emailShell(paras) }
}

// Find a customer's email by phone from upcoming calendar events (yesterday
// through +3 days covers every reminder the daemon can be sending). Used by
// the daemon's failed-text email fallback for queue jobs, which carry only
// phone + body.
async function findEmailByPhone(phone) {
  const gcal = require('../lib/gcal')
  const key = phoneKey(phone)
  if (!key) return null
  const calendar = gcal.getCalendar()
  const now = Date.now()
  const res = await calendar.events.list({
    calendarId: process.env.CALENDAR_ID || 'admin@greenguard-usa.com',
    timeMin: new Date(now - 86400e3).toISOString(),
    timeMax: new Date(now + 3 * 86400e3).toISOString(),
    singleEvents: true,
    maxResults: 250,
    fields: 'items(summary,description,attendees)',
  })
  for (const ev of res.data.items || []) {
    const desc = ev.description || ''
    if (phoneKey(gcal.parsePhoneFromDescription(desc)) === key) {
      return gcal.parseEmailFromDescription(desc) || gcal.parseEmailFromAttendees(ev.attendees) || null
    }
  }
  return null
}

function buildWelcomeText(first, startIso) {
  return (
    `Hi ${first}, this is GreenGuard USA. Thanks for booking your property assessment ` +
    `on ${fmtDay(startIso)} at ${fmtTime(startIso)}. If you have any questions before we come out, ` +
    `or there's anything you'd like us to know about the property, feel free to text this number anytime.`
  )
}

function buildRescheduleEmail(first, service, oldStartIso, newStartIso) {
  const { emailShell, escapeHtml } = require('../lib/email')
  const subject = 'Updated appointment time from GreenGuard USA'
  const body = `
        <p style="margin:0 0 16px;font-size:16px;color:#1a3320;font-family:Arial,sans-serif;">Hi ${escapeHtml(first)},</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#33443a;font-family:Arial,sans-serif;">
          A quick update: your <strong>${escapeHtml(service)}</strong> appointment originally set for
          ${escapeHtml(fmtDay(oldStartIso))} at ${escapeHtml(fmtTime(oldStartIso))} has been moved to:
        </p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">
          <tr>
            <td bgcolor="#f0f4f1" style="border-radius:8px;padding:16px 20px;">
              <p style="margin:0;font-size:17px;font-weight:800;color:#1a3320;font-family:Arial,sans-serif;">${escapeHtml(fmtDay(newStartIso))}</p>
              <p style="margin:4px 0 0;font-size:15px;color:#2d6a3f;font-weight:700;font-family:Arial,sans-serif;">${escapeHtml(fmtTime(newStartIso))}</p>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#33443a;font-family:Arial,sans-serif;">
          If you received a reminder with the old time, please disregard it. If the new time doesn't work
          for you, just reply to this email or text us at 512-560-4129 and we'll find a better slot.
        </p>
        <p style="margin:0;font-size:15px;color:#33443a;font-family:Arial,sans-serif;">Thanks!</p>`
  return { subject, html: emailShell(body) }
}

function buildRescheduleText(first, service, newStartIso) {
  return (
    `Hi ${first}, a quick update from GreenGuard USA: your ${service} appointment has been moved to ` +
    `${fmtDay(newStartIso)} at ${fmtTime(newStartIso)}. If that new time doesn't work for you, ` +
    `just text us here and we'll find a better slot. Thanks!`
  )
}

async function tick(log, { dryRun = false } = {}) {
  const gcal = require('../lib/gcal')
  const { sendEmailDirect } = require('../lib/email')
  const { sendViaIMessage } = require('./imessage')

  const now = Date.now()
  const calendar = gcal.getCalendar()
  const res = await calendar.events.list({
    calendarId: process.env.CALENDAR_ID || 'admin@greenguard-usa.com',
    timeMin: new Date(now).toISOString(),
    timeMax: new Date(now + LOOKAHEAD_DAYS * 86400e3).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 2500,
    fields: 'items(id,summary,start,created,description,attendees)',
  })
  const events = (res.data.items || []).filter((e) => e.start && e.start.dateTime)

  let state = loadState()
  if (!state) {
    // Bootstrap: record everything that already exists, send nothing.
    state = { events: {} }
    for (const ev of events) {
      state.events[ev.id] = { start: ev.start.dateTime, lastSeen: now, welcomed: true }
    }
    if (!dryRun) saveState(state)
    log(`[watcher] bootstrapped state with ${events.length} existing event(s), no sends`)
    return
  }

  for (const ev of events) {
    const known = state.events[ev.id]
    const summary = ev.summary || ''
    const desc = ev.description || ''
    const name = gcal.parseCustomerName(summary) || 'there'
    const first = name.split(/\s+/)[0]
    const service = gcal.parseServiceTitle(summary) || 'service'
    const phone = gcal.parsePhoneFromDescription(desc)
    const email = gcal.parseEmailFromDescription(desc) || gcal.parseEmailFromAttendees(ev.attendees)

    state.welcomedPhones = state.welcomedPhones || {}
    const recentlyWelcomed = () => {
      const t = state.welcomedPhones[phoneKey(phone)]
      return t && now - t < WELCOME_PHONE_DEDUP_MS
    }
    const sendWelcome = async () => {
      // Returns true when the customer was reached (text or email fallback).
      try {
        await sendViaIMessage({ to: phone, body: buildWelcomeText(first, ev.start.dateTime) })
        state.welcomedPhones[phoneKey(phone)] = now
        log(`[watcher] welcome text sent to ${phone} for "${summary}"`)
        return true
      } catch (e) {
        if (/delivery failed/.test(e.message) && email) {
          const { subject, html } = textBodyToEmail('Thanks for booking your assessment', buildWelcomeText(first, ev.start.dateTime))
          await sendEmailDirect({ to: email, subject, html })
          state.welcomedPhones[phoneKey(phone)] = now
          log(`[watcher] welcome text undeliverable to ${phone} — sent by EMAIL to ${email} for "${summary}"`)
          return true
        }
        log(`[watcher] welcome text FAILED to ${phone}: ${e.message} (will retry)`)
        return false
      }
    }

    if (!known) {
      const createdAge = ev.created ? now - Date.parse(ev.created) : Infinity
      let welcomed = true
      if (isAssessment(summary) && createdAge < WELCOME_MAX_CREATED_AGE_MS) {
        if (!phone) {
          log(`[watcher] SKIP welcome for "${summary}" (${ev.id}): no phone in event`)
        } else if (recentlyWelcomed()) {
          // Cal.com reschedules recreate the event under a new id — same
          // customer, not a new booking.
          log(`[watcher] SKIP welcome for "${summary}" (${ev.id}): ${phone} already welcomed recently (rebooked event)`)
        } else if (dryRun) {
          log(`[watcher] DRY would text welcome to ${phone}: ${buildWelcomeText(first, ev.start.dateTime)}`)
        } else {
          welcomed = await sendWelcome()
        }
      }
      state.events[ev.id] = { start: ev.start.dateTime, lastSeen: now, welcomed }
      continue
    }

    // Retry a previously failed welcome while the event is still fresh.
    if (known.welcomed === false) {
      if (isAssessment(summary) && phone && !recentlyWelcomed() && !dryRun) {
        if (await sendWelcome()) known.welcomed = true
      } else {
        known.welcomed = true // nothing sendable; stop retrying
      }
    }

    const oldStartMs = Date.parse(known.start)
    const newStartMs = Date.parse(ev.start.dateTime)
    if (newStartMs !== oldStartMs) {
      const oldStartIso = known.start
      known.start = ev.start.dateTime
      // Notify only when the OLD slot was inside the 48-hour reminder window —
      // the customer is holding a stale reminder. Earlier moves stay silent.
      if (oldStartMs - now < RESCHEDULE_WINDOW_MS) {
        if (dryRun) {
          log(`[watcher] DRY would notify reschedule for "${summary}": ${oldStartIso} -> ${ev.start.dateTime} via ${email ? `email ${email}` : phone ? `text ${phone}` : 'NOBODY (no contact)'}`)
        } else if (email) {
          try {
            const { subject, html } = buildRescheduleEmail(first, service, oldStartIso, ev.start.dateTime)
            await sendEmailDirect({ to: email, subject, html })
            log(`[watcher] reschedule email sent to ${email} for "${summary}" (${fmtDay(oldStartIso)} ${fmtTime(oldStartIso)} -> ${fmtDay(ev.start.dateTime)} ${fmtTime(ev.start.dateTime)})`)
          } catch (e) {
            known.start = oldStartIso // roll back so the next tick retries
            log(`[watcher] reschedule email FAILED to ${email}: ${e.message} (will retry)`)
          }
        } else if (phone) {
          try {
            await sendViaIMessage({ to: phone, body: buildRescheduleText(first, service, ev.start.dateTime) })
            log(`[watcher] reschedule text sent to ${phone} for "${summary}" (no email on file)`)
          } catch (e) {
            known.start = oldStartIso
            log(`[watcher] reschedule text FAILED to ${phone}: ${e.message} (will retry)`)
          }
        } else {
          log(`[watcher] reschedule for "${summary}" inside 48h but no email or phone in event — nobody notified`)
        }
      } else {
        log(`[watcher] "${summary}" moved (old start ${fmtDay(oldStartIso)}, outside 48h) — silent per policy`)
      }
    }

    known.lastSeen = now
  }

  // Prune entries not seen in any listing for a while (past/cancelled events).
  for (const [id, rec] of Object.entries(state.events)) {
    if (now - (rec.lastSeen || 0) > PRUNE_UNSEEN_MS) delete state.events[id]
  }
  if (!dryRun) saveState(state)
}

/**
 * Start the watcher inside the daemon. Errors are contained per tick; the
 * timer is unref'd so it never keeps the daemon process alive on shutdown.
 */
function start(log) {
  const run = () => tick(log, {}).catch((e) => log(`[watcher] tick error: ${e.message}`))
  run()
  const timer = setInterval(run, POLL_INTERVAL_MS)
  if (timer.unref) timer.unref()
  log(`[watcher] appointment watcher started — polling calendar every ${POLL_INTERVAL_MS / 60000} min`)
}

module.exports = { start, tick, findEmailByPhone, textBodyToEmail }

// ── CLI (manual test) ─────────────────────────────────────────────────────────
if (require.main === module) {
  // launchd/CLI runs don't source the shell profile; mirror the daemon's loader.
  function loadEnvFile(p) {
    if (!fs.existsSync(p)) return
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!m) continue
      let val = m[2].trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
      if (process.env[m[1]] === undefined) process.env[m[1]] = val
    }
  }
  loadEnvFile(path.join(__dirname, '..', '.env'))
  loadEnvFile(path.join(__dirname, '..', '.env.local'))
  const dryRun = process.argv.includes('--dry-run')
  tick((...a) => console.log(new Date().toISOString(), ...a), { dryRun })
    .then(() => console.log('done'))
    .catch((e) => { console.error('tick failed:', e); process.exit(1) })
}
