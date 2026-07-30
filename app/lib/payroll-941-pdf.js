// Fill the official IRS Form 941 (fillable AcroForm PDF) from an aggregate941()
// result. Server-side only (fs). The output stays UNFLATTENED so the owner can
// still correct any box in Preview/Acrobat before signing and mailing.
//
// ANNUAL MAINTENANCE: the IRS revises Form 941 every year (sometimes
// mid-year). lib/forms/f941-<year>.pdf is the vendored official PDF and the
// field map below was verified against that exact revision by rendering a
// sentinel-filled copy (every field filled with its own name) and reading the
// result. When vendoring a new year's form, re-run that check — field names
// are stable IRS-wide (f1_12 = line 1 etc.) but must never be trusted blind.
//
// Verified map (Rev. March 2026):
//   Page 1 header: f1_1 EIN first 2 digits · f1_2 EIN last 7 · f1_3 name ·
//     f1_4 trade name · f1_5 street · f1_6 city · f1_7 state · f1_8 ZIP ·
//     c1_1[0..3] quarter checkboxes
//   Lines: 1=f1_12 · 2=f1_13/14 · 3=f1_15/16 · 4=c1_3 · 5a=f1_17/18×f1_19/20 ·
//     5b=f1_21..24 · 5c=f1_25..28 · 5d=f1_29..32 · 5e=f1_33/34 · 5f=f1_35/36 ·
//     6=f1_37/38 · 7=f1_39/40 · 8=f1_41/42 · 9=f1_43/44 · 10=f1_45/46 ·
//     11=f1_47/48 · 12=f1_49/50 · 13=f1_51/52 · 14=f1_53/54 · 15a=f1_55/56
//   Page 2: c2_1[0] line-12-under-$2,500 · c2_1[1] monthly depositor ·
//     f2_1/2 f2_3/4 f2_5/6 months 1-3 · f2_7/8 quarter total ·
//     c2_4[1] Part-4 "No" · f2_13 print name · f2_14 title · f2_15 phone
const fs = require('fs')
const path = require('path')
const { PDFDocument } = require('pdf-lib')

const FORM_DIR = path.join(process.cwd(), 'lib', 'forms')

const P1 = 'topmostSubform[0].Page1[0]'
const P2 = 'topmostSubform[0].Page2[0]'

function formPathForYear(year) {
  const p = path.join(FORM_DIR, `f941-${year}.pdf`)
  if (!fs.existsSync(p)) {
    throw Object.assign(
      new Error(`No vendored Form 941 for ${year} — download the official f941.pdf from irs.gov into lib/forms/f941-${year}.pdf and verify the field map (see lib/payroll-941-pdf.js).`),
      { status: 400 }
    )
  }
  return p
}

const digitsOnly = (s) => String(s || '').replace(/\D/g, '')

// One 941 money box = a dollars field + a 2-digit cents field. Zeros print as
// "0.00" on computed lines; `blankZero` leaves optional lines empty instead.
function money(form, dollarsField, centsField, cents, { blankZero = false } = {}) {
  const n = Math.round(Number(cents) || 0)
  if (blankZero && n === 0) return
  const neg = n < 0
  const abs = Math.abs(n)
  const dollars = Math.floor(abs / 100)
  form.getTextField(dollarsField).setText(`${neg ? '-' : ''}${dollars.toLocaleString('en-US')}`)
  form.getTextField(centsField).setText(pad2(abs % 100))
}
const pad2 = (n) => String(n).padStart(2, '0')

