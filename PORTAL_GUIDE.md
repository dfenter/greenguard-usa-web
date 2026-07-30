# GreenGuard USA Portal — User Guide

## Overview

The portal (`portal.greenguard-usa.com`) has three user roles:

| Role | Login email | Landing page |
|------|-------------|--------------|
| Owner / Admin | admin@greenguard-usa.com | `/admin/home` |
| Field Tech | bruce@greenguard-usa.com | `/admin/tech` |
| Customer | their booking email | `/dashboard` |

Login is magic-link only — enter your email, click the link in the email, done. Sessions last 90 days.

---

## Admin Home (`/admin/home`)

The owner's daily dashboard.

**KPI strip** — four cards across the top:
- **Tanks Needed Today** — sum of tanks across all today's stops. Turns orange if it exceeds depot stock.
- **Tanks Needed Tomorrow** — same for tomorrow's stops.
- **Tanks at Depot** — current hand count from the last inventory log. Shows projected total if a delivery is expected this week.
- **Tanks Needed This Week** — rolling 7-day total from the calendar.

**Tank Calendar** — compact view of the week's tank demand. Click any day to log a tank count for that day.

**Unpaid Invoices** — orange alert showing any open Stripe invoices with a Send button to email the hosted invoice link to the customer.

**Today's Stops** — all appointments from Google Calendar for today. Each card shows:
- Customer name (green = new customer or assessment)
- Address, appointment time, tank count
- Notes from the calendar dock (appointment-specific and customer notes)
- **Navigate** — opens Apple Maps directions
- **📲 On My Way** — prompts for an ETA in minutes and sends the customer an SMS
- **Finalize Visit** — links directly to that customer's card on the Rounds page

**My Distance** button — calculates driving distance from your current location to each stop. Auto-runs on page load; click to refresh.

**Customers Due for Service** — expand panel showing customers whose service interval is approaching (next 10 days). Click **Book →** to go straight to the booking page for that customer.

**Customer Map** — shows all customers with addresses plotted by subscription status. Click **Full map →** for the dedicated map view.

---

## Tech View (`/admin/tech`)

Bruce's daily dashboard. Identical KPI strip and stop cards to Admin Home, optimized for field use.

**Tech Notes** — free-form scratchpad for the day. Notes persist across page loads. Use Cmd+Enter to save quickly.

**Tank Calendar** — same as admin home. Click a day to log tanks.

**Today's Route** — map of today's stops in sequence.

**Today's Stops** — same Navigate / On My Way / Finalize Visit buttons as admin home.

**Tomorrow preview** — upcoming stops listed (name, time, address only).

---

## Customer Rounds (`/admin/rounds`)

Where service visits are logged and invoices generated.

### Selecting a date

- **Today** tab — loads today's GCal appointments.
- **All Open** tab — last 30 days of appointments without an invoice. Use this to catch any missed billing.
- **Date picker** — quick-pick dropdown or calendar input to load any historical date.
- **My Distance** — calculates driving distances from your location.

### Stop cards

Each stop shows customer name, address, time, tanks, and any notes from the dock. Status flows: **Pending → Active → Done**.

**Pending state buttons:**
- **Navigate** — Apple Maps directions
- **📲 On My Way** — sends customer SMS with ETA
- **Finalize Visit** — click to open the service entry form (marks arrival time automatically)

**Active state (form open):**

1. **Services Performed** — select what was done (CO₂ refill, barrier treatment, Mosqitter service, etc.). Quantities are adjustable. CO₂ Tank Refill auto-bundles the $39.99 delivery fee; opt into the $10/tank hookup & maintenance checkbox if applicable.
2. **Products Sold** — any retail items sold on site.
3. **Equipment Installed** — trap installs, timer installs, maintenance.
4. **Add-Ons Applied** — bait, sweetscent, etc.
5. **Grand total** — running total broken out by category.
6. **Arrival / Departure times** — fill in actual field times.
7. **Notes** — free-text field for CO₂ levels, observations, follow-up items.
8. **Photo** — tap to take or upload a photo of the equipment. AI quality check runs automatically and attaches a note to the customer's HubSpot profile.
9. **Video** — optional video clip.
10. **Customer signature** — tap to open signature pad (optional).
11. **Complete & Generate Invoice** — creates a Stripe draft invoice, saves the visit log to HubSpot, and opens the post-visit email composer.

**Post-visit email modal:**
- Auto-populates a summary of services and total.
- Click **✨ Draft with AI** to generate a personalized message.
- **Send Email** — sends via Resend and marks the stop done.
- **Skip** — completes the stop without sending an email.

**Already-invoiced stops** show a banner (paid / open / draft) with a **View invoice** link. Use **Re-complete** only if you need to generate a separate invoice for a new visit.

### Double-billing guard

