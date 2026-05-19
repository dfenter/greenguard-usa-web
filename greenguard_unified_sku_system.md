# 🧭 GreenGuard USA — Unified Production Operating System (FINAL REVISION)

This file contains the full SKU-based operating system including:
- Rental SKUs (Biogents + Mosqitter)
- Owned service model
- Unified SKU engine
- CO₂ forecasting
- Add-on system
- Dispatch intelligence
- Stripe billing architecture
- System architecture overview

---

## 🧾 CORE MODEL
{
  "customerType": "rental | owned",
  "systemType": "Biogents | Mosqitter",
  "trapCount": 0,
  "co2TankCount": 0,
  "addons": [],
  "address": "string",
  "serviceType": "installation | monthly-service | tank-refill | property-assessment"
}

---

## 🪤 RENTAL PRICING

Biogents:
- BG1: $159.99
- BG2: $266.99
- BG3: $399.99

Mosqitter:
- MQ1: $299.99 per unit

---

## ⚙️ SKU ENGINE
function resolveSKU(customer) {
  const { customerType, systemType, trapCount } = customer;

  if (customerType === "rental") {
    if (systemType === "Biogents") {
      if (trapCount <= 1) return "BG1";
      if (trapCount === 2) return "BG2";
      return "BG3";
    }

    if (systemType === "Mosqitter") return "MQ1";
  }

  return "OWNED_BASE";
}

---

## 💰 OWNED MODEL
Biogents: $10/trap
Mosqitter: $30/trap

---

## 🧪 CO₂ MODEL
Biogents: 0.25 per trap
Mosqitter: 0.35 per trap

---

## 🌿 ADD-ONS
- Bait Pack: $10
- CO₂ Tank Add-On: $49.99
- Extra Trap Installation: $80
- GreenGuard Barrier Treatment: $49.99

---

## 🧠 REVENUE ENGINE
Base SKU + Add-ons

---

## ⚙️ DISPATCH ENGINE
Time = base service + trap load

---

## 💳 STRIPE MODEL
SKU-based billing + add-ons

---

## 🧭 ARCHITECTURE
Cal.com → Webhook → SKU Engine → Revenue → Dispatch → Stripe → HubSpot
