/* Resend Arun Nair's 3 existing quotes (reuse links — no new quotes minted). */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const { sendEmail, escapeHtml } = require('../lib/email')
const { addNote } = require('../lib/hubspot')

const SEND = process.argv.includes('--send')
const CONTACT_ID = 504025642693
const TO = 'arun@opslab.com'
const NAME = 'Arun Nair'
const BASE = 'https://portal.greenguard-usa.com/quote/'

const TOKENS = {
  '2 traps': 'eyJhbGciOiJIUzI1NiJ9.eyJjdXN0b21lck5hbWUiOiJBcnVuIE5haXIiLCJjdXN0b21lckVtYWlsIjoiYXJ1bkBvcHNsYWIuY29tIiwic2VydmljZUxpbmVzIjpbeyJsYWJlbCI6IkNP4oKCIFRhbmsgRXhjaGFuZ2Ug4oCUIDLDlyAyMGxiIFRhbmtzIChpbmNsdWRlcyBob29rdXAgJiBtYWludGVuYW5jZSkiLCJhbW91bnQiOjE1OS45OSwicmVjdXJyaW5nIjp0cnVlfV0sImFkZG9uTGluZXMiOlt7ImxhYmVsIjoiQmFpdCBQYWNrIMOXMiIsImFtb3VudCI6MjAsInJlY3VycmluZyI6dHJ1ZX1dLCJwcm9kdWN0TGluZXMiOlt7ImxhYmVsIjoiQmlvZ2VudHMgQkctTW9zcXVpdGFpcmUgw5cyIiwiYW1vdW50Ijo1NTkuOTgsInJlY3VycmluZyI6ZmFsc2UsInF0eSI6MiwidW5pdFByaWNlIjoyNzkuOTl9LHsibGFiZWwiOiJDT-KCgiBUYW5rIDIwbGIgKGVtcHR5KSDDlzIiLCJhbW91bnQiOjM5OS45OCwicmVjdXJyaW5nIjpmYWxzZSwicXR5IjoyLCJ1bml0UHJpY2UiOjE5OS45OX0seyJsYWJlbCI6IkJpb2dlbnRzIFRpbWVyIMOXMiIsImFtb3VudCI6MTc5Ljk4LCJyZWN1cnJpbmciOmZhbHNlLCJxdHkiOjIsInVuaXRQcmljZSI6ODkuOTl9XSwidG90YWwiOjEzMTkuOTMsInJlY3VycmluZ1RvdGFsIjoxNzkuOTksIm9uZVRpbWVUb3RhbCI6MTEzOS45NCwidGF4UmF0ZSI6MCwidGF4QW1vdW50IjowLCJzaGlwcGluZ1RvdGFsIjowLCJtYWNoUGlucyI6W10sInR5cGUiOiJxdW90ZSIsImlhdCI6MTc4MjMyMTI1NSwianRpIjoiZTc0NDE1ODlhNDZjYjg5NDkyZDM1ZjgxY2Q2MmI3MGUiLCJleHAiOjE3ODQ5MTMyNTV9.7UgpJdAVq9yNyXY2cZ2GvKSkEKwGE_wHhreC-jMHU5w',
  '3 traps': 'eyJhbGciOiJIUzI1NiJ9.eyJjdXN0b21lck5hbWUiOiJBcnVuIE5haXIiLCJjdXN0b21lckVtYWlsIjoiYXJ1bkBvcHNsYWIuY29tIiwic2VydmljZUxpbmVzIjpbeyJsYWJlbCI6IkNP4oKCIFRhbmsgRXhjaGFuZ2Ug4oCUIDPDlyAyMGxiIFRhbmtzIChpbmNsdWRlcyBob29rdXAgJiBtYWludGVuYW5jZSkiLCJhbW91bnQiOjIxOS45OSwicmVjdXJyaW5nIjp0cnVlfV0sImFkZG9uTGluZXMiOlt7ImxhYmVsIjoiQmFpdCBQYWNrIMOXMyIsImFtb3VudCI6MzAsInJlY3VycmluZyI6dHJ1ZX1dLCJwcm9kdWN0TGluZXMiOlt7ImxhYmVsIjoiQmlvZ2VudHMgQkctTW9zcXVpdGFpcmUgw5czIiwiYW1vdW50Ijo4MzkuOTcsInJlY3VycmluZyI6ZmFsc2UsInF0eSI6MywidW5pdFByaWNlIjoyNzkuOTl9LHsibGFiZWwiOiJDT-KCgiBUYW5rIDIwbGIgKGVtcHR5KSDDlzMiLCJhbW91bnQiOjU5OS45NywicmVjdXJyaW5nIjpmYWxzZSwicXR5IjozLCJ1bml0UHJpY2UiOjE5OS45OX0seyJsYWJlbCI6IkJpb2dlbnRzIFRpbWVyIMOXMyIsImFtb3VudCI6MjY5Ljk3LCJyZWN1cnJpbmciOmZhbHNlLCJxdHkiOjMsInVuaXRQcmljZSI6ODkuOTl9XSwidG90YWwiOjE5NTkuOSwicmVjdXJyaW5nVG90YWwiOjI0OS45OSwib25lVGltZVRvdGFsIjoxNzA5LjkxLCJ0YXhSYXRlIjowLCJ0YXhBbW91bnQiOjAsInNoaXBwaW5nVG90YWwiOjAsIm1hY2hQaW5zIjpbXSwidHlwZSI6InF1b3RlIiwiaWF0IjoxNzgyMzIxMjU0LCJqdGkiOiIyMTJmY2YxNGYxMjUxZGI4YjE5NmUyOTA5OTJkMzU1OSIsImV4cCI6MTc4NDkxMzI1NH0.zZmOM7FP5Q1T9QruXw__7s4gx8HuiU8PPP70HyrE8OY',
  '10 traps': 'eyJhbGciOiJIUzI1NiJ9.eyJjdXN0b21lck5hbWUiOiJBcnVuIE5haXIiLCJjdXN0b21lckVtYWlsIjoiYXJ1bkBvcHNsYWIuY29tIiwic2VydmljZUxpbmVzIjpbeyJsYWJlbCI6IkNP4oKCIFRhbmsgRXhjaGFuZ2Ug4oCUIDEww5cgMjBsYiBUYW5rcyAoaW5jbHVkZXMgaG9va3VwICYgbWFpbnRlbmFuY2UpIiwiYW1vdW50Ijo2MzkuOTIsInJlY3VycmluZyI6dHJ1ZX1dLCJhZGRvbkxpbmVzIjpbeyJsYWJlbCI6IkJhaXQgUGFjayDDlzEwIiwiYW1vdW50IjoxMDAsInJlY3VycmluZyI6dHJ1ZX1dLCJwcm9kdWN0TGluZXMiOlt7ImxhYmVsIjoiQmlvZ2VudHMgQkctTW9zcXVpdGFpcmUgw5cxMCIsImFtb3VudCI6Mjc5OS45LCJyZWN1cnJpbmciOmZhbHNlLCJxdHkiOjEwLCJ1bml0UHJpY2UiOjI3OS45OX0seyJsYWJlbCI6IkNP4oKCIFRhbmsgMjBsYiAoZW1wdHkpIMOXMTAiLCJhbW91bnQiOjE5OTkuOSwicmVjdXJyaW5nIjpmYWxzZSwicXR5IjoxMCwidW5pdFByaWNlIjoxOTkuOTl9LHsibGFiZWwiOiJCaW9nZW50cyBUaW1lciDDlzEwIiwiYW1vdW50Ijo4OTkuOSwicmVjdXJyaW5nIjpmYWxzZSwicXR5IjoxMCwidW5pdFByaWNlIjo4OS45OX1dLCJ0b3RhbCI6NjQzOS42MiwicmVjdXJyaW5nVG90YWwiOjczOS45Miwib25lVGltZVRvdGFsIjo1Njk5LjcsInRheFJhdGUiOjAsInRheEFtb3VudCI6MCwic2hpcHBpbmdUb3RhbCI6MCwibWFjaFBpbnMiOltdLCJ0eXBlIjoicXVvdGUiLCJpYXQiOjE3ODIzMjEyNTMsImp0aSI6ImE0YTdjYjhjMTVlYWI0NzgxZjFmZGJiNDJlNWUyZTJiIiwiZXhwIjoxNzg0OTEzMjUzfQ.bq78eMnStiAt6AH8yu2qOY6KyMhNFmf50KDkTK2bBZI',
}

