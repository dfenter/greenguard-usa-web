# CO2 Timer v5.1 — Cost Reconciliation

**GreenGuard USA | Timer-001 | 2026-08-11**

This document separates the Bittele PCBA line from the finished product. The
Bittele numbers below cover PCBA only; they do not include the valve, Hammond
enclosure, barbs, mounting hardware, batteries, snaps, tubing, or final
assembly labor.

## Current cost records

| Record | Quantity tier | Amount | Scope |
|---|---:|---:|---|
| Legacy planning estimate | 500 | $9.50-$11.50 / unit | Superseded electronics estimate; not a Bittele quote |
| Bittele Q101474A1 V03/V04 | 100 | $83.53 / unit | PCBA only |
| Bittele Q101474A1 V03/V04 | 1,000 | $59.75 / unit | PCBA only |
| Bittele Q101474A1 V03/V04 | 5,000 | $54.35 / unit | PCBA only |
| Bittele Q101474A1 V03/V04 | 10,000 | $53.80 / unit | PCBA only |

The current `co2_timer_v5_BOM.csv` hardware-lane rows sum to **$12.57 at
qty200**, excluding the DNP J3 row. That distributor-style component estimate
is not interchangeable with the Bittele PCBA quote and is not added to it.

## Redesign delta

The adopted redesign delta is **+$0.21 per electronics unit** relative to the
superseded v5 electronics concept. This is the decision-file delta for the
following as-built changes:

- VM supervision is TPS3700DDCR with the 180K/10K divider at the approximately
  7.50 V falling trip and 7.60 V release.
- Dual SN74LVC1G3157DCKR muxes own both bridge inputs and force `IN1=0,
  IN2=1` on a supervisor trip.
- The VM reservoir is C1+C19, two 1000 uF / 25 V capacitors.
- The old timing-dependent takeover parts and deleted references are absent.

R6=43K produces approximately 1.49 A ILIM. That current limit is deliberately
oversized for valve margin; it is not a promise that the final valve draws
1.49 A. The final valve current and pulse are gated by T0 qualification.

## Final-assembly additions — NOT Bittele scope

These items are outside every Bittele PCBA amount above and are not included in
the electronics delta unless separately stated.

| Item | Current requirement | Cost status |
|---|---|---|
| Valve | Class specification; production MPN `TBD — qualified sample lot`; estimated $4-$7 at volume | $4-$7 at volume for the class estimate; qualification required |
| Enclosure | Hammond 1554C2GY, retained 1554CGY family, polycarbonate IP68 | `TBD — supplier quote` |
| CO2 barbs | 2 x 6 mm barb fittings | `TBD — supplier quote` |
| Valve mounting | Bracket, fasteners, or approved mounting pad for the qualified sample | `TBD — first-article dry-fit / supplier quote` |
| Battery supply | 2 x 9 V battery plus snap | `TBD — supplier quote` |
| Tubing | Tubing sized for the 6 mm barbs; exact cut length set during dry-fit | `TBD — first-article dry-fit / supplier quote` |

The finished-unit calculation is therefore:

```text
finished unit = Bittele PCBA quote at the selected tier
              + final-assembly additions above
              + shipping, tax, and assembly labor when quoted
```

No finished-unit total is asserted until the valve sample lot, enclosure,
fittings, mounting hardware, battery snaps, and tubing are quoted and the
first-article dry-fit passes.

## Cost decisions

- Retain the Bittele PCBA comparison exactly as quoted; do not describe it as
  an enclosure or box-build price.
- Retain the +$0.21 electronics redesign delta.
- Carry the valve as a class estimate only. Its production MPN and measured
  coil resistance remain `TBD — qualified sample lot` until T0.
- Do not roll unquoted final-assembly items into a false BOM total.