async function fill941Pdf({ agg, settings = {}, signer = {} }) {
  const bytes = fs.readFileSync(formPathForYear(agg.year))
  const doc = await PDFDocument.load(bytes)
  const form = doc.getForm()
  const text = (name, value, max = 0) => {
    if (value === undefined || value === null || value === '') return
    let v = String(value)
    if (max) v = v.slice(0, max)
    form.getTextField(name).setText(v)
  }

  // ── Header ──
  const ein = digitsOnly(settings.ein)
  if (ein.length === 9) {
    text(`${P1}.Header[0].EntityArea[0].f1_1[0]`, ein.slice(0, 2))
    text(`${P1}.Header[0].EntityArea[0].f1_2[0]`, ein.slice(2))
    text(`${P2}.EIN_Number[0].f1_1[0]`, ein.slice(0, 2))
    text(`${P2}.EIN_Number[0].f1_2[0]`, ein.slice(2))
  }
  text(`${P1}.Header[0].EntityArea[0].f1_3[0]`, settings.legalName)
  text(`${P2}.Name_ReadOrder[0].f1_3[0]`, settings.legalName)
  // settings.address is one line: "7800 Adelaide Drive, Austin, TX 78739"
  const m = String(settings.address || '').match(/^(.*?),\s*([^,]+),\s*([A-Za-z]{2})\.?\s+(\d{5}(?:-\d{4})?)$/)
  if (m) {
    text(`${P1}.Header[0].EntityArea[0].f1_5[0]`, m[1])
    text(`${P1}.Header[0].EntityArea[0].f1_6[0]`, m[2])
    text(`${P1}.Header[0].EntityArea[0].f1_7[0]`, m[3].toUpperCase(), 2)
    text(`${P1}.Header[0].EntityArea[0].f1_8[0]`, m[4])
  } else {
    text(`${P1}.Header[0].EntityArea[0].f1_5[0]`, settings.address)
  }
  form.getCheckBox(`${P1}.Header[0].ReportForQuarter[0].c1_1[${agg.quarter - 1}]`).check()

  // ── Part 1 ──
  text(`${P1}.f1_12[0]`, String(agg.line1))
  money(form, `${P1}.f1_13[0]`, `${P1}.f1_14[0]`, agg.line2)
  money(form, `${P1}.f1_15[0]`, `${P1}.f1_16[0]`, agg.line3)
  if (agg.line5a1 === 0 && agg.line5c1 === 0) form.getCheckBox(`${P1}.c1_3[0]`).check()
  money(form, `${P1}.f1_17[0]`, `${P1}.f1_18[0]`, agg.line5a1, { blankZero: true })
  money(form, `${P1}.f1_19[0]`, `${P1}.f1_20[0]`, agg.line5a2, { blankZero: true })
  // 5b (taxable social security tips) — never used here, left blank
  money(form, `${P1}.f1_25[0]`, `${P1}.f1_26[0]`, agg.line5c1, { blankZero: true })
  money(form, `${P1}.f1_27[0]`, `${P1}.f1_28[0]`, agg.line5c2, { blankZero: true })
  money(form, `${P1}.f1_29[0]`, `${P1}.f1_30[0]`, agg.line5d1, { blankZero: true })
  money(form, `${P1}.f1_31[0]`, `${P1}.f1_32[0]`, agg.line5d2, { blankZero: true })
  money(form, `${P1}.f1_33[0]`, `${P1}.f1_34[0]`, agg.line5e)
  money(form, `${P1}.f1_37[0]`, `${P1}.f1_38[0]`, agg.line6)
  money(form, `${P1}.f1_39[0]`, `${P1}.f1_40[0]`, agg.line7, { blankZero: true })
  money(form, `${P1}.f1_45[0]`, `${P1}.f1_46[0]`, agg.line10)
  money(form, `${P1}.f1_49[0]`, `${P1}.f1_50[0]`, agg.line12)
  money(form, `${P1}.f1_51[0]`, `${P1}.f1_52[0]`, agg.line13)
  money(form, `${P1}.f1_53[0]`, `${P1}.f1_54[0]`, Math.max(0, agg.line12 - agg.line13), { blankZero: true })

  // ── Part 2 (line 16) ──
  if (agg.deMinimis) {
    form.getCheckBox(`${P2}.c2_1[0]`).check()
  } else {
    form.getCheckBox(`${P2}.c2_1[1]`).check()
    money(form, `${P2}.f2_1[0]`, `${P2}.f2_2[0]`, agg.months[0].liabilityCents)
    money(form, `${P2}.f2_3[0]`, `${P2}.f2_4[0]`, agg.months[1].liabilityCents)
    money(form, `${P2}.f2_5[0]`, `${P2}.f2_6[0]`, agg.months[2].liabilityCents)
    money(form, `${P2}.f2_7[0]`, `${P2}.f2_8[0]`, agg.totalLiabilityCents)
  }

  // ── Part 4: no third-party designee ──
  form.getCheckBox(`${P2}.c2_4[1]`).check()

  // ── Part 5: printed name/title; the signature itself stays wet-ink ──
  text(`${P2}.f2_13[0]`, signer.name)
  text(`${P2}.f2_14[0]`, signer.title)
  text(`${P2}.f2_15[0]`, signer.phone)

  form.updateFieldAppearances()
  return Buffer.from(await doc.save())
}

module.exports = { fill941Pdf, formPathForYear }
