#!/usr/bin/env node
// One Person Show marketing site generator. `node ops/src/build.js` writes
// ops/*.html + ops/site.css from the page data below. Style system mirrors the
// Astro marketing site (Inter, forest ground, cream text, electric-green
// eyebrows, gold CTA, 1100px container) so the two feel like one company.
const fs = require('fs')
const path = require('path')
const OUT = path.join(__dirname, '..')

const CSS = `
:root{--bg:#1a2e1f;--bg-dark:#0a1a0d;--bg-card:#0d1a10;--bg-panel:#111c13;--accent:#7dffaa;--accent-muted:#3d7a4f;--accent-deep:#2d5a2d;--gold:#c9a84c;--gold-light:#e8d08a;--cream:#d4e6ca;--cream-muted:rgba(212,230,202,.7);--cream-dim:rgba(212,230,202,.45);--line:rgba(125,255,170,.15);--font:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--cream);font-family:var(--font);font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit;transition:color .15s}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.container{max-width:1100px;margin:0 auto;padding:0 20px}
h1,h2,h3{font-weight:800;letter-spacing:-.02em;line-height:1.1;color:#fff}
h1{font-size:clamp(38px,5.4vw,64px)}
h2{font-size:clamp(28px,3.4vw,40px);margin-bottom:14px}
h3{font-size:19px;font-weight:700;margin-bottom:6px}
.eyebrow{font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:700;display:block;margin-bottom:12px}
.lede{font-size:clamp(17px,1.6vw,20px);color:var(--cream-muted);max-width:60ch}
.btn-gold{display:inline-block;background:var(--gold);color:var(--bg-dark);font-weight:800;font-size:.9rem;padding:13px 28px;border-radius:8px;text-decoration:none;transition:transform .15s,background .15s;border:0;cursor:pointer;font-family:inherit}
.btn-gold:hover{background:var(--gold-light);transform:translateY(-2px)}
.btn-outline{display:inline-block;background:transparent;color:var(--accent);font-weight:700;font-size:.9rem;padding:12px 24px;border-radius:8px;text-decoration:none;border:1px solid rgba(125,255,170,.4)}
.btn-outline:hover{border-color:var(--accent);color:#fff}
header.site{position:sticky;top:0;z-index:20;background:rgba(10,26,13,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
header.site .container{display:flex;align-items:center;justify-content:space-between;height:66px;gap:16px}
.brand{font-weight:900;font-size:1.05rem;color:#fff;text-decoration:none;letter-spacing:-.01em;white-space:nowrap}
.brand span{color:var(--accent)}
nav.main{display:flex;gap:22px;font-size:.88rem;font-weight:600}
nav.main a{text-decoration:none;color:var(--cream-muted)}
nav.main a:hover,nav.main a[aria-current]{color:#fff}
nav.main .drop{position:relative}
nav.main .drop>a::after{content:" ▾";font-size:.7em}
nav.main .menu{display:none;position:absolute;top:100%;left:-12px;padding-top:12px;min-width:250px}
nav.main .drop:hover .menu,nav.main .drop:focus-within .menu{display:block}
nav.main .menu div{background:var(--bg-dark);border:1px solid var(--line);border-radius:10px;padding:8px;box-shadow:0 20px 40px -20px #000}
nav.main .menu a{display:block;padding:9px 12px;border-radius:7px;color:var(--cream)}
nav.main .menu a:hover{background:var(--bg-panel)}
nav.main .menu small{display:block;color:var(--cream-dim);font-weight:400;font-size:.78rem}
.menu-toggle{display:none;background:none;border:1px solid var(--line);color:var(--cream);border-radius:8px;padding:8px 10px;font:inherit}
.hero{padding:88px 0 72px;border-bottom:1px solid var(--line);background:radial-gradient(900px 400px at 15% -10%,rgba(125,255,170,.10),transparent 60%)}
.hero .grid{display:grid;grid-template-columns:1.05fr 1fr;gap:56px;align-items:center}
.hero .cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.hero .lede{margin-top:20px}
.hero .note{margin-top:18px;color:var(--cream-dim);font-size:.85rem}
section.block{padding:72px 0;border-bottom:1px solid var(--line)}
section.block.alt{background:var(--bg-dark)}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:28px}
.cards.two{grid-template-columns:repeat(2,1fr)}
.card{background:rgba(13,26,16,.6);border:1px solid var(--line);border-radius:12px;padding:24px;display:block;text-decoration:none;color:inherit;transition:border-color .15s,transform .15s}
a.card:hover{border-color:rgba(125,255,170,.45);transform:translateY(-2px)}
.card p{color:var(--cream-muted);font-size:.95rem}
.card .more{display:inline-block;margin-top:12px;color:var(--accent);font-weight:700;font-size:.85rem}
.steps{list-style:none;counter-reset:s;margin-top:26px;display:grid;gap:14px}
.steps li{display:grid;grid-template-columns:44px 1fr;gap:16px;align-items:start;background:rgba(13,26,16,.6);border:1px solid var(--line);border-radius:12px;padding:18px 20px}
.steps li::before{counter-increment:s;content:counter(s,decimal-leading-zero);font-family:var(--mono);color:var(--accent);font-weight:700;font-size:.95rem;padding-top:2px}
.steps b{display:block;color:#fff;margin-bottom:3px}
.steps span{color:var(--cream-muted);font-size:.95rem}
.split{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:start}
.facts{list-style:none;display:grid;gap:10px;margin-top:22px}
.facts li{display:flex;gap:12px;color:var(--cream-muted);font-size:.95rem}
.facts li::before{content:"✓";color:var(--accent);font-weight:800}
.rules{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:22px}
.rule{border:1px solid var(--line);border-radius:10px;padding:14px 16px;background:var(--bg-panel);font-size:.92rem}
.rule b{color:#fff;display:block;margin-bottom:2px}
.rule span{color:var(--cream-muted)}
.mock{background:var(--bg-dark);border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:0 40px 80px -40px #000}
.mock .bar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line);font-size:.75rem;color:var(--cream-dim)}
.mock .bar i{width:9px;height:9px;border-radius:50%;background:var(--accent-deep);display:inline-block}
.mock .body{padding:18px}
.row{display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid var(--line);font-size:.9rem;gap:12px}
.row:last-child{border-bottom:0}
.row .k{color:var(--cream-muted)}
.row .v{color:#fff;font-weight:600;text-align:right}
.pill{display:inline-block;padding:3px 9px;border-radius:99px;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.pill.ok{background:rgba(125,255,170,.14);color:var(--accent)}
.pill.warn{background:rgba(201,168,76,.16);color:var(--gold-light)}
.pill.dim{background:rgba(212,230,202,.1);color:var(--cream-muted)}
.log{font-family:var(--mono);font-size:.82rem;line-height:1.7}
.log ol{list-style:none}
.log li{display:grid;grid-template-columns:50px 1fr;gap:12px;padding:3px 0;opacity:0;transform:translateY(5px);animation:rise .45s forwards}
.log time{color:var(--accent)}
.log b{color:#fff;font-weight:600}
.log li.owner{color:var(--cream-dim);font-style:italic}
.log li.owner time{color:var(--cream-dim)}
@keyframes rise{to{opacity:1;transform:none}}
.price{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:28px}
.plan{background:rgba(13,26,16,.6);border:1px solid var(--line);border-radius:12px;padding:26px;display:flex;flex-direction:column}
.plan.hot{border-color:var(--gold);box-shadow:0 0 0 1px rgba(201,168,76,.4)}
.plan .n{font-weight:800;color:#fff;font-size:1.05rem}
.plan .amt{font-size:42px;font-weight:900;color:#fff;letter-spacing:-.03em;margin:8px 0 0}
.plan .amt small{font-size:.9rem;font-weight:500;color:var(--cream-muted);letter-spacing:0}
.plan .sub{color:var(--cream-dim);font-size:.85rem;margin:2px 0 16px}
.plan ul{padding-left:18px;color:var(--cream-muted);font-size:.93rem;flex:1}
.plan ul li+li{margin-top:6px}
.plan .btn-gold,.plan .btn-outline{margin-top:22px;text-align:center}
.fine{color:var(--cream-dim);font-size:.85rem;margin-top:18px;max-width:72ch}
.cta-band{padding:72px 0}
.cta-band .box{background:linear-gradient(135deg,rgba(125,255,170,.10),rgba(201,168,76,.08));border:1px solid var(--line);border-radius:16px;padding:44px;display:grid;grid-template-columns:1.1fr 1fr;gap:36px;align-items:center}
form.wl{display:grid;gap:10px}
form.wl input,form.wl select{font:inherit;font-size:.95rem;padding:12px 14px;border-radius:8px;border:1px solid var(--line);background:var(--bg-dark);color:#fff}
form.wl input::placeholder{color:var(--cream-dim)}
#formMsg{font-size:.85rem;color:var(--accent);min-height:20px}
footer.site{padding:40px 0;border-top:1px solid var(--line);color:var(--cream-dim);font-size:.85rem}
footer.site .container{display:flex;justify-content:space-between;flex-wrap:wrap;gap:16px}
footer.site nav{display:flex;gap:16px;flex-wrap:wrap}
footer.site a{color:var(--cream-muted);text-decoration:none}
footer.site a:hover{color:#fff}
.pager{display:flex;justify-content:space-between;gap:12px;margin-top:40px;font-size:.9rem}
.pager a{text-decoration:none;color:var(--accent);font-weight:700}
@media (max-width:900px){
  .hero .grid,.split,.cta-band .box{grid-template-columns:1fr}
  .cards,.cards.two,.price,.rules{grid-template-columns:1fr}
  nav.main{display:none;position:absolute;top:66px;left:0;right:0;background:var(--bg-dark);border-bottom:1px solid var(--line);flex-direction:column;gap:0;padding:8px 20px 16px}
  nav.main.open{display:flex}
  nav.main a{padding:10px 0}
  nav.main .menu{display:block;position:static;padding:0 0 0 12px;min-width:0}
  nav.main .menu div{background:none;border:0;box-shadow:none;padding:0}
  nav.main .drop>a::after{content:""}
  .menu-toggle{display:block}
  .hero{padding:56px 0 48px}
  section.block{padding:52px 0}
  .cta-band .box{padding:28px}
}
@media (prefers-reduced-motion:reduce){.log li{animation:none;opacity:1;transform:none}html{scroll-behavior:auto}}
`

