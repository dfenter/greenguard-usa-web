# CO2 Timer v5.1 — As-Built Program Status

**Updated:** 2026-08-11

The board redesign is complete and the owned documentation now tracks the
as-built design: DRC **0/0**, pad oracle **172/172**, and the firmware
reference image is **~6.2 KB (see firmware README)**. Use the SHA-256 recorded
in `firmware/README.md` §3 and `SHA256SUMS`.

The current manufacturing plan is five Bittele builds/tests shipped to
GreenGuard USA for our T0-T8 bench work with the real valve and enclosure
dry-fit. The remaining 95 units stay held until written approval.

## As-built electrical design

- U5 is TPS3700DDCR powered from VM. The nominal falling trip is 7.50 V and
  release is 7.60 V.
- U6 and U7 are SN74LVC1G3157DCKR SPDT muxes. A trip takes authority over both
  bridge inputs and forces `IN1=0, IN2=1` for CLOSE.
- C1 and C19 are parallel 1000 uF / 25 V VM reservoir capacitors. They provide
  source-sag and trip-command support; they are not an unassisted full-pulse
  close-energy source.
- R6=43K sets approximately 1.49 A DRV8871 ILIM. It is deliberately oversized
  for valve margin.
- The valve is a final-assembly class specification, not a frozen MPN:
  2-way direct-acting bistable latching solenoid, 6VDC single-coil
  polarity-reversing, 1.0-1.5 mm orifice, zero minimum differential, coil
  17-30 ohm, qualified by 24-72 h CO2 bubble leak-down at 1-2 psi. Production
  MPN: `TBD — qualified sample lot`.
- The drive class is a 6 V coil from VM=7.5-12 V for 30-50 ms. The dummy load
  must match the qualified valve measured coil resistance within +/-20%.

## Mechanical decision

The Hammond 1554CGY enclosure is retained. The ordering MPN is resolved to
**Hammond 1554C2GY**, the 2-series polycarbonate IP68 part, with 3.0 mm nominal
walls. Existing panel coordinates stay unchanged. The approximately 40 mm
valve-with-barbs envelope occupies the internal rear-corner slot, and a
first-article dry-fit with the PCB, two 9 V cells, tubing, and lid is mandatory.

## Power-entry warning

J5 requires a **REGULATED 9-12 VDC adapter with <=13 V open-circuit voltage**.
This is a user-facing constraint and a build reject condition. Do not use an
unregulated adapter or try to compensate for one with a different TVS part.

## Firmware and ISP

Fuses are unchanged: low `0xE2`, high `0xC5`, extended `0xFF`. The ISP flow is
unchanged: 3.3 V target and SCK at or below 125 kHz while the RTC shares the
ISP lines. The firmware release gate force-closes when VM reads below 8.20 V
and releases when VM reads above 8.60 V sustained; the awake path requires 5 s
and the asleep WDT-hop path releases automatically within ~10 s.

## Manufacturing and validation

1. Bittele builds and tests five PCBA units.
2. GreenGuard performs incoming inspection and the 9 V / 12 V power-on tests.
3. GreenGuard runs T0 valve characterization, T1-T8 fail-safe tests, and
   graft tests G1-G3. Closure is verified by valve position or CO2 flow, not
   only by DRV8871 activity.
4. GreenGuard dry-fits the qualified valve and enclosure assembly.
5. Written approval releases the remaining 95 units.

See [TEST_PROCEDURE.md](TEST_PROCEDURE.md),
[FIRST_ARTICLE_CHECKLIST.md](FIRST_ARTICLE_CHECKLIST.md),
[FABRICATION_SPEC.md](FABRICATION_SPEC.md),
[CO2_Timer_Enclosure_Drilling_v5.md](CO2_Timer_Enclosure_Drilling_v5.md), and
[COST_DELTA.md](COST_DELTA.md) for the controlled details. The generated
`fab_package/` is kept coherent with these source documents; the firmware image,
SHA256SUMS, and archive are refreshed by the orchestrator after the source edits.

## Cost status

The legacy $9.50-$11.50 planning estimate is superseded by the Bittele
Q101474A1 V03/V04 PCBA actuals: $83.53 at 100, $59.75 at 1,000, $54.35 at
5,000, and $53.80 at 10,000. Those figures are PCBA only. The electronics
redesign delta is +$0.21 per unit. Valve, enclosure, barbs, mounting hardware,
batteries/snaps, tubing, shipping, tax, and final assembly remain separate.

## Controlled open items

- Valve production MPN: `TBD — qualified sample lot`.
- Qualified valve measured coil resistance and final pulse acceptance:
  determined at T0.
- Enclosure and final-assembly supplier pricing: `TBD — supplier quote`.
- Valve mounting hardware and tubing cut length: `TBD — first-article dry-fit`.