If an invoice already exists for the same Cal.com booking UID, the system prompts before creating a second one. Click OK only if this is genuinely a separate visit.

---

## Calendar (`/admin/calendar`)

Day and agenda views of the Google Calendar.

**Day view** — visual timeline 8 AM – 7 PM. Appointments shown as blocks. Click any block to open the Appointment Detail Dock.

**Agenda view** — list of today's appointments with address, time, tank count, and driving distance.

**My Distance** — same as Rounds; calculates distance from your location to each stop.

### Appointment Detail Dock

Opens when you click an appointment. Two tabs:

**Details tab:**
- Customer name, address (tap to navigate), phone
- Service summary and time
- Service profile (system type, trap count, tank count, recurring add-ons)
- Property notes (gate code, access notes, pets, special instructions) — pulled from HubSpot
- **This appointment's notes** — per-visit notes keyed to this specific GCal event. Add notes here for the tech (gate code changed today, customer will be home, etc.). These appear on the stop card in Rounds and Home.
- **Customer note (HubSpot timeline)** — saves a note to the customer's HubSpot profile. Appears as a customer note on stop cards across the portal.
- Appointment history (last/next visit, total count)

**History tab:**
- List of upcoming and past bookings
- **+ Schedule appointment** button — pre-fills the booking page with this customer's info

---

## Clients (`/admin/clients`)

Customer and prospect list pulled from HubSpot.

- Search by name or email.
- Click a customer to open their profile: contact info, system config, service history, notes.
- **Add Note** — saves a timestamped [ADMIN-NOTE] note to HubSpot; appears on stop cards.
- Filter by status (active, prospect, inactive).

---

## Daily Inventory (`/admin/inventory`)

Log tank counts at the depot.

- Enter the current count of full CO₂ tanks on hand.
- The calendar shows projected stock levels against this week's demand.
- Red days = projected shortage. Logs feed the KPI cards on Home and Tech View.

---

## Invoice Management

### Invoice Editor (`/admin/invoice`)

Search by customer name or email to manage their Stripe invoices.

- View draft, open, and paid invoices.
- Add or remove line items on draft invoices.
- **Finalize & Send** — sends the invoice to the customer.
- **Mark Paid** — records manual payment.

### All Invoices (`/admin/invoices`)

Browse and filter the full invoice history. Filter by status (paid, open, draft), date range, or customer.

### PDF Invoice (`/admin/invoice-pdf`)

Generate a one-off printable PDF invoice. Does not go through Stripe — use for paper invoicing or manual records.

---

## Quote Builder (`/admin/quote`)

Build and share quotes for prospective customers.

1. Enter customer details (name, email, address, property size).
2. Select services, equipment, and add-ons.
3. Preview the quote total.
4. **Send Quote** — emails a shareable link to the customer.
5. Customer clicks the link → reviews the quote → pays via Stripe checkout (first month + setup fees).
6. After payment, the quote flow prompts them to book their installation via Cal.com.

Quotes can be revoked from the quote list if they haven't been paid yet.

---

## Route Plan (`/admin/route`)

Weekly map view generated every Monday by the route optimizer.

- Shows optimized stop order for the week.
- Driven by the route plan JSON file — does **not** update in real time with new bookings.
- Click **Run Route Optimizer Now** to re-trigger the optimizer for the current week.
- For live bookings on a specific day, always use **Rounds** or the **Calendar** — not this page.

---

## Booking (`/admin/booking`)

Schedule a new appointment for an existing customer.

- Pre-fill from a customer's profile or enter manually.
- Picks up available Cal.com slots.
- Sends a confirmation automatically via Cal.com.

---

## Notes system

Notes flow through two systems:

| Note type | Entered via | Storage | Appears on |
|-----------|-------------|---------|------------|
| Appointment notes | Calendar dock → "This appointment's notes" | Postgres `event_notes` table | Stop cards (rounds, home, tech) — shown in green |
| Customer notes | Calendar dock → "Customer note" or Clients → Add Note | HubSpot timeline (`[ADMIN-NOTE]`) | Stop cards — shown in white |
| Visit notes | Rounds form → Notes field | HubSpot timeline (`[VISIT-LOG]`) | Rounds invoiced-stop panel |
| Tech notes | Tech View scratchpad | Local API | Tech View only |
| Property notes | HubSpot contact properties | HubSpot | Calendar dock only |

---

## Ops Assistant (💬 button)

The blue chat bubble in the bottom-right corner of any admin page opens the ops assistant.

Ask it things like:
- "What stops do I have today?"
- "Text John Smith I'm 15 minutes away"
- "How many tanks do I need this week?"
- "What's the status of the Kronberg invoice?"

It has read access to the calendar, HubSpot, and Stripe, and can send SMS via Twilio.

