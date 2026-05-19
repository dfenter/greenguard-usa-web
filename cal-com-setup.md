# GreenGuard USA — Cal.com Setup Reference

This document defines every event type to create in cal.com and the custom form fields
required on each. It is the source of truth for the `EVENT_TYPE_CONFIG` GitHub Secret
used by the auto-billing script.

---

## How Billing Works

```
Customer books in cal.com
  ↓
3 days after appointment date, GitHub Actions cron runs
  ↓
SKU engine resolves charge(s) from booking data
  ↓
Recurring SKU  → Stripe Subscription (created if not already active)
One-time SKU   → Stripe InvoiceItem (swept into next subscription invoice)
Free visit     → Skipped
```

---

## Event Types to Create in Cal.com

Create one event type per row. After creating each, copy its ID from the URL
(`cal.com/event-types/<ID>`) into the `EVENT_TYPE_CONFIG` secret.

### Returning-Customer Event Types
*(Payment disabled in cal.com — billed automatically by script)*

| Event Type Name | Primary SKU | visitType | systemType | customerType |
|---|---|---|---|---|
| Biogents CO₂ Service – 1 Trap | BG1 | exchange | Biogents-CO2 | rental |
| Biogents CO₂ Service – 2 Traps | BG2 | exchange | Biogents-CO2 | rental |
| Biogents CO₂ Service – 3 Traps | BG3 | exchange | Biogents-CO2 | rental |
| Mosqitter Grand Monthly Service | MQ-RENT | exchange | Mosqitter | rental |
| Mosqitter Grand Service (Owned) | MQ-SVC | exchange | Mosqitter | owned |
| Mosqitter Grand Installation | MQ-INST | installation | Mosqitter | rental |
| Mosqitter Grand Troubleshooting | MQ-TSHOOT | troubleshoot | Mosqitter | rental |
| CO₂ Tank Exchange – 1 Tank | TANK1 | exchange | Tank-Only | — |
| CO₂ Tank Exchange – 2 Tanks | TANK2 | exchange | Tank-Only | — |
| CO₂ Tank Exchange – 3 Tanks | TANK3 | exchange | Tank-Only | — |
| CO₂ Tank Exchange – 4 Tanks | TANK4 | exchange | Tank-Only | — |
| Owned Biogents Service | OWN-BG | exchange | Biogents-CO2 | owned |
| Owned Mosqitter Service | OWN-MQ | exchange | Mosqitter | owned |
| Property Assessment | ASSESS | assessment | — | — |
| Tank Refill Check | CHK | check | — | — |

### First-Booking Event Types
*(Payment enabled in cal.com — Stripe Checkout collects and saves card)*
*(Do NOT add these to `EVENT_TYPE_CONFIG` — they are excluded to prevent double-charging)*

| Event Type Name | Notes |
|---|---|
| New Customer Setup | Customer pays first appointment; card saved for future auto-billing |
| Free 7-Day Trial | $0, no Stripe charge |

---

## Required Custom Form Fields

Add these as custom questions on **every returning-customer event type above**.
The field slugs must match exactly — the billing script reads them by slug from
`bookingFieldsResponses`.

| Field Label | Field Slug | Type | Required | Notes |
|---|---|---|---|---|
| Number of Traps | `trapCount` | Number | No | Default 1. Used for per-trap pricing (OWN-BG, OWN-MQ). |
| Number of Tanks | `tankCount` | Number | No | Default 1. Used for Tank-Only events. |
| Add-On Services | `addons` | Multi-select | No | Options listed below. |

### Add-On Options for the `addons` Multi-Select Field

| Display Label | Value (SKU) | Price |
|---|---|---|
| Barrier Treatment | BARRIER | $49.99 |
| BG SweetScent Lure | BG-SWEETSCENT | $10.00 |
| Extra CO₂ Tank | CO2-ADDON | $49.99 |
| Tank Hookup + Maintenance (1 trap) | TRAP-MAINT-1 | $29.99 |
| Tank Hookup + Maintenance (2 traps) | TRAP-MAINT-2 | $49.99 |
| Timer Installation | TIMER-INSTALL | $29.99 |
| Non-CO₂ Biogents Unit | NONCO2-UNIT | $79.99 |
| Bait Refill | BAIT | $10.00 |

