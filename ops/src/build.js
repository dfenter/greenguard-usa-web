#!/usr/bin/env node
// One Person Show site generator. `node ops/src/build.js` writes ops/*.html and
// ops/site.css. Editorial, prose-first; palette and type are the Sanctuary
// redesign at new.greenguard-usa.com (paper, ink, forest, sage, brass;
// Fraunces + Inter). Edit content here, never the generated HTML.
const fs = require('fs')
const path = require('path')
const OUT = path.join(__dirname, '..')

const CSS = `
:root{--paper:#FAF7F1;--paper-2:#F2EDE3;--ink:#1E2B23;--ink-2:#14201A;--forest:#2E4A3B;--green:#2E6B46;--sage:#7C9885;--sage-2:#4A6B57;--brass:#B08D4C;--brass-2:#7E612B;--sand:#E5D5B0;--sand-2:#EFE3C6;--rust:#9C3A2E;--rule:rgba(30,43,35,.14);
--serif:Fraunces,Georgia,"Times New Roman",serif;--sans:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:17px;line-height:1.65;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:var(--green);text-decoration-thickness:1px;text-underline-offset:3px}
a:hover{color:var(--forest)}
:focus-visible{outline:2px solid var(--brass);outline-offset:3px}
.wrap{max-width:1080px;margin:0 auto;padding:0 24px}
.measure{max-width:68ch}
h1,h2,h3,.serif{font-family:var(--serif);font-weight:400;letter-spacing:-.005em;color:var(--ink-2)}
h1{font-size:clamp(40px,5.6vw,68px);line-height:1.04;font-variation-settings:"opsz" 144,"SOFT" 30}
h2{font-size:clamp(30px,3.6vw,44px);line-height:1.12;margin:0 0 18px}
h3{font-size:24px;line-height:1.25;margin:34px 0 10px}
em{font-family:var(--serif);font-style:italic;font-size:1.04em}
p{margin:0 0 1.15em}
p.lede{font-size:clamp(19px,1.7vw,22px);line-height:1.5;color:var(--forest)}
.small{font-size:.9rem;color:var(--sage-2)}
.kicker{font-family:var(--sans);font-size:.78rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--brass-2);margin-bottom:14px;display:block}
hr{border:0;border-top:1px solid var(--rule);margin:0}
.btn{display:inline-block;font-family:var(--sans);font-weight:600;font-size:.95rem;padding:13px 24px;border-radius:6px;text-decoration:none;background:var(--forest);color:#fff;border:1px solid var(--forest);transition:background .15s}
.btn:hover{background:var(--ink-2);color:#fff}
.btn.quiet{background:transparent;color:var(--forest)}
.btn.quiet:hover{background:var(--paper-2)}
.btn.brass{background:var(--brass);border-color:var(--brass);color:var(--ink-2)}
.btn.brass:hover{background:var(--brass-2);color:#fff}
/* header */
header.site{border-bottom:1px solid var(--rule);background:var(--paper)}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;height:72px;gap:20px}
.brand{font-family:var(--serif);font-size:1.35rem;color:var(--ink-2);text-decoration:none;white-space:nowrap}
.brand i{font-style:italic;color:var(--green)}
nav.main{display:flex;gap:26px;font-size:.92rem;font-weight:500;align-items:center}
nav.main a{text-decoration:none;color:var(--ink)}
nav.main a:hover{color:var(--green)}
nav.main a[aria-current]{color:var(--green);border-bottom:1px solid var(--green)}
nav.main .drop{position:relative}
nav.main .menu{display:none;position:absolute;top:100%;left:-16px;padding-top:14px;min-width:300px;z-index:30}
nav.main .drop:hover .menu,nav.main .drop:focus-within .menu{display:block}
nav.main .menu>div{background:var(--paper);border:1px solid var(--rule);border-radius:8px;padding:10px;box-shadow:0 24px 48px -24px rgba(20,32,26,.35)}
nav.main .menu a{display:block;padding:9px 12px;border-radius:6px;border:0!important}
nav.main .menu a:hover{background:var(--paper-2)}
nav.main .menu small{display:block;color:var(--sage-2);font-weight:400;font-size:.8rem}
.menu-toggle{display:none;background:none;border:1px solid var(--rule);color:var(--ink);border-radius:6px;padding:8px 12px;font:inherit;font-size:.9rem}
/* sections */
.hero{padding:84px 0 64px}
.hero h1{max-width:18ch}
.hero .lede{margin-top:26px;max-width:58ch}
.hero .actions{margin-top:30px;display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.hero .actions .small{margin-left:6px}
section.prose{padding:64px 0}
section.prose.tint{background:var(--paper-2)}
section.prose .wrap{display:grid;grid-template-columns:260px minmax(0,1fr);gap:56px;align-items:start}
section.prose .side{position:sticky;top:24px}
section.prose .side h2{font-size:clamp(26px,2.6vw,34px)}
section.prose .side p{color:var(--sage-2);font-size:.95rem}
section.prose .body{max-width:66ch}
section.prose.full .wrap{grid-template-columns:1fr}
section.prose.full .body{max-width:none}
/* the diary (home signature) */
.diary{max-width:66ch}
.diary p{margin:0 0 1.1em}
.diary time{font-family:var(--serif);font-style:italic;color:var(--brass-2);margin-right:.5em}
.diary p.you{color:var(--sage-2);padding-left:1.4em;border-left:2px solid var(--sand)}
/* index of everything */
.index{columns:2;column-gap:56px}
.index section{break-inside:avoid;margin-bottom:34px}
.index h3{margin:0 0 8px;font-size:22px}
.index p{font-size:.97rem;color:var(--ink);margin:0 0 .5em}
.index p b{font-weight:600;color:var(--ink-2)}
/* aside figure */
figure.aside{margin:34px 0;border:1px solid var(--rule);background:#fff;border-radius:8px;padding:22px 24px;max-width:66ch}
figure.aside figcaption{font-family:var(--sans);font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;color:var(--sage-2);margin-bottom:12px}
figure.aside dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 18px;font-size:.95rem}
figure.aside dt{color:var(--sage-2)}
figure.aside dd{color:var(--ink-2);font-weight:500}
/* pricing as prose table */
table.plans{width:100%;border-collapse:collapse;margin:26px 0 12px;font-size:.98rem}
table.plans th{text-align:left;font-family:var(--serif);font-weight:400;font-size:1.35rem;padding:14px 12px 10px;border-bottom:1px solid var(--ink-2);vertical-align:bottom}
table.plans th small{display:block;font-family:var(--sans);font-size:.85rem;color:var(--sage-2);font-weight:400;margin-top:4px}
table.plans td{padding:12px;border-bottom:1px solid var(--rule);vertical-align:top}
table.plans td:first-child{color:var(--sage-2);width:26%}
table.plans .price{font-family:var(--serif);font-size:2rem;color:var(--ink-2)}
table.plans .price small{font-family:var(--sans);font-size:.85rem;color:var(--sage-2)}
/* form */
.ask{padding:72px 0;background:var(--forest);color:#fff}
.ask h2{color:#fff}
.ask .wrap{display:grid;grid-template-columns:1.1fr 1fr;gap:56px;align-items:center}
.ask p{color:rgba(255,255,255,.82)}
form.wl{display:grid;gap:10px}
form.wl input,form.wl select{font:inherit;font-size:.95rem;padding:12px 14px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff}
form.wl input::placeholder{color:rgba(255,255,255,.55)}
form.wl select option{color:var(--ink)}
#formMsg{font-size:.9rem;color:var(--sand);min-height:22px}
.pager{display:flex;justify-content:space-between;gap:12px;padding:26px 0 0;font-family:var(--serif);font-size:1.05rem}
footer.site{padding:44px 0;border-top:1px solid var(--rule);color:var(--sage-2);font-size:.9rem}
footer.site .wrap{display:flex;justify-content:space-between;flex-wrap:wrap;gap:20px}
footer.site nav{display:flex;gap:18px;flex-wrap:wrap}
footer.site a{color:var(--sage-2);text-decoration:none}
footer.site a:hover{color:var(--ink)}
@media (max-width:900px){
  section.prose .wrap{grid-template-columns:1fr;gap:20px}
  section.prose .side{position:static}
  .index{columns:1}
  .ask .wrap{grid-template-columns:1fr}
  nav.main{display:none;position:absolute;top:72px;left:0;right:0;background:var(--paper);border-bottom:1px solid var(--rule);flex-direction:column;align-items:flex-start;gap:0;padding:6px 24px 16px;z-index:40}
  nav.main.open{display:flex}
  nav.main a{padding:10px 0;border:0!important}
  nav.main .menu{display:block;position:static;padding:0 0 0 14px;min-width:0}
  nav.main .menu>div{background:none;border:0;box-shadow:none;padding:0}
  .menu-toggle{display:block}
  header.site{position:relative}
  .hero{padding:52px 0 40px}
  section.prose{padding:48px 0}
  table.plans{font-size:.9rem}
}
`

