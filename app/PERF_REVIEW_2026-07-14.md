# Portal Performance & Reliability Review — 2026-07-14

Method: 4 Codex Sol 5.6 High review workers (data layer / API routes / crons+notify / SSR+frontend),
~670K review tokens, findings independently verified by the orchestrator before ranking.
Auth posture: CLEAN — all 67 admin + 9 customer routes gate correctly; all 13 crons enforce CRON_SECRET;
webhooks verify signatures.

Severity: P0 = money/data loss or outage risk. P1 = user-visible failure or major perf hit. P2 = waste/risk.
[V] = orchestrator-verified against source. Duplicated findings across workers were merged.

## P0 — money paths (7)

1. [V] **Invoice-generation lock fails OPEN** — `pages/api/admin/generate-invoice.js:35`
   `consumeJti(...).catch(() => true)`. The single-flight lock that exists specifically to stop
   double-tap duplicate invoices grants the lock on any KV error. KV ran at quota exhaustion this
   month, making this the live failure mode. FIX: fail closed (503/409) + Stripe idempotency keys.

2. **addInvoiceItems has no Stripe idempotency keys** — `lib/stripe.js:67`
   check-then-create for invoice + items; concurrent/retried visit completions create duplicate
   drafts that billing-run later finalizes. FIX: deterministic per-visit idempotency keys.

3. [V] **Quote paid-marker persist swallowed** — `pages/api/webhooks/stripe.js:334`
   `markQuotePaid(...).catch(() => {})` then webhook confirmed. If it fails, the same quote link
   is payable again after Stripe's ~24h idempotency window. FIX: require persist before confirm.

4. **Partial invoice returned as success** — `pages/api/admin/generate-invoice.js:219`
   per-line Stripe failures are collected but the route returns 200 ok:true; underbilled invoice
   is finalized 5 days later. FIX: non-2xx on any line failure.

5. **complete-visit dedup fails open + non-atomic** — `pages/api/admin/complete-visit.js:45`
   existing-item lookup `catch {}` then addInvoiceItems → double SKUs on lookup failure/concurrency.

6. **invoice-items add paths lack idempotency** — `pages/api/admin/invoice-items.js:111`
   double-tap/retry duplicates billable draft lines. FIX: client request ID → idempotency key.

7. [V] **Subscription mutations unsafe AND contradict billing policy** —
   `pages/api/admin/execute-upgrade.js:95` (cancel-before-create: transient Stripe failure leaves
   customer with NO plan) and `pages/api/admin/start-plan.js:60` (no idempotency/existing-plan
   check). Both are live routes (admin/upgrade.js:99, clients/[email].js:160) yet business policy
   is invoice-only billing with no subscriptions. DECIDE: remove/disable these routes, or fix both.

## P1 — reliability (15)

8. [V] **Geolocation blocked site-wide by own header** — `next.config.js:40`
   `Permissions-Policy: geolocation=()` while home/tech/rounds/calendar/clients call
   `navigator.geolocation` — distance-from-tech features silently fail on the field iPhone.
   FIX: `geolocation=(self)`. (Most user-visible one-line fix in the review.)

9. [V] **Notify backup can double-send** — `lib/notify-queue.js:163` (found by 2 workers)
   `claimForBackup(id)` boolean ignored; on KV error "sending anyway". Duplicate emails/iMessages
   when the daemon popped a job but hasn't marked it sent. FIX: send only on successful claim.