---

## Customer Portal (`/dashboard`)

What customers see when they log in.

- **My Account** — service summary, current plan, next appointment.
- **History** — past service visits and invoice links.
- **Settings** — contact info, notification preferences.
- **Upgrade** — option to add services or equipment.
- **CO₂ Schedule** — tank swap calendar if applicable.

---

## Timesheet (`/admin/timesheet`)

Every crew member's own page — clock in/out, fix hours, submit the week. Built for one thumb in a truck.

**Clock In / Clock Out** — the big button. Tap it when the route starts and again when it ends; the elapsed time is banked automatically. Tapping Clock In twice is harmless (the first stamp stands). Working a second shift the same day is fine — clock in again and the time adds to that day's total.

**Forgot to clock out?** The next Clock In says so and offers to close the old shift. Clocking out of a shift that started on an earlier day asks for confirmation first, because it records the whole span — fix the hours afterward with Edit.

**This week** — live hours, overtime, and estimated pay (before taxes), plus miles and reimbursement when logged. Overtime shows as soon as the week passes 40 hours, so nobody is surprised on payday.

**Recent days** — one card per day with status: Open → Submitted → Approved → Paid. Edit or delete a day until it's in a payroll run; after that it's locked. Break minutes are unpaid and are subtracted from the day's paid hours.

**Submit week for approval** — flags the week's days for Dan to approve. Editing an already-approved day sends it back for approval automatically.

**History** — every card has a History button. It shows every change ever made to that day: what changed, who changed it, and when (including hours before → after). Nothing about a time card can be changed silently, by you or by Dan, and deleting a day marks it removed rather than erasing it — the FLSA requires time records to be kept for two years. Dan sees the same trail from the Approve Time queue, so a disagreement about hours is answerable from the record.

---

## Payroll (`/admin/payroll`)

Owner only. Bruce (or any tech login) lands on their own Timesheet instead. Five tabs:

### Approve Time
Pending days on top, approved-not-yet-paid below, with a date range and a CSV export. Select and **Approve selected**. Days still on the clock are listed separately and cannot be approved — there are no final hours yet. **Send all back** un-approves everything for corrections.

### Run Payroll
1. Set **period start / end** and **pay date**. Keep the period on whole workweeks (Sunday–Saturday by default) — overtime is a weekly calculation, and a split week can hide overtime. The page warns when the dates don't line up.
2. Optionally add a **bonus** or a **deduction** per person.
3. **Preview** — shows hours, gross, each tax, and net pay per person plus totals, cash out the door, and the 941 deposit due date. Changing any date or adjustment clears the preview so nothing gets created from numbers you didn't look at.
4. **Create draft run** — writes the paystubs and claims those timesheet hours. Still reversible.
5. **Finalize** — locks the hours as Paid and posts the expense to the books (`Expense:Payroll:Wages`, `:EmployerTaxes`, `:Contractors`, `:Reimbursement`).

Only **approved** time inside the period is picked up. The pay date's year selects the tax tables.

### History
Every run with status, gross, net, employer tax, and whether it reached the books. Expand for the register, per-person **Paystub** links, and a CSV. **Void** releases the hours back to Approved and reverses the book entries in the original period — then the corrected run can be created for the same dates.

### Filings & Deposits
The federal paperwork, computed from finalized runs for the selected year:
- **EFTPS deposits** — one row per pay month: the exact federal deposit (withheld income tax + both halves of Social Security and Medicare), its due date (15th of the next month, weekend-rolled), and whether every run that month is marked deposited. Schedule at eftps.gov; FUTA and TX SUTA are separate.
- **Form 941** — per-quarter figures plus a **pre-filled official Form 941 PDF** to download, sign and mail. The TWC wage report is due the same day. Finalizing a run also emails the owner the deposit amount and due date.
- **Form 940** — annual FUTA worksheet (under $500/yr means no quarterly deposits; pay with the return).
- **W-2 / W-3** — per-employee box 1-6 worksheet to type into SSA Business Services Online (W-2 Online generates the W-3 and employee copies). Contractors paid $600+ are flagged for 1099-NEC.

The vendored IRS form is `app/lib/forms/f941-<year>.pdf`; vendor the new revision each year and re-verify the field map (see `app/lib/payroll-941-pdf.js`).

### Crew & Settings
Add or edit people: W-2 vs 1099, hourly/salary, rate, per-stop bonus, mileage rate, overtime eligibility, FLSA exempt, and the W-4 inputs (filing status, Step 2 box, dependents credit, extra withholding). **The email must match the login they use for the portal** — that's how a timesheet is attributed. YTD gross, federal withholding, and hours are shown per person.

Business settings: legal name, EIN, TWC account, SUTA rate, default mileage rate, workweek start, default pay frequency, and the address printed on paystubs.

