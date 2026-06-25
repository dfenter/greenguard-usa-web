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
