# {{name}} Email Agent & Notifications

Manage the Gmail-based email agent and all automated customer emails.

## Email agent (Render)
Runs every 5 minutes via Cloudflare Worker → `POST /cron/email-agent`
Processes: new customer emails, booking inquiries, review requests, voicemails.
Code: agent repo `main.py` + `gmail_client.py`

## Automated emails (portal → transactional email)
| Trigger | Email sent | Code |
|---------|-----------|------|
| invoice.payment_succeeded | Customer branded receipt | `lib/purchase-notify.js` `sendCustomerReceipt` |
| checkout.session.completed | Customer checkout receipt + welcome email | `lib/purchase-notify.js` `sendCheckoutReceipt` |
| invoice.payment_failed | T+0 payment failure notice | `lib/payment-resurrection.js` `sendT0Email` |
| After rounds stop | Post-visit summary email | `/admin/rounds` EmailModal |
| Quote sent | Quote link email | `/api/admin/quote-link` |
| T+48h no quote response | Nudge email | `lib/quote-followup.js` `sendT48Email` |
| Appointment reminder | Day-before reminder | Render `/cron/appointment-reminders` |

## Post-visit email rules
<!-- tenant-catalog: edit for your catalog -->
- Rolls up related consumable line items into one clean line (see catalog for what to bundle)
- Always says "{{nameShort}}" the full brand name, never a bare/partial name
- Tech can edit before sending; "Draft with AI" button available
- Admin receives BCC on all customer receipts

## Send a manual email to a customer
Use the CustomerPanel (Email button) in `/admin/clients` or `/admin/rounds`.
Or directly via `/api/admin/send-message`:
```bash
curl -s -X POST {{website}}/api/admin/send-message \
  -H "Content-Type: application/json" \
  -H "Cookie: gg_session=TOKEN" \
  -d '{"to":"customer@email.com","toName":"Name","subject":"Subject","body":"Body text"}'
```

## From address
`PORTAL_FROM_EMAIL` env var (e.g., the tenant's alerts-from address ({{ownerEmail}} or a dedicated alerts inbox))

## Post-appointment email (Render agent)
Sent by `post_appointment.py` after each service stop is marked complete.
Triggered via `/cron/post-appointment` — contains thank-you note + next service date
(policy: `notifications.thankYouIncludesNextService`).

## Thank-you email requirements
Must include: appointment details + next-service reminder. The booking
platform does not send these automatically — the post-appointment cron
handles it.

## Arguments: optional action (check-agent/send/test-receipt)
$ARGUMENTS
