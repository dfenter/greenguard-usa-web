# Rounds Card Unification — plan v2 (post Sol review; v1 REJECTED for the range-producer gap)

## Goal (owner)
Every rounds/stop card across the portal must be the SAME card: identical layout, identical data.
Every card must show: customer name, **customer phone**, address, time, service type, tanks,
**appointment notes** (GCal booking description), event notes (calendar dock notes), and
**customer notes** (HubSpot [ADMIN-NOTE] entries). Keep Clarity light-theme tokens. No behavior
changes beyond this.

## Root causes (all verified)
1. `lib/gcal.js` `getBookingsForDateRange()` (~line 410) returns a SLIM shape missing `id`,
   `address`, `phone`, `endTime`, `appointmentNotes`. It feeds home-data.js:27, tech-data.js:26
   (tomorrow stops) and rounds.js:33 (multi-day mode) — so those stops can never show
   phone/notes and have no gcalEventId for dock notes.
2. rounds.js single-day mapping (~50-62) omits `b.phone` and `b.endTime`; enrichment (~163-190)
   never backfills HubSpot phone.
3. StopCard never renders `stop.appointmentNotes`; rounds hacks the booking note into
   clientNotes (169-170) — unlabeled and rounds-only.
4. home.js (~287-297) and tech.js (~306-315) Tomorrow sections are two DIFFERENT custom cards
   (title/time/address only).
5. tech-data.js:60 does not backfill HubSpot address (home-data.js:89 does).

## Changes

### 1. lib/gcal.js — expand `getBookingsForDateRange()` return shape
Add to each returned booking: `id: e.id`, `address`, `phone: parsePhoneFromDescription(e.description)`,
`appointmentNotes: parseAppointmentNotes(e.description)`, `endTime`, keeping ALL existing fields
exactly as-is (match the field extraction used by `getBookingsForDate()` — see lines ~330-380).
No other gcal.js changes; do not alter filtering/tagging logic.

### 2. components/StopCard.js
- Render `stop.appointmentNotes` between the name row and dock-notes block, whitespace-preserved
  (`whiteSpace: 'pre-wrap'`): `📝 {note}` — fontSize 0.85rem, fontWeight 700, color var(--text),
  lineHeight 1.5, paddingLeft 36.
- Keep dock event-notes (📋) and clientNotes rows unchanged. Event-notes fetch stays for ALL
  cards including preview (dock notes are part of the card contract; batch later if needed).
- Add `preview` prop (default false): opacity 0.75 on the card, name renders as a plain <span>
  (no button, no onClick, no underline border), actions row and children NOT rendered.
- `StopRow`: add `preview` prop. When preview, pass `preview` to StopCard and DO NOT construct
  the actions JSX at all (it is currently unconditional at line ~40-92) — `actions={null}`.

### 3. pages/admin/rounds.js
- BOTH mapping branches: add `phone: b.phone || null,` and `endTime: b.endTime || null,`.
- Enrichment return (~177-190): `phone: contact?.properties?.phone || stop.phone || null,`
  (HubSpot-first — the SAME precedence as home-data.js:91 and tech-data.js:53).
- Unmerge booking note: `clientNotes: contact?._clientNotes || []` (drop lines building
  bookingNote into it). `appointmentNotes` already rides on `...stop`.
- Profile dock (~586): add a `row('Booking note', stop.appointmentNotes)` line above the
  clientNotes rows (only when non-empty), keeping the dock's existing row helper style.

### 4. pages/admin/home.js — Tomorrow section
Replace the custom card block (~287-297) with:
`tomorrowStops.map((stop, i) => <StopRow key={stop.id || i} stop={stop} index={i} dateStr={tomorrowStr} preview />)`
NOTE: `tomorrowStr` is already destructured in scope at home.js:106 (NOT `data.tomorrowStr`).
Keep section wrapper/heading.

### 5. pages/admin/tech.js — Tomorrow section
Same replacement (~306-315); `tomorrowStr` is in scope there too. Keep wrapper/heading.

### 6. pages/api/admin/tech-data.js — one line
`address: s.address || info.address || '',` (match home-data.js:89).

## Known acceptable side effects (do NOT "fix" these)
- Tomorrow cards will now issue one /api/admin/event-notes fetch per card — acceptable at
  current route sizes (Sol-reviewed).
- notify-eta phone-only stops bypass email dedup/HubSpot logging — pre-existing, out of scope.

## Rules for implementer
1. Touch ONLY the six files above. No other pages/api/** changes.
2. Clarity tokens only; no new hex colors, no layout redesign of StopCard beyond specified.
3. `cd app && npm run build` must pass. Do NOT git commit.
4. Self-audit: (a) grep StopCard.js for appointmentNotes render + preview prop; (b) confirm
   home.js/tech.js custom tomorrow-card divs are GONE; (c) confirm rounds maps phone+endTime
   in both branches with HubSpot-first enrichment; (d) confirm getBookingsForDateRange returns
   the six new/confirmed fields; (e) confirm no remaining `bookingNote` merge in rounds.

## Verification (orchestrator)
Build green; diff review; preview deploy; owner checks /admin/home, /admin/tech, /admin/rounds:
cards identical, phone + booking note + dock notes + customer notes on every card incl. Tomorrow.