// ── Content ─────────────────────────────────────────────────────────────────
const NAV = [
  ['customer-portal', 'Customer portal', 'What your customers see'],
  ['office', 'The office', 'Owner and field app'],
  ['inbox', 'Inbox', 'Email in your voice'],
  ['day-of', 'Day of service', 'Route, remind, invoice'],
  ['money', 'Money', 'Books, billing, collections'],
  ['crew', 'Crew', 'Time and payroll'],
  ['growth', 'Growth', 'Follow-ups and marketing'],
  ['everything', 'Everything it does', 'The complete list'],
]

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
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/site.css">
</head>
<body>`
}
function header(current) {
  const items = NAV.map(([s, t, d]) => `<a href="/${s}"${current === s ? ' aria-current="page"' : ''}>${t}<small>${d}</small></a>`).join('')
  return `<header class="site"><div class="wrap">
  <a class="brand" href="/">One <i>Person</i> Show</a>
  <button class="menu-toggle" aria-expanded="false" aria-controls="mainnav" onclick="var n=document.getElementById('mainnav');n.classList.toggle('open');this.setAttribute('aria-expanded',n.classList.contains('open'))">Menu</button>
  <nav class="main" id="mainnav">
    <div class="drop"><a href="/everything"${NAV.some(([s]) => s === current) ? ' aria-current="page"' : ''}>What it does</a><div class="menu"><div>${items}</div></div></div>
    <a href="/how-it-works"${current === 'how-it-works' ? ' aria-current="page"' : ''}>How it works</a>
    <a href="/pricing"${current === 'pricing' ? ' aria-current="page"' : ''}>Pricing</a>
    <a class="btn brass" href="/pricing#start" style="padding:10px 18px">Talk to us</a>
  </nav>
</div></header>`
}
function footer() {
  return `<footer class="site"><div class="wrap">
  <div>One Person Show is made in Austin, Texas, by the people who run a service company on it.<br><a href="mailto:admin@greenguard-usa.com">admin@greenguard-usa.com</a></div>
  <nav>${NAV.map(([s, t]) => `<a href="/${s}">${t}</a>`).join('')}<a href="/how-it-works">How it works</a><a href="/pricing">Pricing</a></nav>
</div></footer>
</body></html>`
}
function ask() {
  return `<section class="ask" id="start"><div class="wrap">
  <div><h2>We are setting up ten operators this fall.</h2><p>Pool, lawn, pest, cleaning, detailing: any trade that visits the same customers on a cadence. Setup is done by the two people who built this and run a company on it. Write a line about your business and a person answers within a day.</p></div>
  <form class="wl" id="waitlist">
    <input name="name" placeholder="Your name" required autocomplete="name">
    <input name="email" type="email" placeholder="Email" required autocomplete="email">
    <input name="company" placeholder="Company and trade" required>
    <select name="size" aria-label="Team size"><option value="solo">Just me</option><option value="crew">Me plus one to three</option><option value="more">More than that</option></select>
    <button class="btn brass" type="submit">Send</button>
    <div id="formMsg" aria-live="polite"></div>
  </form>
