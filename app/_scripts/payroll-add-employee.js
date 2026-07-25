#!/usr/bin/env node
// Add (or update) a crew member from the command line — the same thing the
// Crew tab does, for when it's faster to type it than click it.
//
//   node _scripts/payroll-add-employee.js \
//     --name "Jane Doe" --email jane@greenguard-usa.com --rate 20 \
//     [--frequency biweekly] [--contractor] [--salary 52000] [--per-stop 2] \
//     [--mileage 70] [--filing single|married|head] [--exempt] [--hired 2026-07-28]
//
// The email MUST be the address they log into the portal with — that is how a
// timesheet row is attributed to a person. Remember to add it to ADMIN_EMAILS
// in Vercel too, or their magic link lands on the customer dashboard.

require('dotenv').config({ path: '.env' })
const { getEmployeeByEmail, createEmployee, updateEmployee, getSettings } = require('../lib/payroll-store')

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(`--${flag}`)
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}
const has = (flag) => process.argv.includes(`--${flag}`)
const dollars = (v) => Math.round((Number(v) || 0) * 100)

async function main() {
  const name = arg('name')
  const email = arg('email')
  if (!name || !email) {
    console.error('Usage: --name "Full Name" --email person@greenguard-usa.com --rate 20')
    process.exit(1)
  }

  const settings = await getSettings()
  const fields = {
    name,
    email,
    classification: has('contractor') ? 'contractor' : 'employee',
    pay_type: arg('salary') ? 'salary' : 'hourly',
    pay_frequency: arg('frequency', settings.defaultPayFrequency),
    hourly_rate_cents: dollars(arg('rate', 0)),
    salary_annual_cents: dollars(arg('salary', 0)),
    per_stop_cents: dollars(arg('per-stop', 0)),
    mileage_rate_cents: Math.round(Number(arg('mileage', 0)) || 0),
    ot_eligible: !has('no-overtime'),
    exempt: has('exempt'),
    filing_status: arg('filing', 'single'),
    fed_withholding_mode: has('contractor') ? 'none' : 'table',
    hired_on: arg('hired', null),
    active: true,
    notes: arg('notes', null),
  }

  const existing = await getEmployeeByEmail(email)
  const saved = existing
    ? await updateEmployee(existing.id, fields)
    : await createEmployee(fields)

  console.log(`${existing ? 'Updated' : 'Created'} employee #${saved.id}: ${saved.name} <${saved.email}>`)
  console.log(`  ${saved.classification === 'contractor' ? '1099 contractor' : 'W-2 employee'} · ${saved.pay_type} · ${saved.pay_frequency}`)
  if (saved.pay_type === 'hourly') console.log(`  $${(saved.hourly_rate_cents / 100).toFixed(2)}/h · overtime ${saved.ot_eligible && !saved.exempt ? 'eligible' : 'NOT eligible'}`)
  else console.log(`  $${(saved.salary_annual_cents / 100).toFixed(2)}/yr · ${saved.exempt ? 'exempt' : 'non-exempt (earns OT premium)'}`)
  if (saved.mileage_rate_cents) console.log(`  mileage ${saved.mileage_rate_cents}¢/mi`)
  console.log(`\nNext: make sure ${saved.email} is in ADMIN_EMAILS on Vercel, then have them open`)
  console.log('portal.greenguard-usa.com and sign in — they land on /admin/timesheet.')
  process.exit(0)
}

main().catch((e) => { console.error('failed:', e.message); process.exit(1) })
