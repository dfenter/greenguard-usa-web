# {{name}} Quote Management

Send, check status, or manage customer quotes.

## Build a quote (admin)
{{website}}/admin/quote
- Select customer by email, add line items, set service date
- Click "Share Quote" → generates a unique `/quote/TOKEN` link for the customer

## Public self-serve quote
{{website}}/quote/new
- Customer fills out their address, plan preferences
- Produces a quote they can accept and pay directly

## Check quote status for a customer
Look for CRM notes on the contact matching these markers (policy: `data.noteTags`):
- `[QUOTE-SENT] jti=X email=Y amount=Z url=U sent=ISO` — quote was sent
- `[QUOTE-PAID] jti=X` — customer paid
- `[QUOTE-FOLLOWUP-T48] jti=X` — 48h nudge sent
- `[QUOTE-COLD] jti=X` — 7 days no response, admin alerted
- `[QUOTE-LOST] jti=X` — 14 days, marked lost
- `[QUOTE-DEAD] jti=X` — manually killed by admin

## Revoke a quote
POST `/api/admin/revoke-quote` with `{ jti }` — marks quote as dead in the CRM

## Quote follow-up cron
Runs daily via cron (`/api/cron/quote-followup`).
Scans all QUOTE-SENT notes from the last 30 days, handles the follow-up schedule
(policy: `billing.quoteFollowupDays`).

## After customer pays (checkout.session.completed)
- Welcome email sent with magic login link
- CRM marked QUOTE-PAID
- Booking embed shown for installation booking
- Receipt sent to customer

## Generate a proposal (PDF-style)
POST `/api/admin/generate-proposal` — generates a shareable proposal document

## Arguments: customer name/email, or quote action (send/check/revoke)
$ARGUMENTS
