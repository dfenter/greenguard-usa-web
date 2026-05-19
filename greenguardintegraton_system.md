# GreenGuard USA — Unified Production Operating System

This document defines the complete SKU-based operating system for GreenGuard USA including:
- Customer and equipment model
- Full SKU catalog
- CO₂ forecasting
- Add-on system
- Dispatch intelligence (service durations)
- Stripe billing architecture
- System architecture overview

---

## CORE CUSTOMER MODEL

```json
{
  "customerId": "string",
  "name": "string",
  "email": "string",
  "phone": "string",
  "address": "string",
  "customerType": "rental | owned",
  "billingCadence": "monthly | bimonthly",
  "systems": [
    {
      "systemType": "Biogents-CO2 | Biogents-NonCO2 | Mosqitter | Tank-Only",
      "trapCount": 0,
      "tankCount": 0,
      "hasTimer": false,
      "installDate": "YYYY-MM-DD"
    }
  ],
  "addons": [],
  "notes": "string"
}
```

---

## VISIT MODEL

Separates *why* the technician is visiting from *what equipment* is involved.

```json
{
  "visitType": "installation | exchange | assessment | troubleshoot | check | barrier",
  "systemType": "Biogents-CO2 | Biogents-NonCO2 | Mosqitter | Tank-Only",
  "trapCount": 0,
  "tankCount": 0,
  "addons": [],
  "isWeekend": false
}
```

---

## SKU CATALOG

### Rental — Biogents CO₂

| SKU   | Description                        | Price    |
|-------|------------------------------------|----------|
| BG1   | 1 Biogents CO₂ trap rental/refill  | $159.99  |
| BG2   | 2 Biogents CO₂ traps rental/refill | $266.99  |
| BG3   | 3 Biogents CO₂ traps rental/refill | $399.99  |

### Rental — Mosqitter Grand

| SKU      | Description                          | Price    |
|----------|--------------------------------------|----------|
| MQ-RENT  | Mosqitter Grand rental (monthly)     | $299.99  |
| MQ-SVC   | Mosqitter Grand monthly service      | $129.99  |
| MQ-INST  | Mosqitter Grand installation + setup | $199.99  |
| MQ-TSHOOT| Mosqitter Grand troubleshooting      | $79.99   |

### Tank-Only Exchange (no trap visit)

| SKU    | Description              | Price    |
|--------|--------------------------|----------|
| TANK1  | 1 × 20 lb CO₂ exchange   | $89.99   |
| TANK2  | 2 × 20 lb CO₂ exchange   | $159.99  |
| TANK3  | 3 × 20 lb CO₂ exchange   | $249.99  |
| TANK4  | 4 × 20 lb CO₂ exchange   | $319.99  |
| TANK10 | 10 × 20 lb CO₂ exchange  | $889.98  |

### Owned Equipment Service

| SKU          | Description                     | Price       |
|--------------|---------------------------------|-------------|
| OWN-BG       | Owned Biogents service          | $10/trap    |
| OWN-MQ       | Owned Mosqitter service         | $30/trap    |
| OWN-NONCО2   | Non-CO₂ Biogents service        | $10/trap    |

### Free / Zero-Cost Visits

| SKU      | Description                    | Price  |
|----------|--------------------------------|--------|
| ASSESS   | Free property assessment       | $0     |
| CHK      | Tank refill check with client  | $0     |

### Weekend Premium

| SKU        | Description              | Price     |
|------------|--------------------------|-----------|
| WKD-SURCH  | Weekend service surcharge | +$25.00  |

---

## ADD-ON CATALOG

| SKU           | Description                              | Price   |
|---------------|------------------------------------------|---------|
| BAIT          | Generic mosquito bait refill             | $10.00  |
| BG-SWEETSCENT | BG SweetScent lure                       | $10.00  |
| CO2-ADDON     | Extra CO₂ tank add-on                    | $49.99  |
| BARRIER       | GreenGuard barrier treatment             | $49.99  |
| TRAP-INSTALL  | Extra trap installation                  | $80.00  |
| TRAP-MAINT-1  | Tank hookup + trap maintenance (1 trap)  | $29.99  |
| TRAP-MAINT-2  | Tank hookup + trap maintenance (2 traps) | $49.99  |
| TIMER-INSTALL | Timer installation                       | $29.99  |
| NONCО2-UNIT   | Non-CO₂ Biogents unit (add-on)           | $79.99  |

---

## SKU ENGINE

```javascript
function resolveSKU(visit) {
  const { visitType, systemType, trapCount, tankCount, isWeekend } = visit;

  // Free visits
  if (visitType === "assessment") return ["ASSESS"];
  if (visitType === "check")      return ["CHK"];

  let skus = [];

  // Tank-only exchanges
  if (systemType === "Tank-Only") {
    const tankMap = { 1: "TANK1", 2: "TANK2", 3: "TANK3", 4: "TANK4", 10: "TANK10" };
    skus.push(tankMap[tankCount] || "TANK1");
  }

  // Biogents CO₂ rental
  else if (systemType === "Biogents-CO2") {
    if (trapCount <= 1) skus.push("BG1");
    else if (trapCount === 2) skus.push("BG2");
    else skus.push("BG3");
  }

  // Non-CO₂ Biogents
  else if (systemType === "Biogents-NonCO2") {
    skus.push("OWN-NONCО2");
  }

  // Mosqitter
  else if (systemType === "Mosqitter") {
    if (visitType === "installation")  skus.push("MQ-INST");
    else if (visitType === "troubleshoot") skus.push("MQ-TSHOOT");
    else if (visit.customerType === "rental") skus.push("MQ-RENT");
    else skus.push("MQ-SVC");
  }

  // Weekend surcharge
  if (isWeekend) skus.push("WKD-SURCH");

  return skus;
}
```