const FEATURES = [
  { slug: 'front-office', nav: 'Front office', title: 'Quote, pay, book', tag: 'Front office',
    h1: 'Customers quote themselves, pay by card, and pick a slot.',
    lede: 'Your website becomes the office. A visitor builds a quote, sees a rental and a purchase path side by side, pays, and books the first visit without emailing you once. The price is computed on the server, so what they paid is always what you meant to charge.',
    steps: [
      ['Build', 'The customer picks a service, quantity and add-ons. The same pricing engine that bills you renders the numbers, live.'],
      ['Compare', 'Rental and purchase options are laid out next to each other with monthly and one-time totals. No PDF, no call.'],
      ['Pay', 'Card checkout for the first month plus any one-time items. One-time invoices only; no surprise subscriptions.'],
      ['Book', 'The confirmation screen offers real open slots inside your service radius and business hours. Booked slots land on your calendar.'],
      ['Follow up', 'An unpaid quote gets a nudge at 48 hours, 7 days and 14 days, then goes cold on its own.'],
    ],
    mock: { title: 'quote / 3 traps, 28-day service', rows: [['System', 'CO₂ trap rental × 3'], ['Monthly', '$399.99'], ['One-time', 'Install $240.00'], ['Tax', 'computed server-side'], ['Status', '<span class="pill ok">Paid · slot booked Thu 10:00</span>']] },
    facts: ['Quote links are signed tokens; a tampered price fails checkout', 'Service radius and earliest-hour rules enforced at booking time', 'Direct-link bookings outside the radius are auto-cancelled with a note', 'Customer portal shows plan, next visit, history and upgrades'],
    rules: [['Earliest appointment', 'Never before 10:00 unless you say so'], ['Saturdays', 'Off by default; shifts to Friday'], ['Service radius', '40 miles from your depot, checked at booking'], ['Billing', 'Invoice per visit; no recurring card charges you did not create']],
  },
  { slug: 'inbox', nav: 'Inbox', title: 'Replies in your voice', tag: 'Inbox',
    h1: 'Every customer email answered in your words, waiting for your tap.',
    lede: 'The inbox agent reads new customer mail, sorts it by urgency, and writes a reply the way you write. It never sends on its own. You open the draft, tap send, or change a line first.',
    steps: [
      ['Read', 'New mail is classified: scheduling, question, complaint, other. Newsletters and receipts are filed, not answered.'],
      ['Draft', 'A reply is written from five sample emails you gave us at setup: your greeting, your length, your sign-off.'],
      ['Offer times', 'If it is a scheduling request, the draft includes two real open slots from your calendar.'],
      ['Alert', 'Genuine customer mail pings your phone and forwards to your tech, so nobody is the bottleneck.'],
      ['Send', 'You tap send in Gmail. Edited drafts teach nothing to anyone but you; there is no training on your mail.'],
    ],
    mock: { title: 'gmail / drafts', rows: [['From', 'jane@…  "Can we move Thursday?"'], ['Class', '<span class="pill warn">Scheduling · medium</span>'], ['Draft', '"Jane, sure thing. Thursday 2:00 or 4:00 open. Which works?"'], ['Action', 'Waiting for you']] },
    facts: ['Drafts only; nothing goes out without a human tap', 'Runs on your Claude subscription, not a per-message API bill', 'Thread history is included so replies make sense', 'Owner alerts by text; customer replies by email'],
    rules: [['Never auto-send', 'Customer-facing mail always waits for you'], ['Voice profile', 'Built from your own emails, editable any time'], ['Channel', 'Email first; text only when there is no email'], ['Brand', 'Always your full company name, never a nickname']],
  },
  { slug: 'day-of', nav: 'Day of service', title: 'Route, remind, invoice', tag: 'Day of',
    h1: 'The truck leaves with a route, the customers are warned, the invoices write themselves.',
    lede: 'At midnight tomorrow’s stops are ordered farthest-first so the day ends near home. Reminders go out by email and, two hours before, by text. When the tech taps Finish, the invoice already exists.',
    steps: [
      ['Route', 'Stops are read from the live calendar, never a cache, ordered farthest-first and emailed to the truck at 7:30.'],
      ['Remind', 'Day-before email. Two-hour text. "On my way" text from the tech’s stop card with one tap.'],
      ['Arrive', 'The stop card shows gate code, pets, access notes and the last visit’s notes. Navigate opens Maps.'],
      ['Finish', 'Signature on the phone, photos checked for a proper install, services ticked. The invoice is generated from the same catalog.'],
      ['Guard', 'A second finish on the same booking cannot bill twice. Thank-you email goes out at 8:00 the next morning with the next visit date.'],
    ],
    mock: { title: 'tech / today', rows: [['07:30', 'Route emailed · 11 stops · home 4:40'], ['12:10', '"On my way" sent · Steiner Ranch'], ['14:32', 'Visit finished · signature + 2 photos'], ['Invoice', '<span class="pill ok">$189.00 sent</span>'], ['Consumables', '6 needed · 9 on hand']] },
    facts: ['Consumables forecast 56 days out from the schedule', 'Photo check flags a bad install before the customer does', 'Owner and tech get different screens; techs never see payroll', 'Works on a phone in the field; installs as an app'],
    rules: [['Live calendar only', 'Today’s stops never come from a cached plan'], ['Far-first', 'Longest drive first, finish near the depot'], ['Two-hour text', 'The one reminder that goes by text'], ['Thank-you', 'Includes what was done and the next service date']],
  },
  { slug: 'money', nav: 'Money', title: 'Books that close themselves', tag: 'Money',
    h1: 'A ledger that fills itself, closes every month, and answers questions in plain English.',
    lede: 'Card payments flow in from Stripe. Bank and card statements come in as CSV. Transactions are categorized automatically, the month closes on the first, and you can ask "what did I spend on fuel in June" and get a number.',
    steps: [
      ['Ingest', 'Stripe charges, refunds and payouts post to the ledger every 15 minutes. Bank CSVs from Amex, Chase, Capital One or generic.'],
      ['Categorize', 'Unmatched rows are categorized by the assistant and the rule it used is saved, so next month is automatic.'],
      ['Brief', 'A 7:00 morning brief: cash position, receivables at risk, churn signals.'],
      ['Close', 'On the first: P&L, receivables aging, sales tax, mileage. Emailed to you as a package.'],
      ['Ask', 'Ask the books in English. The assistant writes a read-only query, runs it, and shows the answer with the SQL.'],
    ],
    mock: { title: 'books / ask', rows: [['You', '"Fuel spend, June?"'], ['Answer', '$412.18 across 9 transactions'], ['Open A/R', '$1,240 · 3 invoices'], ['Month', '<span class="pill ok">June closed · P&L sent</span>'], ['QuickBooks', 'Synced 07:02']] },
    facts: ['Failed cards retried and escalated at 0, 2, 7 and 14 days', 'Expense receipts from the crew, approved by you, booked once', 'QuickBooks Online sync if your accountant wants it', 'Invoice-based billing; no subscription engine to reconcile'],
    rules: [['Money lives in Stripe', 'The ledger mirrors it; it never invents a charge'], ['No double books', 'A reimbursed receipt hits the P&L once'], ['Monthly close', 'First of the month, automatically'], ['Read-only questions', 'The assistant can query, never edit, the ledger']],
  },
  { slug: 'crew', nav: 'Crew', title: 'Payroll without a provider', tag: 'Crew',
    h1: 'Clock in, clock out, and get paid correctly, without a payroll company.',
    lede: 'Techs clock in from their phone. Hours, overtime, withholding, FICA and unemployment are computed in the portal. Quarterly 941s come out pre-filled. Add a second tech the day you hire them.',
    steps: [
      ['Clock', 'Crew clock in and out on their own timesheet. They see only their own hours and rates.'],
      ['Approve', 'You approve time weekly. Every edit is recorded in an append-only audit trail with who and when.'],
      ['Run', 'Payroll computes FLSA overtime on the blended rate, IRS percentage-method withholding, FICA caps, FUTA and state unemployment.'],
      ['Pay', 'Printable pay stubs. Expense reimbursements ride along, non-taxable, once.'],
      ['File', 'Deposit schedule and amounts, quarterly 941 pre-filled as a PDF, 940 worksheet, W-2 boxes. You sign and submit.'],
    ],
    mock: { title: 'payroll / week 34', rows: [['Zeke', '38.5 h · OT 0 · $770.00 gross'], ['Withholding', 'computed · Pub 15-T'], ['Employer taxes', 'FICA · FUTA · TX SUTA'], ['Status', '<span class="pill ok">Approved · run Friday</span>'], ['941 Q3', 'Pre-filled · due Oct 31']] },
    facts: ['Owner-only pages; a tech can never see another person’s pay', 'Tax tables refreshed each January, flagged if stale', 'Retention built in: time cards 2 years, payroll 3 years', 'No per-employee SaaS fee'],
    rules: [['Owner vs crew', 'Roles enforced on every screen and API'], ['Append-only', 'Timesheet history cannot be rewritten'], ['Approve, then pay', 'Only approved hours are payable'], ['Nothing transmitted', 'Deposits and filings stay in your hands']],
  },
  { slug: 'growth', nav: 'Growth', title: 'Follow-ups that never lapse', tag: 'Growth',
    h1: 'Quotes get chased, cards get retried, lapsed customers get a note, reviews get asked for.',
    lede: 'The revenue you lose is usually the follow-up you forgot. Every quote, failed payment and lapsed customer has a schedule now, and a Monday review tells you what moved.',
    steps: [
      ['Quotes', 'Unpaid quotes are nudged at 48 hours, 7 days, 14 days, then marked cold. Paid ones book an install.'],
      ['Payments', 'A failed card is retried and the customer is emailed at day 0, 2, 7 and 14 before service pauses.'],
      ['Reviews', 'After the third visit, a review request with your direct link. Replies to reviews are drafted for you.'],
      ['Win-back', 'Each season, lapsed customers get a short personal note written from their history.'],
      ['Review', 'Monday 9:00: revenue, this week’s visits, open invoices, quote pipeline, new customers, system health, with what to do about each.'],
    ],
    mock: { title: 'monday / review', rows: [['Revenue, 7d', '$4,120'], ['Visits this week', '23'], ['Open invoices', '3 · $610'], ['Quotes', '2 warm · 1 cold'], ['Health', '<span class="pill ok">All crons ran</span>']] },
    facts: ['Google Business Profile posts and review replies drafted in your voice', 'Ad and search analytics in the same dashboard', 'Lead capture from your site straight into the CRM', 'Every follow-up is logged on the customer record'],
    rules: [['48 / 7 / 14', 'Quote follow-up windows, editable'], ['0 / 2 / 7 / 14', 'Failed-payment escalation'], ['One ask', 'Review requests go once, never nag'], ['Monday', 'The weekly review is a habit, not a report']],
  },
]