const fmt$ = (n) => `$${parseFloat(n || 0).toFixed(2)}`
const decode = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString())

function lineRows(lines, color) {
  return lines.filter((l) => (l.amount || 0) > 0).map((l) => `
    <tr><td style="padding:9px 0;border-bottom:1px solid rgba(0,0,0,0.05);color:#444;font-size:0.9rem;">${escapeHtml(l.label)}</td>
    <td style="padding:9px 0;border-bottom:1px solid rgba(0,0,0,0.05);text-align:right;font-weight:700;color:${color};font-size:0.9rem;white-space:nowrap;">${fmt$(l.amount)}</td></tr>`).join('')
}

function buildHtml(p, url, optionLabel) {
  const recurringLines = [...p.serviceLines, ...p.addonLines].filter((l) => l.recurring)
  const oneTimeLines = [...p.serviceLines.filter((l) => !l.recurring), ...p.addonLines.filter((l) => !l.recurring), ...p.productLines]
  const dueToday = p.oneTimeTotal
  const sec = 'margin:0 0 24px;padding:16px 18px;border-radius:10px;'
  const secTitle = (c) => `font-size:0.7rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${c};margin:0 0 10px;`
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f0f4f1;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f4f1"><tr><td align="center" style="padding:32px 16px;">
<table width="580" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;font-family:Arial,sans-serif;">
  <tr><td align="center" bgcolor="#1a3320" style="border-radius:10px 10px 0 0;padding:24px 32px;">
    <p style="margin:0;font-size:20px;font-weight:900;color:#fff;">GreenGuard USA</p>
    <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:#7dbc8a;letter-spacing:2px;text-transform:uppercase;">Austin, TX</p></td></tr>
  <tr><td bgcolor="#ffffff" style="padding:28px 28px 8px;border-left:1px solid #dde8de;border-right:1px solid #dde8de;">
    <h2 style="margin:0 0 4px;font-size:20px;font-weight:900;color:#111f14;">Your Service Quote (${escapeHtml(optionLabel)} option)</h2>
    <p style="margin:0 0 20px;font-size:13px;color:#6b7f6e;">Hi ${escapeHtml(NAME)}, following up on the quote we sent. This link is still valid through July 24, 2026.</p>
    <div style="${sec}background:#f7fbf6;border:1px solid #e3eedb;">
      <div style="${secTitle('#0d8a3c')}">Monthly Recurring</div>
      <table style="width:100%;border-collapse:collapse;">${lineRows(recurringLines, '#0d8a3c')}</table>
      <table role="presentation" style="width:100%;border-top:2px solid #0d8a3c;border-collapse:collapse;font-size:0.9rem;color:#0d8a3c;font-weight:800;"><tr><td style="padding:10px 0 0;text-align:left;">Total per month</td><td style="padding:10px 0 0;text-align:right;">${fmt$(p.recurringTotal)}/mo</td></tr></table>
    </div>
    <div style="${sec}background:#f6f9fb;border:1px solid #dde6ed;">
      <div style="${secTitle('#1565c0')}">One-Time Charges (Due With First Visit)</div>
      <table style="width:100%;border-collapse:collapse;">${lineRows(oneTimeLines, '#1565c0')}</table>
      <table role="presentation" style="width:100%;border-top:2px solid #1565c0;border-collapse:collapse;font-size:0.9rem;color:#1565c0;font-weight:800;"><tr><td style="padding:10px 0 0;text-align:left;">Total due with first visit</td><td style="padding:10px 0 0;text-align:right;">${fmt$(dueToday)}</td></tr></table>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;"><tr><td bgcolor="#1a3320" style="border-radius:8px;padding:16px 20px;">
      <p style="margin:0 0 8px;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#7dbc8a;">Summary</p>
      <table width="100%"><tr><td style="font-size:14px;color:#fff;padding:3px 0;">Due with first visit</td><td align="right" style="font-size:14px;font-weight:800;color:#fff;white-space:nowrap;padding:3px 0;">${fmt$(dueToday)}</td></tr></table>
      <table width="100%"><tr><td style="font-size:14px;color:#a8edc0;padding:3px 0;">Then monthly</td><td align="right" style="font-size:14px;font-weight:800;color:#a8edc0;white-space:nowrap;padding:3px 0;">${fmt$(p.recurringTotal)}/mo</td></tr></table>
    </td></tr></table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;"><tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#c9a84c" style="border-radius:6px;">
        <a href="${url}" style="display:inline-block;padding:16px 40px;font-size:16px;font-weight:800;color:#111800;text-decoration:none;">Review &amp; Approve Quote &rarr;</a>
      </td></tr></table></td></tr></table>
    <p style="margin:0 0 24px;font-size:13px;color:#9aab9c;text-align:center;">Questions? Reply to this email or call <a href="tel:+15125604129" style="color:#2d6a3f;font-weight:700;">512-560-4129</a></p>
  </td></tr>
  <tr><td align="center" bgcolor="#dde8de" style="border-radius:0 0 10px 10px;padding:18px 32px;border:1px solid #dde8de;border-top:0;">
    <p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#1a3320;">GreenGuard USA</p>
    <p style="margin:0;font-size:11px;color:#4a6650;">Austin, TX &#183; 512-560-4129 &#183; <a href="https://www.greenguard-usa.com" style="color:#2d6a3f;">greenguard-usa.com</a></p>
  </td></tr>
</table></td></tr></table></body></html>`
}

;(async () => {
  for (const [optionLabel, token] of Object.entries(TOKENS)) {
    const p = decode(token)
    const url = BASE + token
    const html = buildHtml(p, url, optionLabel)
    const subject = `Your GreenGuard Service Quote — ${NAME} (${optionLabel})`
    console.log(`\n[${optionLabel}] to=${TO} jti=${p.jti} due=${fmt$(p.oneTimeTotal)} mo=${fmt$(p.recurringTotal)} htmlLen=${html.length}`)
    if (!SEND) { console.log('  DRY RUN (no send)'); continue }
    await sendEmail({ to: TO, bcc: ['admin@greenguard-usa.com', 'bruce@greenguard-usa.com'], subject, html })
    await addNote(CONTACT_ID, `[QUOTE-RESENT] jti=${p.jti} email=${TO} option="${optionLabel}" url=${url} resent=${new Date().toISOString()}`)
    console.log('  SENT + logged [QUOTE-RESENT]')
  }
  console.log(SEND ? '\nDone.' : '\nDry run complete. Add --send to send.')
})().catch((e) => { console.error('ERR', e); process.exit(1) })