10. **Webhook idempotency falls back to in-memory Map** — `lib/db-webhook-log.js:21` (+ 24h TTL
    at :14 vs Stripe's ~72h retries). Parallel instances double-process Stripe events. FIX: fail
    closed in prod; retain confirmed IDs 4+ days.

11. **Login code consumption not atomic** — `lib/auth.js:150` — two simultaneous submits with the
    correct code both authenticate. FIX: atomic consume (Lua/SET-NX pattern).

12. **Resend errors recorded as sent** — `lib/payment-resurrection.js:58`, `lib/purchase-notify.js:103`,
    `pages/api/cron/quote-followup.js:175`, `pages/api/cron/payment-resurrection.js:61` — SDK
    resolves with `{error}` but callers mark stage done; quota outage = permanently suppressed
    reminders/receipts recorded as success. FIX: check result.error + route through shared sender.

13. **Cron stages have no atomic claim** — `pages/api/cron/payment-resurrection.js:48`,
    `quote-followup.js:175` — overlapping cron-job.org retries double-send before markers write.

14. **Outages rendered as legitimate empty data** — `pages/api/cron/daily-route.js:135` (tech gets
    "No appointments today" during a GCal outage), `daily-summary.js:151` (zero-revenue report),
    `pages/admin/calendar.js:31` + `pages/admin/rounds.js:30` (SSR `catch {}` → false
    "all invoiced"/empty schedule UI). FIX: propagate error props/alerts, never fake empty.

15. **HubSpot partial results cached** — `lib/hubspot.js:123` (chunk `catch {}` → cached missing
    customers/notes for 10 min), `lib/hubspot.js:252` (pagination break → 30-60 min incomplete
    contact list). FIX: throw so cached() skips storing incomplete runs.

16. **Health endpoint unauthenticated + no deadlines** — `pages/api/health.js:132/:139` (2 workers)
    anyone can burn Stripe/HubSpot/GCal/Meta quota per request; one hung provider stalls the whole
    check. FIX: split cheap public liveness from secret-gated deep check + AbortSignal.timeout.

17. **Stripe webhook ack blocked by serial integration chain** — `pages/api/webhooks/stripe.js:303`
    notifications, receipts, HubSpot, GA4/Meta/Ads run serially without timeouts before the 200.
    FIX: await money-critical writes, queue/parallelize the rest.

18. **Cal.com webhook acks before doing its work** — `pages/api/webhooks/calcom.js:69` — 200 sent
    first, Vercel can kill the rest, Cal.com never retries. (Low priority: Cal.com is legacy now;
    consider deleting the route instead.)

19. **Fire-and-forget after response** — `pages/api/admin/invoice-items.js:265` (invoice-sent
    notify), `pages/api/admin/upload-media.js:43` (photo QA) — the exact Vercel kill pattern that
    bit /book before. FIX: await or durably enqueue before responding.

20. **Booking creation not idempotent** — `pages/api/book/create.js:77` — no claim or final
    availability recheck before events.insert: double-click = duplicate appointment.

21. **GCal→HubSpot sync caps at 250 events silently** — `pages/api/cron/gcal-hubspot-sync.js:36`
    no nextPageToken; >250 events in 180 days = newer bookings never sync. FIX: paginate.

22. **KV/queue fetches have no timeout** — `lib/notify-queue.js:40`, `lib/tank-data.js:57`,
    `components/useLazyData.js:12` (stalled request = infinite full-page spinner in the field).
    FIX: bounded timeouts (fetchWithTimeout/AbortController) everywhere.

## P1 — performance (8)

23. **visits-due: 2 serial GCal searches per candidate** — `pages/api/admin/visits-due.js:72`
    ~172 Calendar queries per load; timeout + quota risk. FIX: one range fetch grouped by email.

24. **rounds SSR: per-contact HubSpot notes while blocking TTFB** — `pages/admin/rounds.js:103`
    (and note scan is now 100-deep per contact after a84fdc1). FIX: batch or post-render load.

25. **calendar: 1 request per visible day (42/month view) + 1 distance call per stop pair** —
    `pages/admin/calendar.js:252/:276`. FIX: range endpoint + single route-matrix request.

26. **tech page SSRs nothing** — `pages/admin/tech.js:139` — spinner through SSR+hydrate+refetch
    on cellular for the most latency-sensitive user. FIX: SSR today's stops as fallback data.

27. **quote builder ships entire Stripe+HubSpot customer list in props** — `pages/admin/quote.js:15`.
    FIX: debounced server-side search.

28. **CustomerMap eagerly loads Maps SDK + geocodes ~86 addresses on mount** —
    `components/CustomerMap.js:17`; public quote page also loads unused Maps libraries
    (`pages/quote/new.js:486`). FIX: lazy-mount + persist geocodes + trim libraries.

29. [V] **clients.js fetches detail twice per panel open** — `pages/admin/clients.js:227`
    (a useState-as-effect hack AND an if-block both call fetchDetail). FIX: one useEffect.

30. **books ingest: serial per-transaction queries** — `lib/books-ingest.js:77`; QBO invoice sync
    also lacks idempotency (`lib/qbo.js:98`). FIX: preload rules + batch insert; DocNumber guard.

## P2 (5)

31. `lib/cache.js:113` stale-refresh promises detached (may be killed post-response).
32. `lib/notify-queue.js:142` 5s/300ms grace-poll burns ~17 KV reads per notification vs 15-min daemon poll.
33. `pages/api/cron/acuity-leak.js:53` hourly alert window overlaps lookback → duplicate admin alerts.
34. `pages/quote/[token].js:13` customer quote renders only after client fetch (conversion path).
35. `pages/admin/analytics.js:9` full recharts entry (~141KB gz) imported 10 times.

## Recommended fix order
1. #1 + #2 + #4 + #5 + #6 (invoice money path: fail-closed locks + idempotency keys) — one batch.
2. #8 (geolocation header, one line) + #3 (markQuotePaid).
3. #7 decision: kill or fix the subscription routes.
4. #12-#14 (notification truthfulness + outage-vs-empty) — protects reminders and the tech's route.
5. #16, #22-#26 (quota + field latency) as a perf batch.