---

## CO₂ FORECASTING

### Tank consumption per service cycle

| System          | Tanks per trap per month |
|-----------------|--------------------------|
| Biogents CO₂    | 1 × 20 lb                |
| Mosqitter Grand | 1 × 20 lb                |
| Non-CO₂ Biogents| 0                        |

### Forecasting model

```javascript
function forecastCO2(customers) {
  // Returns total 20 lb tanks needed per month
  return customers.reduce((total, c) => {
    return total + c.systems.reduce((sub, s) => {
      if (s.systemType === "Biogents-NonCO2") return sub;
      return sub + s.tankCount;
    }, 0);
  }, 0);
}
```

### Field inventory tracking
- Each tank has a status: `at-depot | in-field | in-transit`
- Tank count in field = sum of all active customer tankCounts
- Resupply trigger: depot stock < 2 weeks projected consumption

---

## DISPATCH ENGINE

### Service durations

| Visit Type                          | Duration   |
|-------------------------------------|------------|
| Property assessment                 | 30 min     |
| Tank refill check                   | 20 min     |
| Single tank exchange (TANK1)        | 30 min     |
| Two-tank exchange (TANK2)           | 45 min     |
| Three/four-tank exchange            | 60 min     |
| Bulk exchange (10 tanks)            | 90 min     |
| Biogents service (1 trap)           | 30 min     |
| Biogents service (2 traps)          | 45 min     |
| Mosqitter monthly service           | 45 min     |
| Mosqitter installation              | 90 min     |
| Mosqitter troubleshooting           | 60 min     |
| Barrier treatment                   | 30 min     |

### Dispatch time formula

```javascript
function resolveServiceDuration(visit) {
  const base = DURATION_MAP[visit.visitType][visit.systemType] || 30;
  const addonTime = visit.addons.includes("BARRIER") ? 30 : 0;
  const timerTime = visit.addons.includes("TIMER-INSTALL") ? 15 : 0;
  return base + addonTime + timerTime;
}
```

### Route optimizer integration
- Route optimizer runs every Monday morning
- Inputs: week's Cal.com appointments + service durations + depot address
- Outputs: optimized stop order per day + Google Maps URL per day
- Manual approval required before any rescheduling is applied via Cal.com API

---

## STRIPE BILLING ARCHITECTURE

### Subscription products (recurring)

| Product         | SKU(s)        | Interval    |
|-----------------|---------------|-------------|
| Biogents 1-trap | BG1           | Monthly     |
| Biogents 2-trap | BG2           | Monthly     |
| Biogents 3-trap | BG3           | Monthly     |
| Mosqitter rental| MQ-RENT       | Monthly     |
| Mosqitter svc   | MQ-SVC        | Monthly     |
| Owned Biogents  | OWN-BG        | Monthly     |
| Owned Mosqitter | OWN-MQ        | Monthly     |

### One-time products

| Product              | SKU(s)                         |
|----------------------|--------------------------------|
| Installation         | MQ-INST, TRAP-INSTALL          |
| Barrier treatment    | BARRIER                        |
| Add-ons              | BAIT, BG-SWEETSCENT, CO2-ADDON |
| Weekend surcharge    | WKD-SURCH                      |
| Property assessment  | ASSESS ($0)                    |

### Billing flow
1. Cal.com booking webhook fires on new appointment
2. SKU engine resolves SKU(s) from visit data
3. If new customer → create Stripe customer + subscription
4. If existing customer → attach add-on line items to next invoice
5. Stripe invoice auto-sends on billing date

---

## SYSTEM ARCHITECTURE

```
Cal.com
  └─ Booking webhook
       └─ SKU Engine
            ├─ Revenue calculation → Stripe
            ├─ Service duration → Dispatch / Route Optimizer
            │     └─ Google Maps API (distance matrix + directions)
            ├─ Customer record → HubSpot CRM
            └─ Tank inventory tracker
                 └─ CO₂ forecast → Resupply alerts
```

### Data sources
- **Cal.com** — scheduling, customer intake, appointment management
- **Stripe** — subscriptions, invoicing, payment
- **HubSpot** — CRM, customer history, notes
- **Google Calendar** — synced from Cal.com, used by route optimizer
- **Google Maps API** — distance matrix, route optimization, directions URLs
- **Customer CSV** — address lookup fallback for incomplete bookings

---

## SERVICE AREA

- **Depot**: 1519 Parkway, Austin, TX 78703
- **Primary area**: Austin metro (78701–78759)
- **Extended area**: Cedar Park, Driftwood, Bee Cave, West Lake Hills, Round Rock
- **Service hours**: Mon–Sat, 7am–6pm (weekend slots limited)
