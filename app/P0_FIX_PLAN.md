# P0 Money-Path Fixes — plan v2 (post Sol review; v1 REJECTED on F3/F4/F6 defects)

Goal: eliminate double-billing/underbilling windows + the geolocation regression. Surgical.
No subscription-route changes (finding 7 awaits owner decision). No cron/email changes.

## F1. Fail-closed invoice lock — pages/api/admin/generate-invoice.js:35
`consumeJti(`lock:${lockKey}`, 45).catch(() => true)` becomes fail-CLOSED: on consumeJti
throwing, `return res.status(503).json({ error: 'Invoice lock unavailable (KV error). Retry in a moment.' })`.
Keep the `force` bypass and the 409 path. Do not modify consumeJti.

## F2. Idempotency keys in addInvoiceItems — lib/stripe.js:61
Accept `metadata.gg_idem_base` (string, optional). When present:
- STRIP it from metadata before ALL THREE spreads (stripe.js:82, :90, :104) — it must never
  reach Stripe metadata.
- invoices.create primary: `{ idempotencyKey: `gg:invcreate:${base}` }`; the tax-rate-retry
  create MUST use a different key: `gg:invcreate:${base}:notax` (same key + different params
  is a Stripe error).
- item loop: `{ idempotencyKey: `gg:invitem:${base}:${sku}:${i}` }` (i = loop index).
Absent gg_idem_base: behave exactly as today. Sol confirmed the only caller is complete-visit
and no metadata iterator breaks.

## F3. generate-invoice line idempotency + honest failure — generate-invoice.js + rounds.js
- Preserve each item's ORIGINAL submitted index BEFORE any filtering (map to `{item, origIdx}`
  first; Sol confirmed client order is deterministic: rounds.js:274/:644, server filter :183).
- Key for each of the three invoiceItems.create variants:
  `gg:line:${lockKey}${forceId ? ':' + forceId : ''}:${origIdx}:${(item.sku || item.label || '').slice(0,40)}:${item.qty}`
- forceId: NEW optional body field. Semantics: a plain retry (no force) reuses base keys =
  repair, only missing lines get created. An intentional `force: true` submission must carry a
  client-generated `forceId` (rounds generates `crypto.randomUUID()` at the moment the admin
  confirms the force dialog) so deliberate re-billing gets fresh keys. Server: if `force` is
  true and forceId missing, generate one server-side (uuid) so behavior never blocks.
- Failure response: if `errors.length > 0` after the loop, respond
  `res.status(502).json({ ok: false, error: `Invoice incomplete: ${errors.length} line(s) failed`, invoiceId: invoice.id, invoiceUrl: invoice.hosted_invoice_url || null, errors })`
  (scalar `error` field is what the rounds client reads today; do NOT reference undefined vars —
  no `created` variable exists in this route).
- CLIENT (pages/admin/rounds.js — now IN scope): in the invoice-generation submit flow
  (~rounds.js:742-800): on non-2xx from BOTH the initial call and the force call, surface
  `errData.error` AND `errData.errors` (join with newlines) in the existing error display,
  keep `errData.invoiceId` visible when present ("partial draft in..." message), and DO NOT
  proceed to visit-log/complete-stop/mark-done — the stop must remain uninvoiced in the UI.
  Add an `else` branch for the force-failure path (rounds.js:742 has none today).

## F4. Quote paid-marker — pages/api/webhooks/stripe.js:334
Remove the `.catch(() => {})` from `markQuotePaid(...)` and let a failure THROW. Verified: the
outer catch (stripe.js:466-471) already does `releaseWebhook(event.id)` + 500, and Stripe
retries re-enter cleanly. Do NOT return early inside the try. (Known accepted risk, documented:
earlier side effects rerun on retry; their own dedups cover the common paths.)

## F5. complete-visit fail-closed dedup — pages/api/admin/complete-visit.js:45
The `catch {}` on the existing-items lookup becomes: return
`res.status(503).json({ error: 'Could not verify existing invoice items; nothing was billed. Retry in a moment.' })`
before any billing. Pass `gg_idem_base: `${stripeCustomerId}:${visitDate}:complete-visit``
into the addInvoiceItems metadata arg (pairs with F2).

## F6. invoice-items add/add-custom idempotency — invoice-items.js + pages/admin/invoice.js
- API: accept optional `requestId` (string, max 64 chars, reject longer with 400) for actions
  `add` and `add-custom`; when present pass `{ idempotencyKey: `gg:manual:${requestId}` }` to
  the single invoiceItems.create each action performs (Sol: one item per invocation).
- UI: ALL THREE call sites (invoice.js:114, :126, :422). Each handler gets: (a) a synchronous
  in-flight guard (useRef; if busy, return immediately) so a double-click never fires twice;
  (b) `requestId` generated ONCE at handler entry (crypto.randomUUID()) and reused for any
  internal retry of that same submission. Re-enable the guard in finally.

## F7. Geolocation header — next.config.js:40
`geolocation=()` -> `geolocation=(self)`. Keep camera/microphone blocked.

## Rules
1. Touch ONLY: lib/stripe.js, pages/api/admin/generate-invoice.js, pages/api/admin/complete-visit.js,
   pages/api/admin/invoice-items.js, pages/api/webhooks/stripe.js, next.config.js,
   pages/admin/invoice.js, pages/admin/rounds.js (F3 client handling only).
2. Preserve all existing Stripe metadata fields (cal_booking_uid, gg_sku, gg_source,
   gg_visit_date, service_date) — dedup depends on them.
3. `cd app && npm run build` must pass. Do NOT git commit.
4. Self-audit: (a) the two fail-open catches are gone; (b) gg_idem_base never appears in any
   metadata object passed to Stripe; (c) every invoiceItems.create in the three API files
   carries an idempotencyKey when a basis is provided; (d) markQuotePaid has no .catch;
   (e) rounds non-2xx paths (initial + force) no longer mark the stop done; (f) grep
   crypto.randomUUID appears in all three invoice.js handlers + rounds force flow.