> **Weekend surcharge** (`WKD-SURCH`, +$25.00) is applied automatically based on the
> booking date — no form field needed.

---

## `EVENT_TYPE_CONFIG` GitHub Secret

After creating your event types in cal.com, populate this secret with the JSON below,
replacing `<ID>` with the actual event type ID from each event type's URL.

```json
{
  "<ID_BG1>":     {"sku": "BG1",      "visitType": "exchange",      "systemType": "Biogents-CO2",  "customerType": "rental"},
  "<ID_BG2>":     {"sku": "BG2",      "visitType": "exchange",      "systemType": "Biogents-CO2",  "customerType": "rental"},
  "<ID_BG3>":     {"sku": "BG3",      "visitType": "exchange",      "systemType": "Biogents-CO2",  "customerType": "rental"},
  "<ID_MQRENT>":  {"sku": "MQ-RENT",  "visitType": "exchange",      "systemType": "Mosqitter",     "customerType": "rental"},
  "<ID_MQSVC>":   {"sku": "MQ-SVC",   "visitType": "exchange",      "systemType": "Mosqitter",     "customerType": "owned"},
  "<ID_MQINST>":  {"sku": "MQ-INST",  "visitType": "installation",  "systemType": "Mosqitter",     "customerType": "rental"},
  "<ID_MQTSH>":   {"sku": "MQ-TSHOOT","visitType": "troubleshoot",  "systemType": "Mosqitter",     "customerType": "rental"},
  "<ID_TANK1>":   {"sku": "TANK1",    "visitType": "exchange",      "systemType": "Tank-Only"},
  "<ID_TANK2>":   {"sku": "TANK2",    "visitType": "exchange",      "systemType": "Tank-Only"},
  "<ID_TANK3>":   {"sku": "TANK3",    "visitType": "exchange",      "systemType": "Tank-Only"},
  "<ID_TANK4>":   {"sku": "TANK4",    "visitType": "exchange",      "systemType": "Tank-Only"},
  "<ID_OWNBG>":   {"sku": "OWN-BG",   "visitType": "exchange",      "systemType": "Biogents-CO2",  "customerType": "owned"},
  "<ID_OWNMQ>":   {"sku": "OWN-MQ",   "visitType": "exchange",      "systemType": "Mosqitter",     "customerType": "owned"},
  "<ID_ASSESS>":  {"sku": "ASSESS",   "visitType": "assessment"},
  "<ID_CHK>":     {"sku": "CHK",      "visitType": "check"}
}
```

---

## `STRIPE_PRICE_MAP` GitHub Secret

Run `_scripts/stripe_setup.py` once with your Stripe secret key to create all
Products and Prices. The script prints the JSON to paste here.

```
STRIPE_SECRET_KEY=sk_live_... python3 _scripts/stripe_setup.py
```

---

## Service Duration Reference (for cal.com event durations)

| Event Type | Duration |
|---|---|
| Property assessment | 30 min |
| Tank refill check | 20 min |
| CO₂ Tank Exchange – 1 tank | 30 min |
| CO₂ Tank Exchange – 2 tanks | 45 min |
| CO₂ Tank Exchange – 3 or 4 tanks | 60 min |
| Biogents CO₂ Service – 1 trap | 30 min |
| Biogents CO₂ Service – 2 traps | 45 min |
| Mosqitter Grand monthly service | 45 min |
| Mosqitter Grand installation | 90 min |
| Mosqitter Grand troubleshooting | 60 min |
| + Barrier treatment add-on | +30 min |
| + Timer installation add-on | +15 min |

---

## Depot & Service Area

- **Depot**: 1519 Parkway, Austin, TX 78703
- **Primary**: Austin metro (78701–78759)
- **Extended**: Cedar Park, Driftwood, Bee Cave, West Lake Hills, Round Rock
- **Hours**: Mon–Sat, 7 AM–6 PM (weekend slots limited)
