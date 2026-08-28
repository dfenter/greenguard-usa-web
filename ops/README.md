# One Person Show (OPS)

A company that runs itself, for the person who is the company.

OPS packages the GreenGuard USA operating stack — customer portal, owner/tech
portal, and a Claude-powered back office — as a white-label product for solo
service operators (pool, lawn, pest, HVAC, cleaning, mobile detailing, and
similar recurring-cadence trades). One Mac appliance running a Claude
subscription runs the office: booking, routing, reminders, invoicing,
collections, quote follow-up, bookkeeping, payroll, and customer chat.

## Architecture

```
                          ┌─────────────────────────────┐
                          │   Vercel — portal.<tenant>   │
                          │   Next.js (Pages Router)     │
                          │   BUSINESS_ID selects        │
                          │   lib/businesses/<id>/*      │
                          └──────────────┬───────────────┘
                                         │ /chat, /complete
                                         │ (Tailscale Funnel)
                          ┌──────────────▼───────────────┐
                          │   Mac appliance (owner's Mac  │
                          │   or a Mac mini)              │
                          │                                │
                          │  ┌──────────────────────────┐ │
                          │  │ chat-daemon.js  :8787     │ │
                          │  │  /chat/{customer|admin}   │ │
                          │  │   claude -p + MCP tools   │ │
                          │  │  /complete                │ │
                          │  │   tool-less single-turn   │ │
                          │  └──────────────────────────┘ │
                          │  ┌──────────────────────────┐ │
                          │  │ notify daemon              │ │
                          │  │  KV queue → email/iMessage │ │
                          │  └──────────────────────────┘ │
                          │  ┌──────────────────────────┐ │
                          │  │ Gmail agent                │ │
                          │  │  drafts replies in voice   │ │
                          │  └──────────────────────────┘ │
                          │  launchd keeps all of it alive │
                          └──────────────┬───────────────┘
                                         │
                          ┌──────────────▼───────────────┐
                          │  Tenant config                │
                          │  lib/businesses/<id>/          │
                          │   config.js / catalog.js /     │
                          │   business.yaml (policy)       │
                          └────────────────────────────────┘
```

The portal is already multi-tenant: `BUSINESS_ID` selects a directory under
`app/lib/businesses/<id>/` for identity, catalog, pricing, and (optionally)
a `business.yaml` overlay that carries policy overrides. All AI traffic runs
through the Mac appliance's `claude` CLI on a flat subscription — no
per-token API bill in normal operation.

## Quick start

These commands are the intended OPS CLI surface (built by the `ops/cli`
lane) and the appliance installer (built by the `ops/appliance` lane). This
lane (skills + docs) assumes they exist:

```bash
# Scaffold a new tenant directory + business.yaml from a template
ops init <tenantId> --name "Acme Home Services" --email admin@acme.example ...

# Sanity-check a tenant's config.js + business.yaml (required fields, no leftover placeholders)
ops validate <tenantId>

# End-to-end health check: portal, agent, webhooks, crons (see ops/skills/templates/health.md)
ops doctor <tenantId>

# Render this tenant's 28 skills + CLAUDE.md into ~/.claude/commands
ops skills <tenantId>
# equivalent to:
node ops/skills/build.js <tenantId> --out ~/.claude/commands

# Install and configure the Mac appliance (chat-daemon, notify daemon, Gmail agent, Tailscale Funnel)
ops/appliance/install.sh
```

## What's in this lane (`ops/skills/**`, docs)

- `ops/skills/build.js` — the skill/CLAUDE.md renderer. No dependencies;
  reads `app/lib/businesses/<tenantId>/config.js` directly and every
  template in `ops/skills/templates/*.md`, substitutes `{{tokens}}`, and
  fails loudly on any template token it doesn't recognize.
- `ops/skills/templates/*.md` — the 28 business + ops skills, tenant-neutral.
  Sections that still carry a specific business's SKU/CRM-property taxonomy
  are wrapped in `<!-- tenant-catalog: edit for your catalog -->` so an
  operator knows exactly what to customize; everything else (the actual
  workflow steps, gotchas, and rules) is the reusable product.
- `ops/CLAUDE.md.tmpl` — a tenant CLAUDE.md template, rendered per-tenant
  with a `## Policy` section generated from `ops/policy.yaml.example`
  (or the tenant's own `business.yaml` `policy:` block, merged over the
  defaults).
- `ops/policy.yaml.example` — the GreenGuard operating rulebook, expressed as
  editable config: scheduling rules, notification channels, data-model
  ownership, billing rules, weekly rhythm, and compliance cadence.

## Tenant onboarding checklist (white-glove)

1. **Import customers** into the CRM (HubSpot or equivalent) — CSV import or
   manual entry, matching the property shape in
   `lib/businesses/<id>/catalog.js` and the tenant's `<id>-hubspot.md` skill.
2. **Stripe account** — create/connect, add the tenant's price catalog, set
   the webhook endpoint, confirm `mode: 'payment'` only (no subscriptions).
3. **Google Workspace** — dedicated mailbox for the business (owner login +
   `ADMIN_EMAIL`), Google Calendar as the appointment source of truth.
4. **Cal.com** (optional) — event types for each service/install type if the
   tenant wants a booking-platform layer in front of Google Calendar.
5. **Voice profile** — 5 sample emails in the owner's own voice, used to
   steer the email agent and post-visit AI drafts.
6. **Catalog** — fill in `lib/businesses/<id>/catalog.js` and `config.js`
   (SKUs, prices, CRM property taxonomy, images) — this is what the
   `tenant-catalog` comments in the skills point back to.
7. **policy.yaml** — copy `ops/policy.yaml.example` into the tenant's
   `business.yaml` as a `policy:` block, edit only what differs (booking
   hours, radius, notification channels, follow-up windows).
8. **DNS** — point the tenant's domain/subdomains at Vercel.
9. **Vercel env** — set `BUSINESS_ID` and `NEXT_PUBLIC_BUSINESS_ID` to the
   tenant id, plus the full env var list in the generated `CLAUDE.md`
   (`## Environment Variables`).
10. **Mac appliance** — provision the Mac (owner's own or a shipped mini),
    run `ops/appliance/install.sh` to set up launchd services for
    chat-daemon, notify daemon, and the Gmail agent.
11. **Tailscale Funnel** — enable Funnel on the appliance so the portal can
    reach `/chat` and `/complete` from Vercel.
12. **CHAT_DAEMON_URL / CHAT_DAEMON_SECRET** — set the Funnel URL and a
    fresh shared secret in Vercel env, matching the appliance's daemon
    config.
13. **Smoke test** — run `ops doctor <tenantId>` (or the tenant's
    `<id>-health.md` skill by hand): portal loads, webhook signature check
    returns 401 not 500, a cron endpoint fires cleanly, the chat daemon
    responds through the Funnel.

## Related docs

- `ops/RELEASE-1.0.md` — release notes, acceptance checklist, known
  limitations for v1.0.
- Generated tenant CLAUDE.md (via `ops/skills/build.js`) — the canonical
  per-tenant reference once a tenant is built.