</div></section>
<script>
(function(){var f=document.getElementById('waitlist'),m=document.getElementById('formMsg');if(!f)return;f.addEventListener('submit',function(e){e.preventDefault();var d=Object.fromEntries(new FormData(f).entries());m.textContent='Sending…';fetch('https://portal.greenguard-usa.com/api/leads/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:d.email,firstName:d.name,source:'ops:'+d.company+' / '+d.size})}).then(function(r){if(!r.ok)throw 0;m.textContent='Sent. A person replies within a day.';f.reset()}).catch(function(){location.href='mailto:admin@greenguard-usa.com?subject='+encodeURIComponent('One Person Show: '+d.company)+'&body='+encodeURIComponent(d.name+' / '+d.email+' / '+d.size);m.textContent='Opening your email app instead.'})})})();
</script>`
}
// A prose section: sticky title on the left, running text on the right.
function prose({ kicker, title, side, body, tint, full, id }) {
  return `<section class="prose${tint ? ' tint' : ''}${full ? ' full' : ''}"${id ? ` id="${id}"` : ''}><div class="wrap">
  ${full ? '' : `<div class="side">${kicker ? `<span class="kicker">${kicker}</span>` : ''}<h2>${title}</h2>${side ? `<p>${side}</p>` : ''}</div>`}
  <div class="body">${full ? `<h2>${title}</h2>` : ''}${body}</div>
</div></section>`
}
function aside(caption, rows) {
  return `<figure class="aside"><figcaption>${caption}</figcaption><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></figure>`
}
function pager(slug) {
  const i = NAV.findIndex(([s]) => s === slug)
  if (i < 0) return ''
  const p = NAV[(i + NAV.length - 1) % NAV.length], n = NAV[(i + 1) % NAV.length]
  return `<div class="wrap"><hr><div class="pager"><a href="/${p[0]}">← ${p[1]}</a><a href="/${n[0]}">${n[1]} →</a></div></div>`
}
function featurePage(slug, title, desc, heroTitle, lede, sections) {
  return head(`${title} · One Person Show`, desc, `/${slug}`) + header(slug) + `
<section class="hero"><div class="wrap"><span class="kicker">${title}</span><h1>${heroTitle}</h1><p class="lede">${lede}</p></div></section><hr>
${sections.map((s) => prose(s)).join('')}
${pager(slug)}
${ask()}` + footer()
}

const pages = {}

// ── Home ────────────────────────────────────────────────────────────────────
pages.index = head('One Person Show', 'A company that runs itself, for the person who is the company. Scheduling, quotes, invoicing, books, payroll and an assistant, for any service business that visits customers.', '/') + header('index') + `
<section class="hero"><div class="wrap">
  <h1>The business kept working. <em>You went home at four.</em></h1>
  <p class="lede">One Person Show is the office half of a one-person service company. It books, routes, reminds, invoices, collects, keeps the books, runs payroll and answers the phone, the email and the chat, so the person who does the work does not also have to do the paperwork at eleven at night.</p>
  <div class="actions"><a class="btn" href="/everything">See everything it does</a><a class="btn quiet" href="/how-it-works">How it works</a><span class="small">Runs a real service company in Austin: 86 customers, one owner, one field employee.</span></div>
</div></section><hr>
${prose({ kicker: 'A Tuesday', title: 'What a day looks like when the office is somebody else\'s problem.', side: 'This is the real schedule from the company we run on it. Names changed, times not.', body: `<div class="diary">
<p><time>Midnight.</time> Tomorrow's eleven stops are read off the calendar and put in order, farthest from the shop first so the last one is close to home. The route goes to the vehicle's inbox with the access notes and what was done last time.</p>
<p><time>Six.</time> Two customers whose cards expire this month get a short note asking them to update it before Friday's invoice. Nobody is surprised on Friday.</p>
<p><time>Seven.</time> Yesterday's books close. Cash position, what is owed and how old it is, and the two customers who have gone quiet are in a five-line email you can read at a stoplight.</p>
<p><time>Eight.</time> Three thank-you emails go out for yesterday's visits, each with what was done and the date of the next one. A customer writes, "Can we move Thursday?" A reply is drafted in your words with two real open times.</p>
<p class="you">You read it at the first stop, change nothing, tap send.</p>
<p><time>Nine.</time> A quote that has sat for two days gets a nudge. A quote that has sat for two weeks is marked cold and stops nudging. A failed card from last week is tried again and goes through.</p>
<p><time>Noon.</time> "On my way" goes to the next customer from the stop card, two hours before the appointment, by text, because that is the one message people actually want as a text.</p>
<p class="you">Two thirty. You finish the visit, get the signature on the phone, take the two photos. The quality check passes. The invoice already exists; it goes out when you tap Finish.</p>
<p><time>Three.</time> A customer asks the chat on their portal what plan they are on. It answers from their account and offers to move their next visit. It cannot cancel anything or move money; it can only ask you.</p>
<p><time>Five.</time> A day summary: what came in, what went out, what needs you. Today, nothing needs you.</p>
</div>` })}
${prose({ kicker: 'Why it exists', title: 'We built it because we were the one person.', tint: true, body: `<p>We run a recurring-service company in Austin with one owner and one field employee. Every customer is visited on a twenty-one or twenty-eight day cadence, so the whole business is a scheduling problem wearing a trade as a costume. For two years the office was done at night: quotes in a spreadsheet, invoices typed into Stripe, reminders sent by hand, the books reconciled on Sundays.</p>
<p>The software on this site is what replaced that. It was not designed as a product first. Each piece was built the week it hurt, run on real customers, and kept only if it held up. The customer portal came first, because people wanted to know when we were coming. The quote-and-pay flow came when we lost a job to a slow PDF. The inbox agent came when replies were taking two days. Payroll came the week we hired. It has since been set up for a lawn company and a pool company, and the trade turned out to be the easy part to change: a catalog, a rulebook, and five sample emails.</p>
<p>What makes it different from the field-service apps you have seen is where the thinking happens. The assistant that drafts your email, checks your job photos, categorizes your bank statement and answers your customers runs on a Mac in your own house, on the same flat Claude subscription you would buy for yourself. There is no per-message meter and no one between you and your data, which stays in the Google, Stripe and calendar accounts you already own.</p>
<p>It is now a product because three other operators asked for it. The pages under <a href="/everything">What it does</a> describe each part honestly, including what it will not do.</p>` })}
${ask()}` + footer()

// ── Customer portal ──────────────────────────────────────────────────────────
pages['customer-portal'] = featurePage('customer-portal', 'Customer portal', 'What your customers see: their plan, next visit, history, invoices, upgrades and a chat that answers from their account.',
  'Your customers get a place to look, so they stop calling to ask.',
  'Every customer has a page at your domain. It shows what they are paying for, when you are coming next, what you did last time and what it cost. Most of the questions you answer by phone today are answered there, and the rest go to a chat that knows their account.',
  [
    { kicker: 'Signing in', title: 'No passwords to forget.', body: `<p>A customer types their email and gets a link. Tapping it signs them in for ninety days on that phone. There is a six-digit code for the people whose mail app opens links strangely, and the session survives being added to the home screen as an app, which is how most of ours use it. Somebody who has quoted but not paid lands on a page that shows them what they were quoted; a paying customer lands on their account.</p>` },
    { kicker: 'The account page', title: 'Plan, next visit, and the thing you installed.', body: `<p>The first thing on the page is the plan in plain words: what service they have, what equipment or materials are on the property, how often you come, what it costs a month. Under that is the next appointment, then a picture of what they actually have, because people forget what they bought. If you use a CRM, the plan is read from the customer record there; if not, from the billing account.</p>
${aside('A customer\'s account page', [['Plan', 'Standard service, every 28 days'], ['Next visit', 'Thursday, September 4, morning'], ['Monthly', '$189.00, invoiced after each visit'], ['Last visit', 'August 7: full service, consumables replaced'], ['Something wrong?', 'Chat, or request a visit']])}
<p>History is a list of paid invoices with the visit notes your field employee wrote that day, and a link to the invoice itself. A map shows where your equipment or work is on their property, drawn from the job photos, so anyone can find it without a phone call.</p>` },
    { kicker: 'What they can change', title: 'Contact details, add-ons, a visit.', tint: true, body: `<p>Customers can change their phone, email and address themselves, and the change lands in your CRM and billing at once, so you never have two versions. They can ask for an extra visit, ask to move the next one, or ask for an upgrade: a bigger plan, an add-on service, a piece of equipment. Each of those is a request, not an order. It goes to you with the pricing already worked out from your catalog, and you approve it in the office app. Nothing on the customer side can charge a card or move an appointment without you.</p>
<p>Billing is handled by a link to their card portal, where they update the card, download receipts, and see every invoice. You never handle card numbers; neither do we.</p>` },
    { kicker: 'The chat', title: 'It answers from their account, and it knows what it is not allowed to do.', body: `<p>The chat in the corner is the same assistant that runs your office, restricted to this one customer. It can tell them their plan, their next visit, what an invoice was for, what a service costs. It can request a visit or a reschedule on their behalf, and it can escalate to you with a summary when it should not answer. It cannot cancel, refund, book, or see any other customer. When the Mac at your house is off, it says it will be back shortly and the rest of the portal keeps working.</p>
<p>Every conversation is logged on the customer record with the actions taken, so when you open the account the next morning you can see what was asked and what was promised.</p>` },
  ])

// ── The office ───────────────────────────────────────────────────────────────
pages.office = featurePage('office', 'The office', 'The owner and field app: today, calendar, clients, quotes, invoices, inventory, reports and health, on a phone.',
  'One app for the owner, a smaller one for the field.',
  'The office is where you run the company. The owner sees everything. A field employee sees today, their own hours, and the customers in front of them, and nothing about money or other people. Both run on a phone and install like an app.',
  [
    { kicker: 'Today', title: 'The morning page.', body: `<p>The owner's first screen is today: the stops in route order, how many consumables the day needs against what is in the vehicle, invoices still open, customers who are due but not booked, and a map of every customer colored by whether they are active. Each stop is a card with navigate, "on my way", notes and finish. The field version drops the money and adds a scratchpad for things to tell the owner.</p>
${aside('Owner, 7:40 a.m.', [['Stops', '11, farthest first, home 4:40'], ['Consumables', '6 needed, 9 on hand'], ['Open invoices', '3, oldest 9 days'], ['Due, unbooked', '2 customers'], ['Needs you', 'One upgrade request to approve']])}` },
    { kicker: 'Rounds', title: 'Finishing a visit.', tint: true, body: `<p>Rounds is the page your field person uses at the curb. It reads the calendar live, never a saved plan, because the one time we trusted a cached route we missed a customer who had booked that morning. They tick what was done from your catalog, add products used, capture a signature on the screen, and take photos. The photos are checked by the assistant against what the job should look like before the visit can be closed, which catches a missed step before the customer does. Finish generates the invoice from the same catalog, with the same bundle pricing your quotes use, and a booking that has already been invoiced cannot be invoiced again.</p>
<p>A post-visit email is drafted at the same time. You can send it as is, edit it, or let the morning job send it at eight with the next service date.</p>` },
    { kicker: 'Calendar and clients', title: 'The customer as one record.', body: `<p>The calendar shows the day or the week with a slide-out for any appointment: the customer's configuration, access notes, the notes from every past visit, and the notes on this one. You can book, move or cancel from there; by default no notification goes out on admin changes, because customers do not want a calendar invite every time you tidy the route. Clients is the same record from the other direction: one page per customer with their plan, billing, appointments, notes, and the chat and email history, gathered from your CRM, Stripe and calendar, which each keep owning their piece.</p>
<p>Quotes, invoices, inventory, reports, analytics, and a health page that pings every service you depend on are all one tap from the top of the app. <a href="/everything">The full list</a> names each page.</p>` },
  ])

// ── Inbox ────────────────────────────────────────────────────────────────────
pages.inbox = featurePage('inbox', 'Inbox', 'Customer email read, sorted and answered in your voice, waiting for your tap. It never sends on its own.',
  'Every customer email answered in your words, waiting for your tap.',
  'The inbox agent reads your customer mail, sorts it by what it is and how urgent, and writes the reply you would have written. It does not send. You open Gmail, read the draft, and tap send, or change a line first.',
  [
    { kicker: 'How it reads', title: 'Scheduling, question, complaint, or noise.', body: `<p>New mail is classified before anything else. A newsletter or a receipt is filed and never answered. A genuine customer email is sorted as a scheduling request, a question, a complaint, or something else, and given an urgency. Complaints and anything mentioning safety are marked high and pinged to your phone, and forwarded to your field employee, so nobody is the bottleneck when a customer is upset.</p>` },
    { kicker: 'How it writes', title: 'Your voice, from your own emails.', tint: true, body: `<p>At setup you give us five emails you have sent. The agent learns your greeting, your length, how you say no, how you sign off, and writes every draft that way. If it is a scheduling request, the draft includes two actual open times from your calendar, inside your hours and your rules. If a customer has written before, the thread is included so the reply makes sense. If it needs information it does not have, the draft says so instead of guessing.</p>
${aside('A draft, waiting', [['From', 'Jane R. · "Can we move Thursday?"'], ['Sorted', 'Scheduling, medium'], ['Draft', '"Jane, sure thing. Thursday 2:00 or 4:00 both open. Which works?"'], ['Sent', 'Not yet. Waiting for you.']])}` },
    { kicker: 'What it will not do', title: 'It never sends a customer anything by itself.', body: `<p>This is the rule we would not compromise on. Customer-facing email always waits for a person. The agent creates drafts, labels threads, and alerts you; sending is yours. It runs on your Claude subscription on the Mac at your house, with a daily spending guard that is now zero because there is no meter to run up. Nothing is trained on your mail, and the drafts you edit teach the model nothing; your voice profile is a file you can read and change.</p>
<p>Reminders, thank-you notes, quote follow-ups and billing warnings are different: those are template emails you approved once, sent on a schedule. The agent is for the mail that needs a human answer.</p>` },
  ])

// ── Day of ───────────────────────────────────────────────────────────────────
pages['day-of'] = featurePage('day-of', 'Day of service', 'Routing, reminders, on-my-way texts, visit completion and invoicing, from the calendar to the vehicle to the customer.',
  'The vehicle leaves with a route, the customers are warned, the invoices write themselves.',
  'Day of service is the part of the office that has to be right every single day. Stops are ordered overnight, customers are reminded on the schedule people actually appreciate, and finishing a visit produces an invoice without anyone typing.',
  [
    { kicker: 'Routing', title: 'Farthest first, home last.', body: `<p>At midnight tomorrow's stops are read from the calendar and ordered so the longest drive comes first and the day ends near your base, which is the order that wastes the least fuel and gets you home earliest. The route is emailed to the field at 7:30 with access notes and last-visit notes, and shown on the field today page. A weekly optimizer suggests which days each customer should fall on; the daily route is always built from the live calendar, never from that plan, so a booking made this morning is never missed.</p>
<p>New bookings are placed with the route in mind: the slot suggestions a customer sees favor days you are already nearby, and any address outside your service radius is refused at booking and, as a backstop, automatically cancelled with a note to you if someone gets around the form.</p>` },
    { kicker: 'Reminders', title: 'Email the day before, a text two hours out.', tint: true, body: `<p>Customers get an email the day before with the window and what you will do. Two hours before, they get a text. That is the only reminder that goes by text, because it is the only one people want that way; everything else is email. From the stop card your field person can send "on my way" with one tap, and the customer can reply. Cancellations and reschedules you make in the office send nothing unless you ask, and the customer is never asked to confirm a calendar invite.</p>` },
    { kicker: 'Finishing', title: 'Signature, photos, invoice, thank-you.', body: `<p>On the stop card the field person ticks the services done and the products used, gets the signature on the phone, and takes photos. The photos are checked against the job before the visit closes. The invoice is created from your catalog with the same bundle rules as the quote, sent to the customer, and recorded against the booking so it can never be billed twice. Consumables used are subtracted from inventory, which projects fifty-six days ahead so you reorder before the calendar runs you out. The next morning at eight the thank-you goes out with what was done and the date of the next visit.</p>
${aside('Tuesday, stop 7', [['Arrived', '2:20, "on my way" sent at 12:10'], ['Done', 'Standard service, consumables × 2, add-on'], ['Checked', 'Signature, 2 photos, job ok'], ['Invoice', '$189.00, sent 2:32'], ['Inventory', '4 units left in the vehicle']])}` },
  ])

// ── Money ────────────────────────────────────────────────────────────────────
pages.money = featurePage('money', 'Money', 'Invoice-based billing, failed-payment recovery, a self-filling ledger, monthly close, bank imports, and books you can ask questions of.',
  'A ledger that fills itself, closes every month, and answers questions.',
  'Money in One Person Show is invoice by invoice. There is no subscription engine to reconcile; each visit produces an invoice, each invoice is paid by card, and the ledger records it. Bank and card statements come in as files, get categorized, and the month closes on the first.',
  [
    { kicker: 'Billing', title: 'One invoice per visit, and a plan for when the card fails.', body: `<p>Every completed visit produces an invoice from your catalog, sent by email with a card link. Quotes are paid the same way: first month plus any one-time items, by card, at the end of the quote. A card that fails is retried, and the customer is emailed at day zero, two, seven and fourteen; after that service pauses and you are told. Customers whose cards are about to expire are warned a day before the monthly billing run. Nothing is ever silently dropped and nothing is ever silently charged.</p>` },
    { kicker: 'The books', title: 'Stripe, the bank, and a categorizer that learns your rules.', tint: true, body: `<p>Charges, refunds and payouts post to the ledger from Stripe every fifteen minutes. Bank and card statements from Amex, Chase, Capital One or any generic export are dropped in as files. Rows that match a rule are categorized; rows that do not are categorized by the assistant, and the rule it used is saved, so next month it is automatic. Expense receipts from the crew go through an approval queue and are booked exactly once, even when they are reimbursed through payroll. If your accountant wants QuickBooks Online, the ledger syncs to it.</p>
<p>A morning brief arrives at seven: cash on hand, receivables and how old they are, customers who have gone quiet. On the first of the month the close runs: profit and loss, receivables aging, sales tax, mileage, emailed as one package.</p>` },
    { kicker: 'Asking', title: 'Ask the books a question in English.', body: `<p>The books have a chat. Ask what you spent on fuel in June, which customers are behind, what a month looked like last year. The assistant writes a read-only query, runs it, and shows you the number with the query underneath so you can see exactly what it counted. It cannot change the ledger; that is a rule at the database, not a promise.</p>
${aside('Ask the books', [['You', '"Fuel spend, June?"'], ['Answer', '$412.18 across 9 transactions'], ['Also open', '3 invoices, $610, oldest 9 days'], ['June', 'Closed on July 1, package sent']])}` },
  ])

// ── Crew ─────────────────────────────────────────────────────────────────────
pages.crew = featurePage('crew', 'Crew', 'Timesheets, in-house payroll with overtime and withholding, pay stubs, expense claims and quarterly filings, without a payroll provider.',
  'Clock in, clock out, get paid correctly, without a payroll company.',
  'The day you hire someone, One Person Show becomes their timesheet and your payroll department. Hours, overtime, withholding, employer taxes and filings are computed in the office app, and the numbers are yours to check before anyone is paid.',
  [
    { kicker: 'Time', title: 'Their hours, their view.', body: `<p>A field employee clocks in and out from their phone and sees their own hours, their own pay stubs, and nothing else: not another person's rate, not your tax ID, not the business's books. Every edit to a time card, by them or by you, is written to an audit trail that cannot be rewritten, with who changed it and when. Removed days can be re-entered; history cannot be erased. Time cards are kept two years and payroll records three, which is what the law asks.</p>` },
    { kicker: 'Payroll', title: 'Approve the week, run it, print the stubs.', tint: true, body: `<p>You approve hours weekly. Payroll computes overtime the way the Fair Labor Standards Act requires, on the blended rate across the week; federal withholding by the IRS percentage method from each person's W-4; Social Security and Medicare with the wage caps; federal and state unemployment; and mileage reimbursed tax-free at the IRS rate. Expense claims an employee paid personally ride along as non-taxable reimbursement, once. Only approved hours are payable, a finalized run freezes its stubs, and voiding a run releases the hours and reverses the book entries in the right period.</p>
${aside('Week 34, one employee', [['Hours', '38.5 regular, 0 overtime'], ['Gross', '$770.00'], ['Withheld', 'Federal, Social Security, Medicare'], ['Employer', 'FICA match, FUTA, Texas SUTA'], ['Stub', 'Printable, frozen on finalize']])}` },
    { kicker: 'Filings', title: 'The forms filled in; the signing left to you.', body: `<p>The filings page shows your deposit schedule and amounts, each quarter's Form 941 figures with the official PDF pre-filled for download, a Form 940 worksheet for the year, and the W-2 box values to type into the Social Security site in January. Finalizing a run emails you the exact deposit amount and its due date. Nothing is transmitted on your behalf; the portal computes, you deposit and sign. The tax tables are refreshed every January and a pay date in a year without tables is flagged rather than guessed.</p>` },
  ])

// ── Growth ───────────────────────────────────────────────────────────────────
pages.growth = featurePage('growth', 'Growth', 'Quote follow-ups, failed-payment recovery, review requests, win-back notes, Google Business Profile posts and replies, analytics, and a Monday review.',
  'Quotes get chased, reviews get asked for, lapsed customers get a note.',
  'Most of the revenue a one-person company loses is the follow-up it never sent. Every quote, every failed card, every customer who went quiet has a schedule now, and a Monday morning email tells you what moved and what to do about it.',
  [
    { kicker: 'Follow-ups', title: 'Forty-eight hours, seven days, fourteen days.', body: `<p>A quote that is not paid gets a nudge at forty-eight hours, another at seven days, a last one at fourteen, and then it is marked cold and left alone. Each step is a note on the customer record, so you can see where every prospect is. A paid quote books its own install. A card that fails follows its own schedule on the <a href="/money">money page</a>. After a customer's third visit, one email asks for a review with your direct link, once, never again. Each season, customers who have lapsed get a short note written from their history, in your voice, as a draft for you to send.</p>` },
    { kicker: 'Being found', title: 'Your Google listing, your ads, your site.', tint: true, body: `<p>The office app drafts Google Business Profile posts for you and replies to reviews in your voice, and shows the listing's calls, directions and views next to the same week's revenue. If you run search or social ads, their spend and the bookings they produced are on the same analytics page as your search console and site traffic, so you can see which dollar became a customer. Leads from your website's forms go straight into your CRM with where they came from.</p>` },
    { kicker: 'Monday', title: 'The weekly review.', body: `<p>Every Monday at nine you get one email: revenue for the last seven days, the visits booked this week by kind, invoices open and how old, quotes warm and cold, new customers, and whether every scheduled job ran on time. Under each number is what to do if it looks wrong. Once a week a second job checks that every customer has a plan on file and enough future visits booked, and quietly extends the ones that have run short.</p>
${aside('Monday, 9:00', [['Revenue, 7 days', '$4,120'], ['Visits this week', '23'], ['Open invoices', '3, $610'], ['Quotes', '2 warm, 1 cold'], ['Jobs', 'All ran']])}` },
  ])

// ── Everything ───────────────────────────────────────────────────────────────
const EVERYTHING = [
  ['Customer portal', [
    ['Sign-in', 'Email link or six-digit code, ninety-day session, works when added to the home screen.'],
    ['Account', 'Plan in plain words, equipment or materials on site, cadence, monthly price, a picture of what they have.'],
    ['Next visit and history', 'Upcoming appointment; past visits with the tech\'s notes and the paid invoice.'],
    ['Property map', 'Where your equipment or work is, from job photos.'],
    ['Settings', 'Phone, email, address; changes sync to CRM and billing.'],
    ['Requests', 'Extra visit, reschedule, upgrade, with pricing from your catalog; all require your approval.'],
    ['Billing', 'Card portal for updating cards and downloading receipts.'],
    ['Chat', 'Answers from their account; can request, escalate; cannot cancel, refund or book.'],
    ['Prospect page', 'A quoted-but-unpaid visitor sees their options, not an empty account.'],
  ]],
  ['Quotes and booking', [
    ['Self-serve quote', 'Build a quote on your site, rental and purchase side by side, price computed server-side.'],
    ['Admin quote builder', 'Same engine in the office; share a signed link by email.'],
    ['Pay and book', 'Card checkout for month one plus one-time items; pick an install slot at the end.'],
    ['Slot suggestions', 'Open times inside hours and rules, favoring days you are already nearby.'],
    ['Radius gate', 'Addresses outside your service radius refused at booking; a backstop cancels any that slip through.'],
    ['Recurring series', 'Visits booked as a series on your cadence, extended automatically.'],
    ['Quote states', 'Sent, paid, followed up, cold, lost; each a note on the customer.'],
  ]],
  ['The office', [
    ['Today', 'Stops in order, consumables needed versus on hand, open invoices, due-unbooked, customer map.'],
    ['Field view', 'Today without money; scratchpad; on-my-way; finish.'],
    ['Rounds', 'Visit logging from the live calendar, catalog line items, signature, photo check, invoice, double-billing guard.'],
    ['Calendar', 'Day and week, appointment dock with configuration, access notes, per-visit notes, book/move/cancel.'],
    ['Clients', 'One page per customer across CRM, billing and calendar; prospects list; notes.'],
    ['Inventory', 'Daily count log and a fifty-six-day demand projection.'],
    ['Invoices', 'Search, draft, finalize, mark paid, browse by status; printable invoice PDF.'],
    ['Route', 'Weekly plan map with a run-now button.'],
    ['Reports and analytics', 'Appointments, revenue, add-ons, tips, import and export; traffic, ads, social, listing, finance.'],
    ['Health', 'Live status of every service you depend on.'],
    ['Legacy migration', 'Audit and move appointments from the scheduling tool you used before.'],
  ]],
  ['Inbox and messages', [
    ['Email agent', 'Reads, classifies, drafts in your voice with real open slots; never sends.'],
    ['Alerts', 'Genuine customer mail pinged to your phone and forwarded to your field employee.'],
    ['Templates', 'Reminder, thank-you, quote sent, follow-up, billing warning, post-visit; one-time approval.'],
    ['Texting', 'Two-hour reminder and on-my-way by text; inbound texts and voicemails logged to the customer with a summary.'],
    ['Bulk mail', 'Announcements to all customers through your own Gmail.'],
  ]],
  ['Day of service', [
    ['Overnight routing', 'Farthest first, home last, from the live calendar; emailed to the field at 7:30.'],
    ['Reminders', 'Email the day before, text two hours out.'],
    ['Photo check', 'Job photos assessed against the work before a visit can close.'],
    ['Thank-you', 'Next morning, with what was done and the next visit date.'],
    ['Property assessment', 'Lot size and site conditions read from satellite and street view when a prospect asks for a quote.'],
  ]],
  ['Money', [
    ['Per-visit invoicing', 'No subscriptions; bundle pricing shared with quotes.'],
    ['Failed payments', 'Retry and email at day 0, 2, 7, 14; service paused after.'],
    ['Ledger', 'Stripe every fifteen minutes; bank and card statement imports.'],
    ['Categorization', 'Rules first, assistant second, new rules saved.'],
    ['Morning brief and monthly close', 'Cash, receivables, quiet customers; P&L, aging, sales tax, mileage on the first.'],
    ['Ask the books', 'Questions in English, read-only queries, shown with their SQL.'],
    ['Expenses', 'Receipt upload, approval queue, booked once, reimbursed through payroll if personal.'],
    ['QuickBooks Online', 'Optional sync for your accountant.'],
  ]],
  ['Crew', [
    ['Timesheets', 'Clock in and out; own hours only; append-only revision history.'],
    ['Payroll', 'FLSA overtime, IRS withholding, FICA caps, FUTA and state unemployment, mileage.'],
    ['Stubs', 'Printable, frozen on finalize; void reverses correctly.'],
    ['Filings', 'Deposit schedule, 941 pre-filled PDF, 940 worksheet, W-2 boxes; you sign.'],
    ['Roles', 'Owner sees all; a field employee sees only their own record.'],
  ]],
  ['Growth', [
    ['Quote follow-up', '48 hours, 7 days, 14 days, then cold.'],
    ['Review request', 'Once, after the third visit, with your direct link.'],
    ['Win-back', 'Seasonal note drafted from history.'],
    ['Google listing', 'Posts and review replies drafted; calls, directions, views.'],
    ['Ads and analytics', 'Search and social spend against bookings; search console; site traffic.'],
    ['Lead capture', 'Website forms into your CRM with source.'],
    ['Monday review', 'Revenue, visits, invoices, pipeline, new customers, job health, with actions.'],
    ['New-customer audit', 'Weekly check that every customer has a plan and enough visits booked.'],
  ]],
  ['The assistant', [
    ['Office chat', 'For you and your crew: route, customer lookup, inventory, notes, booking changes, invoices, on-my-way.'],
    ['Customer chat', 'Account questions, service and reschedule requests, escalation.'],
    ['Where it runs', 'A Mac at your house on your own Claude subscription; no per-message bill.'],
    ['Offline', 'Portal, payments and bookings continue; the assistant says it will be back.'],
    ['Never twice', 'A change that started but failed is never re-run automatically.'],
  ]],
  ['Your rulebook', [
    ['Scheduling', 'Earliest hour, no-Saturday, radius, farthest-first, cadence, series depth.'],
    ['Notifications', 'Which message goes by text, which by email, which admin changes stay silent.'],
    ['Data', 'Calendar owns time, Stripe owns money, CRM owns configuration.'],
    ['Billing', 'Invoice only; follow-up and recovery windows.'],
    ['Compliance', 'Tax-table refresh each January; audit trails and retention.'],
  ]],
  ['Under the hood', [
    ['Your accounts', 'Google Workspace, Stripe, Google Calendar; optional HubSpot, Cal.com, QuickBooks, Slack.'],
    ['Hosting', 'Portal at your domain, hosted; scheduled jobs across three free tiers with a shared secret.'],
    ['Security', 'Signed sessions and quote links, webhook signature checks, owner-only routes, rate limits, monthly audit checklist.'],
    ['Operator tooling', 'A command line to create, validate and check a business; a Mac installer; a written operating manual the assistant reads.'],
    ['Your data', 'Stays in your accounts; cancel any month; nothing to export.'],
  ]],
]
pages.everything = head('Everything it does · One Person Show', 'The complete, honest list of what One Person Show does, from the customer portal to payroll filings.', '/everything') + header('everything') + `
<section class="hero"><div class="wrap"><span class="kicker">Everything it does</span><h1>The complete list, <em>including what it will not do.</em></h1><p class="lede">This is every part of the system as it runs today, grouped the way you would meet it. Where a feature is deliberately limited, the limit is written down here too.</p></div></section><hr>
<section class="prose full"><div class="wrap"><div class="body"><div class="index">${EVERYTHING.map(([g, items]) => `<section><h3>${g}</h3>${items.map(([k, v]) => `<p><b>${k}.</b> ${v}</p>`).join('')}</section>`).join('')}</div></div></div></section>
${ask()}` + footer()

// ── How it works ─────────────────────────────────────────────────────────────
pages['how-it-works'] = head('How it works · One Person Show', 'A hosted portal, a Mac at your house running Claude on your own subscription, and the accounts you already have.', '/how-it-works') + header('how-it-works') + `
<section class="hero"><div class="wrap"><span class="kicker">How it works</span><h1>A portal in the cloud, a Mac in the closet, <em>and the accounts you already have.</em></h1><p class="lede">There are three pieces. Your customers and your crew use a portal at your domain. The thinking happens on a small computer in your house. The data lives where it already lives.</p></div></section><hr>
${prose({ kicker: 'The portal', title: 'Hosted, at your domain.', body: `<p>The customer site and the office app are one application, hosted for you and updated without you noticing. It takes bookings and payments whether or not anything else is running. It talks to your calendar, your Stripe account and your CRM directly, and each of those remains the owner of its own data: the calendar decides when, Stripe decides how much, the CRM decides what the customer has. The portal never keeps a second copy that could drift.</p>` })}
${prose({ kicker: 'The closet', title: 'Where the thinking happens.', tint: true, body: `<p>Every part of the system that reads, writes or judges anything runs on a Mac mini in your house: the email drafts, the job photo check, the bank categorization, the property assessment, the customer chat, the office chat. It runs Claude through the command line on your own subscription, the same flat monthly plan you would buy as a person, with no per-message bill and no shared key between you and us. A small program on that Mac listens for work from the portal over an encrypted tunnel that only opens outward; nothing on the internet can reach into your house.</p>
<p>If the Mac is off, the portal keeps working. Bookings and payments go through. The chat says it will be back. Drafts resume when the Mac does. If you would rather not own a Mac, the appliance plan ships one configured; if you already have one, the installer takes about twenty minutes.</p>` })}
${prose({ kicker: 'The rulebook', title: 'One file that everything obeys.', body: `<p>How early you will take an appointment, whether Saturdays exist, how far you will drive, in what order, which reminder goes by text, how long to chase a quote, how often you visit: these are lines in a plain file, set with you at setup and changed any time. The booking form, the router, the reminder jobs and the assistant all read the same file, so a rule is never true in one place and false in another. The assistant also reads a written operating manual for your business, the same one a human office manager would, which is how it knows that your company name is always written in full or that a thank-you must include the next visit date.</p>` })}
${prose({ kicker: 'What breaks, and what happens', title: 'Failure is designed in.', tint: true, body: `<p>A customer whose card declines is retried and emailed on a schedule, and their service pauses at two weeks rather than silently continuing unpaid. A booking placed outside your radius through a direct link is cancelled with a note to you. If the assistant started a change and could not finish it, it never tries again on its own; it tells you what happened. Every scheduled job reports whether it ran, and the Monday review tells you if one did not. Your data is in your Google, your Stripe and your calendar; if you cancel, there is nothing to export because nothing was moved.</p>` })}
${ask()}` + footer()

// ── Pricing ──────────────────────────────────────────────────────────────────
pages.pricing = head('Pricing · One Person Show', 'Starter $99, Office $249, Crew $449 a month, and a managed Mac for $59. No per-seat fees. Setup by the people who built it.', '/pricing') + header('pricing') + `
<section class="hero"><div class="wrap"><span class="kicker">Pricing</span><h1>Priced like the apps you already know. <em>Without the seats.</em></h1><p class="lede">Three plans that step up the way your business does: first the front office, then the assistant that runs it, then the crew. Nothing here is billed per user or per message.</p></div></section><hr>
<section class="prose full"><div class="wrap"><div class="body">
<table class="plans"><thead><tr><th></th><th>Starter<small>The front office, run by you</small></th><th>Office<small>The front office, run for you</small></th><th>Crew<small>Office, plus the people you hire</small></th></tr></thead><tbody>
<tr><td>Monthly</td><td><span class="price">$99</span></td><td><span class="price">$249</span></td><td><span class="price">$449</span></td></tr>
<tr><td>Who it is for</td><td>One person who wants customers to quote, pay and book themselves, and a calendar, client list and invoicing that stay in sync.</td><td>One person who wants the email, the books, the follow-ups and the customer chat handled while they work.</td><td>An owner with one to five people in the field who wants time, payroll and filings in the same place, with no per-seat fee.</td></tr>
<tr><td>Customer portal, self-serve quotes, pay and book, calendar, clients, per-visit invoicing, overnight routing, reminders and on-my-way texts, inventory, health page</td><td>Included</td><td>Included</td><td>Included</td></tr>
<tr><td>Inbox agent in your voice, office and customer chat, job photo check, property assessment on quotes</td><td></td><td>Included</td><td>Included</td></tr>
<tr><td>Books: Stripe and bank imports, categorization, morning brief, monthly close, ask-the-books, expense claims, QuickBooks sync</td><td></td><td>Included</td><td>Included</td></tr>
<tr><td>Follow-ups: quotes, failed cards, reviews, win-back; Google listing posts and replies; analytics; Monday review</td><td></td><td>Included</td><td>Included</td></tr>
<tr><td>Field logins, timesheets with audit trail, payroll with overtime and withholding, stubs, 941 and W-2 worksheets, up to five field users</td><td></td><td></td><td>Included</td></tr>
<tr><td>The Mac</td><td colspan="3">Office and Crew need a Mac at your place to run the assistant on your own Claude subscription. Bring one you have, or take the managed appliance: a Mac mini shipped configured, with the tunnel and updates handled, for $59 a month or $1,200 once.</td></tr>
<tr><td>Setup</td><td>$500, done with you in an afternoon: customers imported, catalog and rules entered, domain live, a test booking and invoice.</td><td colspan="2">$1,500, done with you over a week: everything in Starter setup, plus your voice learned from five emails, the Mac brought up, the books connected, and a test reply, close and payroll run before we hand you the keys.</td></tr>
<tr><td>You bring</td><td>Google Workspace and Stripe. Your own card fees.</td><td colspan="2">The same, plus a Claude Max subscription on your own account.</td></tr>
</tbody></table>
<p class="small">Pay for the year and get two months free. Cancel any month; your data was always in your own accounts. More than one business, or more than one location, on one Mac: <a href="#start">write to us</a>.</p>
<h3>How this compares</h3>
<p>The field-service apps price in three steps too. Jobber runs $39, $119 and $199 a month and adds $30 or more for each person after the first; Housecall Pro runs $79, $189 and $329 plus $35 a seat. Neither includes a customer portal that answers questions, an assistant that drafts your mail, bookkeeping, or payroll. To get those you add QuickBooks at $38 to $115, a payroll service at about $55 plus $6 a person, and an answering service from $80. A one-person operator on the middle tier of each is spending around four hundred a month across four tools that do not know about each other.</p>
<p>Starter sits between their first and second tiers and already includes the portal and the self-serve quote. Office is priced against their top tier and replaces the bookkeeping, the answering service and most of the admin. Crew is the only plan that adds a fee for having employees, and it adds one flat fee, not one per person.</p>
</div></div></section>
${ask()}` + footer()

fs.writeFileSync(path.join(OUT, 'site.css'), CSS.trim() + '\n')
for (const [name, html] of Object.entries(pages)) fs.writeFileSync(path.join(OUT, `${name}.html`), html)
console.log(`built ${Object.keys(pages).length} pages + site.css -> ${OUT}`)