### What the math does
- **Overtime** — FLSA weekly: over 40 hours in a workweek earns a half-time premium on the *blended* regular rate, so per-stop pay raises overtime too. Salaried non-exempt staff earn the premium on salary ÷ hours worked.
- **Minimum wage** — a piece-rate week short of $7.25/h is topped up before overtime is figured.
- **Taxes** — federal income tax by the IRS Pub 15-T percentage method (or a flat %, or none for 1099), Social Security 6.2% to the annual wage base, Medicare 1.45% (plus 0.9% over $200k), employer FICA match, 0.6% FUTA on the first $7,000, and the TWC SUTA rate on the first $9,000. Texas has no state income tax.
- **Mileage** — reimbursement at or below the IRS rate is not wages; anything above it is taxed.

### Paystub (`/admin/paystub?run=<id>&employee=<id>`)
Printable earnings statement with earnings, deductions, YTD, and employer-paid taxes. Print or Save as PDF from the browser. An employee can open their own; the owner can open anyone's.

### Payday checklist
1. Approve Time → approve the period's days.
2. Run Payroll → Preview, read the warnings, Create draft, Finalize.
3. Pay the net amounts (bank transfer / check) — the portal computes, it does not move money.
4. Deposit the withheld + employer taxes with the IRS on your schedule (monthly depositors: the 15th of the following month), and file the TWC wage report quarterly.
5. Export the CSV for the accountant.

**Yearly maintenance:** update `TAX_YEARS` in `app/lib/payroll.js` each January (Pub 15-T tables, SS wage base, IRS mileage rate) and your SUTA rate from the TWC notice. A run whose year has no tables warns instead of silently using the wrong ones.

---

## Expenses & Receipts (`/admin/expenses`)

Where the crew files what they bought for a job, and where Dan approves it. Both roles use the same page.

### Filing a receipt (crew)
1. **📷 Photo of receipt** — opens the camera on a phone. PDFs work too. Optional, but keep one for the IRS.
2. Amount, date, store, **category**, and what it was for.
3. **Paid with** — *My own money* (you get reimbursed) or *Company card* (just recorded for the books).
4. **Submit receipt.** It shows as "Waiting on Dan."

Your two numbers at the top: what's still waiting on approval, and what's **owed to you** — approved receipts that will be paid back on your next check.

### Reviewing (owner)
Flip to **Everyone** to see the queue with the receipt image one tap away. **Approve** or **Reject** (a rejection asks for a reason, and the crew sees it).

Approving does two things:
- **Books the expense** at its own category, dated when it was incurred — so the P&L is right whether or not payroll has run yet.
- For an out-of-pocket receipt, **queues a tax-free reimbursement** on the next payroll run. Company-card receipts are only booked; nothing is owed back.

The reimbursement is *not* booked as a second expense — it's cash going back to the employee, so it can't double-count in the P&L.

### How it lands on the paycheck
Approved out-of-pocket receipts (incurred on or before the period end) ride along on the next run:
- shown per person in the payroll preview as reimbursement, on top of net pay
- printed on the paystub under **Non-taxable reimbursement**, separate from mileage
- broken out in the register CSV as **Receipt Reimb**
- untouched by every tax line — an accountable-plan reimbursement is not wages (Pub 463)

Once the run is finalized the receipt is locked and shows "Reimbursed." Voiding the run puts it back in the queue for the corrected run; its books entry stays, because the expense was still real.

### Rules worth knowing
- Editing an approved receipt sends it back to the review queue — a changed amount can never ride in on an old approval.
- A rejected receipt that had been booked is reversed out of the ledger automatically.
- The crew can delete their own receipts until Dan reviews them; after that it's Dan's call.
- Receipts on a payroll run cannot be edited or deleted by anyone.

---

## Quick reference — admin nav links

| Link | Page | Use for |
|------|------|---------|
| Home | `/admin/home` | Daily overview, stop cards, KPIs |
| Calendar | `/admin/calendar` | Appointment detail dock, day view |
| Clients | `/admin/clients` | Customer profiles, HubSpot notes |
| Rounds | `/admin/rounds` | Log visits, generate invoices |
| Inventory | `/admin/inventory` | Tank counts |
| Quote | `/admin/quote` | Build and send quotes |
| Invoice | `/admin/invoice` | Manage Stripe invoices |
| Tech View | `/admin/tech` (via Home → Quick Access) | Bruce's daily dashboard |
| Timesheet | `/admin/timesheet` (via Home or Tech → Quick Access) | Clock in/out, own hours |
| Payroll | `/admin/payroll` (via Home → Quick Access) | Approve time, run payroll, crew |
| Expenses | `/admin/expenses` (via Home or Tech → Quick Access) | Upload receipts, approve reimbursements |
