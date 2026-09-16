# Handoff: calendar-dnd gate-review fixes

## Branch / commit state
- Branch: `calendar-dnd` (already checked out at `/Users/lucille/greenguard-usa-web`)
- Last commit: `bdd9af6e` "portal: drag-and-drop rescheduling on admin calendar" (already deployed once to production via `./scripts/deploy.sh portal` — that deploy predates the gate-review fixes below and is LIVE right now)
- Working tree: clean at last check, about to be dirtied by the fixes below (none applied yet except em-dash audit, which found the locations but made no edits).

## Task from coordinator (gate review FAILED, must fix before done)

1. **BLOCKER — timezone bug**, `app/pages/admin/calendar.js` around lines 462-477 (`handleDragEnd`):
   ```js
   const local = new Date(`${dayStr}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`)
   ```
   and similarly for the `day:` branch using `toLocalHM(ev.startTime)`. This parses as the **browser's local timezone**, not America/Chicago (CT). From an ET/PT browser this silently misbooks by 1-3 hours. Also DST-unsafe across the Nov 1 2026 fall-back.
   - **Fix needed**: build the UTC instant explicitly from CT wall-clock components. Standard approach: use `Intl.DateTimeFormat` with `timeZone: 'America/Chicago'` to compute the actual UTC offset for the given calendar date (handles DST correctly), then construct the ISO string. A clean pattern:
     ```js
     function ctWallTimeToUTC(dayStr, hour, minute) {
       // dayStr = 'YYYY-MM-DD', hour/minute = CT wall clock
       // Use the same trick already in lib/gcal.js's _tzDayBounds (see offsetMs pattern there, read it for reference) or:
       const guessUTC = new Date(`${dayStr}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00Z`)
       const ctStr = guessUTC.toLocaleString('en-US', { timeZone: 'America/Chicago', hour12: false, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit' })
       // parse ctStr back, compute delta between guessUTC's CT-rendered time and desired hour/minute, adjust guessUTC by that delta
       // OR simpler: iterate/binary-search since CT offset only takes 2 values (-5/-6); test both and pick the one whose toLocaleString in CT matches hour:minute for that date.
     }
     ```
     Simplest robust version: try both `-05:00` and `-06:00` offsets for the given `dayStr`, format each with `Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',...})`, and pick whichever one's formatted output matches `dayStr`+`hour:minute`. This avoids manual DST-table logic entirely and works with any process TZ.
   - **Required test** (write as a small node script, run it, paste output in final report — do NOT rely on browser testing for this part):
     - `dayStr='2026-11-02'`, `hour=14,minute=0` (CT, post-fallback, CST=-06:00) → expect UTC `2026-11-02T20:00:00.000Z`
     - `dayStr='2026-09-17'`, `hour=14,minute=0` (CT, CDT=-05:00) → expect UTC `2026-09-17T19:00:00.000Z`
     - Run the same script twice: once with `TZ=America/New_York node script.js` and once with `TZ=UTC node script.js` — both must produce identical correct output (proves it's independent of process/browser TZ).
   - Apply the same helper to BOTH the `slot:` branch (day view, uses `hour`/`minute` computed from minutesFromStart) and the `day:` branch (week/month, uses `toLocalHM(ev.startTime)` for h/m — note `toLocalHM` itself already correctly extracts CT wall-clock h/m via `Intl.DateTimeFormat` with `timeZone: TZ`, so that part is fine; only the reconstruction into a Date is broken).

2. **Month view has nothing draggable**, `app/pages/admin/calendar.js` around line 758-778 (month grid renders `{dayBookings.length}V ...` count badge only, no per-event chips).
   - Fix: prefer rendering compact draggable chips (customer first name only, no time) inside month cells so real drag-and-drop works there, BUT only above the 430px mobile breakpoint — at ≤430px keep the existing count-badge-only display (space is too tight for chips). Check existing `@media (max-width:430px)` pattern already used elsewhere in this file's `<style jsx>` block for the CSS approach (class-based toggle, e.g. render both and use CSS to show/hide, or use a JS media-query check consistent with how the rest of the file already handles the breakpoint — search the file for "430" to see existing precedent, e.g. `.ctrl-right` at line ~387).
   - The `DroppableCell` wrapping for month day cells already exists (`id={`day:${d}`}`) — reuse it, just add draggable event chips as children instead of leaving the cell only clickable-to-navigate. Preserve the existing `onClick={() => { setDate(d); setViewMode('day') }}` for whitespace clicks (not on a chip).
   - `DraggableEvent` component already exists in the file (used for day/week views) — reuse it for month chips too.

3. **Rollback uses stale pre-POST snapshot**, `app/pages/admin/calendar.js` around lines 424-433 (in `moveBooking`, the `prevBookings`/`prevRange` captured before the optimistic update, restored on failure).
   - Fix: on failure, instead of `setBookings(prevBookings); setRangeBookings(prevRange)`, trigger a refetch (the same mechanism already used on success: `setRetryNonce((n) => n + 1)`, which the `useEffect` watching `retryNonce` re-fetches from the server). This avoids clobbering any state that changed via a concurrent 30s auto-refresh while the POST was in flight.

4. **Remove em dashes from code comments** (global rule, applies even in comments) — found via `grep -n "—"` across the 4 touched files:
   - `app/pages/api/admin/reschedule.js:1`
   - `app/lib/booking-actions.js:43`
   - `app/lib/cache.js:3,7,21,90,136,146`
   - `app/pages/admin/calendar.js:162,191,320,447,471,596` (line 596 is a JSX text node `⚠️ Google Calendar unavailable — appointments...` — check whether that's user-facing text (leave the em dash there, or change to a hyphen/colon if it's meant to be included in the "even in comments" rule broadly) vs `pages/admin/calendar.js:733` which is a literal `—` character rendered as an empty-state placeholder inside `<div>—</div>` — that one is UI content, NOT a comment, almost certainly should stay untouched (it's the em dash glyph used as a visual "no bookings" placeholder, matching existing pattern elsewhere in the app — do not touch this one, it's not a comment).
   - Replace comment em dashes with regular hyphens, colons, or period+space as fits each sentence. NONE of this affects logic, purely comment text.

## After fixes: build + deploy + verify (per coordinator's explicit constraints)

- **Do NOT drag any real appointment on the live calendar this time.** The earlier session did this against production data (`app/.env` holds a REAL Google Calendar refresh token — this is the live GreenGuard USA production calendar) and had to manually restore a customer's real appointment (Emily Travis, event id `8nfv4njr91f3jrfdvs8abnjml4`) via a raw `calendar.events.patch` node script back to `2026-09-16T13:00:00-05:00` / end `13:30:00-05:00`. It IS currently restored correctly (verified live via API before context ran out) — just don't drag it again.
- Verify the timezone fix with a **standalone node script** (see test cases above), not the browser.
- For the drag interaction itself, use **playwright-cli** (already proven to work in this environment) but **intercept the POST to `/api/admin/reschedule`** and assert on the request body instead of letting it hit the real API. Playwright supports request interception; playwright-cli's help output has a `route-list` command and likely a `route-add`/route-mocking command — run `playwright-cli --help 2>&1 | grep -i route` to find the exact intercept command syntax (I did not have time to check this before running out of context). If no built-in intercept command exists, an alternative: temporarily point the fetch at a local mock endpoint, or use `playwright-cli eval` to monkey-patch `window.fetch` before the drag (capture calls to `/api/admin/reschedule`, store the body in a `window.__capturedReschedule` var, return a fake success response, then read it back via eval) — this avoids ever hitting the real API while still exercising the real dnd-kit drag mechanics end-to-end in a real browser.
- Rebuild: `cd /Users/lucille/greenguard-usa-web/app && npm run build` (must pass clean, it has twice already in this session).
- Redeploy: `cd /Users/lucille/greenguard-usa-web && ./scripts/deploy.sh portal` (already proven working, deploys to `https://portal.greenguard-usa.com`, run from repo root, takes ~3-4 min).
- Live smoke test (safe, read-only, already validated as a pattern): `curl` the deployed `/admin/calendar` (expect 307 redirect to /login when unauthenticated) and `/api/admin/reschedule` POST with empty body (expect 401 unauthenticated) — do NOT need a real session cookie for this smoke check, both correctly gate on auth.

## Important environment notes learned this session

- **Local `npm run dev` is broken for browser testing**: the CSP header in `app/next.config.js` (`script-src 'self' 'unsafe-inline' ...`, no `unsafe-eval`) blocks Next's dev-mode Fast Refresh runtime (which needs `eval`), so client JS never hydrates in dev — body stays `display:none` (Next's FOUC guard), all elements report zero-size rects, clicks don't work. This is PRE-EXISTING and unrelated to this feature; do not try to fix the CSP (out of scope, security-sensitive, surgical-changes rule).
- **Workaround**: build (`npm run build`) then run `npx next start -p 3001` (production server, no eval-based fast refresh, CSP doesn't block hydration) and test against `localhost:3001`. This works reliably — used successfully for all verification this session.
- **Session cookie for local admin auth**: mint a JWT manually with the project's `JWT_SECRET` (present in `app/.env`, no `.env.local` exists) via:
  ```js
  require('dotenv').config();
  const { SignJWT } = require('jose');
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ email: 'admin@greenguard-usa.com', role: 'owner', type: 'session' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(secret);
  ```
  Then `playwright-cli cookie-set gg_session "$TOKEN" --domain=localhost --path=/` before navigating.
- **playwright-cli's built-in `drag` command is unreliable with dnd-kit**: it performs a single-jump mouse move (no real intermediate `pointermove` events), so dnd-kit's `PointerSensor` collision detection (`e.over`) never updates from the drag's origin droppable — `delta` stays `{x:0,y:0}`. Confirmed via `MeasuringStrategy.Always` on `DndContext` (already added, keep it) that this didn't fix it either — it's purely a Playwright-simulation artifact. **Workaround that DOES work**: use playwright-cli's raw `mousemove`/`mousedown`/`mouseup` primitives with 3-5 manual intermediate `mousemove` calls between source and target coordinates (get coordinates via `playwright-cli eval` reading `getBoundingClientRect()` on the relevant DOM nodes). This produced correct, real drags in this session (confirmed via a `window.__lastDragEnd` debug var temporarily added to `handleDragEnd` — REMOVE any such debug instrumentation before final commit, already done in the last session's code as of commit `bdd9af6e`, but if you add a new one for verifying this round's fixes, remove it again before the final build/commit).
- `git diff --stat` after this session's edits (already committed): `app/lib/booking-actions.js | 5 +-`, `app/pages/admin/calendar.js | 177 ++++++--`, plus new `app/pages/api/admin/reschedule.js` and edits to `app/lib/cache.js` (added `invalidatePrefix`) and `app/package.json`/`package-lock.json` (added `@dnd-kit/core`).
- **Other files in the repo working tree are dirty from OTHER sessions/lanes** (`redesign-dist/...html`, `redesign/dist/...html`, lots of untracked `play/razorfin/...`, `.worktrees/`, `app/scripts/hs.js`). These are NOT part of this task — do not touch, do not add, do not commit them. Only stage/commit the 6 files listed above (`app/lib/booking-actions.js`, `app/lib/cache.js`, `app/package.json`, `app/package-lock.json`, `app/pages/admin/calendar.js`, `app/pages/api/admin/reschedule.js`).

## Report format expected by coordinator

Under 250 words: what changed, the test output for item 1 (the node script's printed results for both TZ runs), and what was verified live (should be: build passed, deploy succeeded, auth-gated smoke checks passed, playwright drag test with intercepted POST showed correct body — explicitly state that no real appointment was touched this time).