const DAYLOG = [
  ['00:00', '<b>Route built</b> for tomorrow. 11 stops, farthest first, home by 4:40.'],
  ['06:00', '<b>Billing warning</b> sent to 2 customers with cards expiring.'],
  ['07:00', '<b>Books closed</b> for yesterday. Cash and A/R in your brief.'],
  ['07:30', '<b>Route emailed</b> to the truck. Consumables: 6 needed, 9 on hand.'],
  ['08:00', '<b>3 thank-you emails</b> sent, next service date included.'],
  ['08:04', '<b>Inbox:</b> "Can we move Thursday?" Draft written, two slots offered.'],
  ['08:06', 'owner: tapped send on the draft', true],
  ['09:00', '<b>Quote follow-up:</b> 48h nudge to Miller. 14-day close on Ortiz.'],
  ['10:00', '<b>Failed card</b> retried for Nguyen. Paid.'],
  ['12:10', '<b>Text:</b> "On my way" to Steiner Ranch.'],
  ['14:20', 'owner: took the photos, tapped finish', true],
  ['14:32', '<b>Visit finished.</b> Signature, photos checked, invoice sent. $189.'],
  ['15:05', '<b>Customer chat:</b> "What plan am I on?" Answered from the account.'],
  ['17:00', '<b>Day summary</b> emailed. Revenue $1,240. 0 open issues.'],
]

