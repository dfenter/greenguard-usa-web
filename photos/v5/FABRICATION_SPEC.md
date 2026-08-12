# CO2 Trap Timer v5.1 — Fabrication Specification

**GreenGuard USA | Timer-001 Rev 5.1 | 2026-08-11**

This specification follows the 2026-08-11 as-built NETLIST and BOM. The
generated `fab_package/` copy is rebuilt separately after this source document
is approved.

## PCB fabrication

| Parameter | Requirement |
|---|---|
| Board dimensions | 70 x 50 mm |
| Layers | 2: F.Cu + B.Cu |
| Material | FR-4, Tg >= 130 C |
| Board thickness | 1.6 mm |
| Copper weight | 1 oz / 35 um, both layers |
| Minimum trace width | 0.20 mm; use >=1 mm for VM and solenoid-current paths |
| Minimum trace spacing | 0.20 mm |
| Surface finish | ENIG (per Bittele quote) |
| Solder mask | Green, both sides |
| Silkscreen | White, both sides |
| IPC class | Class 2 |
| Edge finish | Routed, no V-score |
| Controlled impedance | None required |

The generated `gerbers/co2_timer_v5-job.gbrjob` finish field is set to `ENIG`
post-export; verify this generated artifact before upload.

As-built verification: DRC is 0 errors / 0 unconnected and the pad oracle is
172/172. Do not regenerate from the superseded pre-redesign reference set.

## Assembly scope and reference inventory

### Bittele / PCBA lane

- SMT: U1-U7, D1-D5, TVS1/TVS2, F1, SW1/SW2, C2-C7, C9-C12, C14, C18,
  and R1-R18.
- THT hand-solder: C1, C19, SC1, J1, J2, J4, J5, and J6.
- J3 is DNP and is for the ISP fixture only.

### Special assembly notes

- **U3 MCP1703A-3302E/CB:** pin 1 GND, pin 2 VOUT=`+3V3`, pin 3 VIN=`VM`.
  Do not reverse the SOT-23A VIN/VOUT assignment.
- **U4 DRV8871DDAR:** solder the exposed pad to the board GND thermal pad
  with the specified thermal-via field. Pin 7 is PGND/GND.
- **U5 TPS3700DDCR:** mount the SOT-23-6 in the verified orientation. It is
  powered directly from VM and uses R13=180K 1% and R16=10K 1% for the
  approximately 7.50 V falling trip and 7.60 V release; T1 acceptance is
  falling **7.21–7.75 V** and rising **7.38–7.82 V**, including the 1% divider
  and TI threshold corners.
- **U6/U7 SN74LVC1G3157DCKR:** verify both muxes and `/VM_OK` routing. A
  healthy rail passes the MCU inputs; a supervisor trip selects the fixed
  close levels `IN1=0, IN2=1`.
- **C1/C19:** each is EEU-FR1E102, 1000 uF / 25 V / 105 C, D10 x 20 mm,
  P5.00 mm. Hand-solder vertically, observe polarity, and preserve the
  as-built VM-side clearance. The pair is reservoir/sag support, not a claim
  of unassisted valve closure after source removal.
- **SC1:** use the as-built CDA CHP5R5L104R-TW, 0.1 F / 5.5 V, 10 x 5 x 12
  mm, P7.50 mm vertical radial part. Observe polarity and the R5/D2 charge
  path.
- **J3:** do not populate on shipped boards. The ISP flow remains 3.3 V only,
  with SCK at or below 125 kHz.
- **J5:** center-positive PJ-002A barrel jack, hand-soldered. It requires a
  **REGULATED 9-12 VDC adapter with <=13 V open-circuit voltage**. Print this
  line on the user-facing product/assembly note: **"J5: REGULATED 9-12 VDC
  ONLY; <=13 V OCV."** An adapter with the wrong open-circuit behavior is a
  system-level reject; do not try to solve it by changing the TVS selection.
- **TVS1/TVS2:** retain SMAJ15A as specified by the BOM. TVS1 protects the
  barrel-input side and TVS2 protects VM. The regulated-adapter constraint is
  mandatory because the regulator and TVS operating limits still apply.
- **D2/D3:** BAT54WS-7-F on SOD-323 lands. D2 is the RTC charge-path diode;
  D3 is advisory `/ALERT` isolation from `/VM_OK`.

## Fail-safe electrical integration

The board-level chain is:

1. TPS3700DDCR senses VM through R13/R16.
2. At the approximately 7.50 V falling trip, `/VM_OK` goes low.
3. U6 forces DRV_IN1 low and U7 forces DRV_IN2 high.
4. DRV8871 receives the close command and remains in that commanded state
   while VM is below the approximately 7.60 V release condition.

The valve is a separate final-assembly item, not a Bittele PCBA item. Its
class specification is: **2-way direct-acting bistable latching solenoid,
6VDC single-coil polarity-reversing, 1.0-1.5 mm orifice, zero minimum
differential, coil 17-30 ohm**, qualified by **24-72 h CO2 bubble leak-down at
1-2 psi**. Production MPN is `TBD — qualified sample lot`.

The drive class is a 6 V coil from VM=7.5-12 V for 30-50 ms. R6=43K sets
approximately 1.49 A ILIM; this is deliberately oversized for margin. Do not
select a valve or dummy by an invented resistance value: the dummy must match
the qualified valve measured coil resistance within +/-20%.

## Mechanical interface handoff

Use the root `CO2_Timer_Enclosure_Drilling_v5.md` as the current drilling
source. The retained enclosure is the Hammond 1554CGY family, resolved to
ordering MPN **Hammond 1554C2GY**, 2-series polycarbonate IP68, 120 x 65 x 40
mm, with 3.0 mm nominal walls. Keep the existing panel coordinates. The
internal micro valve is approximately 40 mm with barbs and must be dry-fitted
in the rear-corner slot with two 6 mm barb fittings, tubing, the PCB, and both
9 V cells before production release.

## Mounting and layout constraints

- Four M3 clearance holes at the as-built PCB corner positions: (3,3),
  (67,3), (3,47), and (67,47) mm.
- Preserve the C1/C19 vertical-can clearance and the 10 mm standoff envelope.
- Keep the U4 exposed-pad thermal-via field and wide VM/solenoid paths clear of
  solder-mask or mechanical obstructions.
- Keep J5, SW1, SW2, and J4 at the front edge; J1, J2, and J6 remain internal
  wiring points as documented by the enclosure source.

## DRC and release record

| Check | Current result |
|---|---|
| DRC errors / unconnected | 0 / 0 |
| DRC warnings (accepted) | 129 — 58 lib-footprint mismatch (footprints are generated inline under library names; intentional), 39 dangling vias (plane-connected, no broken nets — verified), 15 silk overlaps, 12 silk-over-copper, 5 lib-footprint issues (same inline-generation cause) |
| Pad oracle | 172 / 172 |
| Board revision | 2026-08-12 as-built |
| Generated package | Rebuild after source-document approval |