const esc = (s) => s
function head(title, desc, canonical) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="https://ops.greenguard-usa.com${canonical}">
<meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/site.css">
</head>
<body>`
}
function header(current) {
  const items = FEATURES.map((f) => `<a href="/${f.slug}"${current === f.slug ? ' aria-current="page"' : ''}>${f.title}<small>${f.h1.split('.')[0]}.</small></a>`).join('')
  return `<header class="site"><div class="container">
  <a class="brand" href="/">One <span>Person</span> Show</a>
  <button class="menu-toggle" aria-expanded="false" aria-controls="mainnav" onclick="var n=document.getElementById('mainnav');n.classList.toggle('open');this.setAttribute('aria-expanded',n.classList.contains('open'))">Menu</button>
  <nav class="main" id="mainnav">
    <div class="drop"><a href="/#features"${FEATURES.some((f) => f.slug === current) ? ' aria-current="page"' : ''}>Product</a><div class="menu"><div>${items}</div></div></div>
    <a href="/how-it-works"${current === 'how-it-works' ? ' aria-current="page"' : ''}>How it works</a>
    <a href="/pricing"${current === 'pricing' ? ' aria-current="page"' : ''}>Pricing</a>
    <a href="/#proof">Proof</a>
    <a class="btn-gold" href="/pricing#start" style="padding:10px 18px">Request setup</a>
  </nav>
</div></header>`
}
function footer() {
  return `<footer class="site"><div class="container">
  <div>One Person Show is a product of GreenGuard USA, Austin, TX.<br><a href="mailto:admin@greenguard-usa.com">admin@greenguard-usa.com</a></div>
  <nav>${FEATURES.map((f) => `<a href="/${f.slug}">${f.nav}</a>`).join('')}<a href="/how-it-works">How it works</a><a href="/pricing">Pricing</a></nav>
</div></footer>
</body></html>`
}
function ctaBand() {
  return `<section class="cta-band" id="start"><div class="container"><div class="box">
  <div><span class="eyebrow">First ten operators</span><h2>Austin first. Then everywhere.</h2><p class="lede" style="font-size:1rem">We are onboarding ten pool, lawn, pest and cleaning operators this fall. Setup is done by the people who built it. A human replies within a day.</p></div>
  <form class="wl" id="waitlist">
    <input name="name" placeholder="Your name" required autocomplete="name">
    <input name="email" type="email" placeholder="Email" required autocomplete="email">
    <input name="company" placeholder="Company and trade (e.g. Lakeway Pool Care)" required>
    <select name="size" aria-label="Team size"><option value="solo">Just me</option><option value="crew">Me plus 1 to 3</option><option value="more">More than that</option></select>
    <button class="btn-gold" type="submit">Request setup</button>
    <div id="formMsg" aria-live="polite"></div>
  </form>
</div></div></section>
<script>
(function(){var f=document.getElementById('waitlist'),m=document.getElementById('formMsg');if(!f)return;f.addEventListener('submit',function(e){e.preventDefault();var d=Object.fromEntries(new FormData(f).entries());m.textContent='Sending…';fetch('https://portal.greenguard-usa.com/api/leads/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:d.email,firstName:d.name,source:'ops:'+d.company+' / '+d.size})}).then(function(r){if(!r.ok)throw 0;m.textContent='Got it. A human replies within a day.';f.reset()}).catch(function(){location.href='mailto:admin@greenguard-usa.com?subject='+encodeURIComponent('One Person Show setup: '+d.company)+'&body='+encodeURIComponent(d.name+' / '+d.email+' / '+d.size);m.textContent='Opening your email app instead.'})})})();
</script>`
}
function mock(m) {
  return `<div class="mock"><div class="bar"><i></i><i></i><i></i>&nbsp;${m.title}</div><div class="body">${m.rows.map(([k, v]) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}</div></div>`
}
function daylog() {
  return `<div class="mock"><div class="bar"><i></i><i></i><i></i>&nbsp;today.log · live from the closet</div><div class="body log"><ol>${DAYLOG.map(([t, h, o], i) => `<li${o ? ' class="owner"' : ''} style="animation-delay:${(0.2 + i * 0.16).toFixed(2)}s"><time>${t}</time><span>${h}</span></li>`).join('')}</ol></div></div>`
}

// ── Pages ────────────────────────────────────────────────────────────────────
const pages = {}

pages['index'] = head('One Person Show', 'A company that runs itself, for the person who is the company. Booking, routing, reminders, invoicing, books, payroll and customer chat, run by Claude on a Mac in your closet.', '/') + header('index') + `
<section class="hero"><div class="container"><div class="grid">
  <div><span class="eyebrow">For the person who is the company</span>
    <h1>Your company ran all night. You slept.</h1>
    <p class="lede">One Person Show is the office half of a one-person service business: booking, routing, reminders, invoicing, quotes, books, payroll and customer chat, run by Claude on a Mac in your closet. Flat subscription. No per-message bill. No VA.</p>
    <div class="cta"><a class="btn-gold" href="/pricing#start">Request setup</a><a class="btn-outline" href="#proof">See it running a real company</a></div>
    <p class="note">Built and proven on GreenGuard USA, an 86-customer mosquito control company in Austin, TX.</p></div>
  ${daylog()}
</div></div></section>
<section class="block" id="features"><div class="container"><span class="eyebrow">The product</span><h2>Six jobs you stop doing at night</h2><p class="lede">Each one is a page, because each one is a real system, not a bullet point.</p>
<div class="cards">${FEATURES.map((f) => `<a class="card" href="/${f.slug}"><span class="eyebrow">${f.tag}</span><h3>${f.title}</h3><p>${f.lede.split('. ')[0]}.</p><span class="more">Read how it works →</span></a>`).join('')}</div></div></section>
<section class="block alt" id="how"><div class="container"><div class="split">
  <div><span class="eyebrow">How it works</span><h2>One Mac. Your accounts. A subscription, not a meter.</h2><p class="lede">Most "AI for small business" tools resell tokens. One Person Show runs Claude through the flat subscription you would buy for yourself, on a Mac mini in your house that talks to your portal over an encrypted tunnel. If the Mac is off, the portal keeps taking bookings and payments.</p><p style="margin-top:20px"><a class="btn-outline" href="/how-it-works">The full architecture</a></p></div>
  <ol class="steps"><li><b>Your accounts</b><span>Google Workspace, Stripe, your calendar. Optional HubSpot. Nothing to migrate into.</span></li><li><b>Your portal</b><span>A customer site and an owner/tech app at your own domain, hosted for you.</span></li><li><b>The closet</b><span>A Mac mini running Claude on your subscription, with a daemon that does the work. No API bill.</span></li><li><b>Your rulebook</b><span>Earliest appointment, no-Saturday, service radius, who gets a text. Set once, enforced everywhere.</span></li></ol>
</div></div></section>
<section class="block" id="proof"><div class="container"><span class="eyebrow">Proof</span><h2>It already runs a company</h2>
<div class="cards two"><div class="card"><h3>GreenGuard USA, Austin</h3><p>CO₂ mosquito control, 86 customers on 21 and 28 day cadences, one owner, one tech. Every module on this site was built to run that business first, then generalized. The schedule in the log above is the real one.</p></div>
<div class="card"><h3>Numbers we watch</h3><ul class="facts"><li>Zero metered AI spend since Aug 27, 2026; everything on one subscription</li><li>Customer reply drafts in about 4 seconds, in the owner’s voice</li><li>Quotes, bookings and payments continue when the Mac is offline</li><li>Owner-only payroll, tech-only day view; roles enforced on every route</li></ul></div></div></div></section>
${ctaBand()}` + footer()

FEATURES.forEach((f, i) => {
  const prev = FEATURES[(i + FEATURES.length - 1) % FEATURES.length], next = FEATURES[(i + 1) % FEATURES.length]
  pages[f.slug] = head(`${f.title} · One Person Show`, f.lede.split('. ')[0] + '.', '/' + f.slug) + header(f.slug) + `
<section class="hero"><div class="container"><div class="grid">
  <div><span class="eyebrow">${f.tag}</span><h1>${f.h1}</h1><p class="lede">${f.lede}</p>
  <div class="cta"><a class="btn-gold" href="/pricing#start">Request setup</a><a class="btn-outline" href="/how-it-works">How it runs</a></div></div>
  ${mock(f.mock)}
</div></div></section>
<section class="block"><div class="container"><span class="eyebrow">What happens</span><h2>Step by step</h2><ol class="steps">${f.steps.map(([b, s]) => `<li><b>${b}</b><span>${s}</span></li>`).join('')}</ol></div></section>
<section class="block alt"><div class="container"><div class="split">
  <div><span class="eyebrow">Under the hood</span><h2>What you get</h2><ul class="facts">${f.facts.map((x) => `<li>${x}</li>`).join('')}</ul></div>
  <div><span class="eyebrow">Your rulebook</span><h2>Rules it follows</h2><p class="lede" style="font-size:.95rem">Defaults from a real business. Every one is a setting you can change.</p><div class="rules">${f.rules.map(([b, s]) => `<div class="rule"><b>${b}</b><span>${s}</span></div>`).join('')}</div></div>
</div><div class="pager"><a href="/${prev.slug}">← ${prev.title}</a><a href="/${next.slug}">${next.title} →</a></div></div></section>
${ctaBand()}` + footer()
})

pages['how-it-works'] = head('How it works · One Person Show', 'One Mac, your accounts, a flat Claude subscription. The architecture of a company that runs itself.', '/how-it-works') + header('how-it-works') + `
<section class="hero"><div class="container"><div class="grid">
  <div><span class="eyebrow">How it works</span><h1>One Mac. Your accounts. A subscription, not a meter.</h1><p class="lede">Your customers use a hosted portal. Your Mac does the thinking on a flat Claude subscription. Your data never leaves the Google, Stripe and calendar accounts you already own.</p>
  <div class="cta"><a class="btn-gold" href="/pricing#start">Request setup</a></div></div>
  <div class="mock"><div class="bar"><i></i><i></i><i></i>&nbsp;architecture</div><div class="body"><div class="row"><span class="k">Customers</span><span class="v">your-company.com portal (hosted)</span></div><div class="row"><span class="k">Tunnel</span><span class="v">Encrypted, outbound-only from your Mac</span></div><div class="row"><span class="k">The closet</span><span class="v">Mac mini · Claude on your subscription</span></div><div class="row"><span class="k">Systems of record</span><span class="v">Google Calendar · Stripe · Gmail · CRM</span></div><div class="row"><span class="k">If the Mac is off</span><span class="v"><span class="pill dim">Portal keeps booking and charging</span></span></div></div></div>
</div></div></section>
<section class="block"><div class="container"><span class="eyebrow">The pieces</span><h2>Four layers</h2><ol class="steps">
<li><b>Your accounts</b><span>Google Workspace for mail and calendar, Stripe for money, optional HubSpot as the customer record, optional Cal.com for self-booking. Each stays canonical for its own data: calendar for time, Stripe for money, CRM for configuration.</span></li>
<li><b>Your portal</b><span>A customer site (quote, pay, book, plan, history, chat) and an owner/tech app (today, rounds, calendar, clients, invoices, books, payroll) at your domain, hosted and updated for you.</span></li>
<li><b>The closet</b><span>A Mac mini running the Claude command line on your own subscription. A small daemon answers portal chat with real tools, drafts your email, categorizes your books, checks install photos. No per-token bill; a flat monthly plan you control.</span></li>
<li><b>Your rulebook</b><span>A plain configuration file: earliest appointment, no-Saturday, service radius, routing order, which reminders go by text, quote follow-up windows, recurring cadence. Enforced in booking, routing and the assistant alike.</span></li>
</ol></div></section>
<section class="block alt"><div class="container"><div class="split">
<div><span class="eyebrow">Failure modes</span><h2>What happens when things break</h2><ul class="facts"><li>Mac offline: portal, payments and bookings continue; chat says it will be back; drafts resume when the Mac returns</li><li>Card declined: retried and escalated on a schedule, service paused at day 14, never silently dropped</li><li>Booking outside your radius via a direct link: auto-cancelled with a note to you</li><li>A tool ran but the reply failed: the assistant never re-runs a mutation; it apologizes and flags you</li></ul></div>
<div><span class="eyebrow">Ownership</span><h2>Whose data is it</h2><ul class="facts"><li>Yours. It lives in your Google, Stripe and CRM accounts</li><li>The Claude subscription is on your account; we never proxy a shared key</li><li>Nothing is trained on your mail or customers</li><li>Cancel any month; nothing to export because nothing was moved</li></ul></div>
</div></div></section>
${ctaBand()}` + footer()

pages['pricing'] = head('Pricing · One Person Show', 'Solo $249, Crew $449, Appliance with the Mac included. Setup by the people who built it.', '/pricing') + header('pricing') + `
<section class="hero" style="padding-bottom:40px"><div class="container"><span class="eyebrow">Pricing</span><h1>Less than one day of a bookkeeper a month</h1><p class="lede">Three plans. Every one runs on a flat Claude subscription you own, so the bill does not grow with your inbox.</p></div></section>
<section class="block"><div class="container"><div class="price">
  <div class="plan"><div class="n">Solo</div><div class="amt">$249<small>/mo</small></div><div class="sub">You, alone, running lean</div><ul><li>Customer portal and owner app</li><li>Quote, pay, book</li><li>Email drafts in your voice</li><li>Routing, reminders, invoicing</li><li>Books and monthly close</li></ul><a class="btn-outline" href="#start">Request setup</a></div>
  <div class="plan hot"><div class="n">Crew</div><div class="amt">$449<small>/mo</small></div><div class="sub">You plus up to three in the field</div><ul><li>Everything in Solo</li><li>Tech logins and day view</li><li>Timesheets and payroll, 941 and W-2</li><li>Expense claims and approvals</li><li>Weekly business review every Monday</li></ul><a class="btn-gold" href="#start">Request setup</a></div>
  <div class="plan"><div class="n">Appliance</div><div class="amt">$449<small>/mo + $1,200 once</small></div><div class="sub">Crew, with the closet included</div><ul><li>Everything in Crew</li><li>Mac mini shipped configured</li><li>Tunnel and updates managed by us</li><li>Plug in, done</li></ul><a class="btn-outline" href="#start">Request setup</a></div>
</div>
<p class="fine">All plans: $1,500 white-glove setup (we import your customers, learn your voice, load your catalog and rules). You bring a Claude Max subscription on your own account and pay your own Stripe fees. Cancel any month; your data was always in your accounts.</p></div></section>
<section class="block alt"><div class="container"><span class="eyebrow">Setup</span><h2>What white-glove means</h2><ol class="steps"><li><b>Import</b><span>Your customer list into the CRM, with plan, cadence and access notes.</span></li><li><b>Voice</b><span>Five of your own emails become the voice profile the inbox agent writes in.</span></li><li><b>Catalog and rules</b><span>Your services, prices, bundles and the rulebook, entered with you on a call.</span></li><li><b>Go live</b><span>Domain, portal, Mac, tunnel. A test booking, a test invoice, a test reply. Then we hand you the keys.</span></li></ol></div></section>
${ctaBand()}` + footer()

fs.writeFileSync(path.join(OUT, 'site.css'), CSS.trim() + '\n')
for (const [name, html] of Object.entries(pages)) fs.writeFileSync(path.join(OUT, `${name}.html`), html)
console.log(`built ${Object.keys(pages).length} pages + site.css -> ${OUT}`)
