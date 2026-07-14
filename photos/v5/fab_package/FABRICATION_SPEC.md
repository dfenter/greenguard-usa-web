# CO2 Trap Timer v5 — Fabrication Specification

**GreenGuard USA | Timer-001 Rev 5.0 | 2026-07-09**

---

## PCB Fabrication

| Parameter | Requirement |
|---|---|
| Board dimensions | 70 x 50 mm |
| Layers | 2 (F.Cu + B.Cu) |
| Material | FR-4, Tg >= 130 C |
| Board thickness | 1.6 mm |
| Copper weight | 1 oz (35 um) both layers |
| Min trace width | 0.20 mm |
| Min trace spacing | 0.20 mm |
| Min drill (PTH) | 0.30 mm drill / 0.50 mm pad |
| Min drill (NPTH) | 0.80 mm |
| Surface finish | HASL lead-free (ENIG on request) |
| Solder mask | Green, both sides |
| Silkscreen | White, both sides |
| IPC class | Class 2 |
| Edge finish | Routed, no V-score |
| Controlled impedance | None required |
| Pilot quantity | 10 boards |
| Production quantity | 200 boards |

---

## PCB Assembly

| Parameter | Requirement |
|---|---|
| SMT side | Top (F.Cu) only |
| SMT components | U1, U2, U3, U4, U5, U6, D1–D6, TVS1, TVS2, F1, SW1, SW2, C2–C14, R1–R16 |
| THT components | C1, J1, J2, J4, J5, J6 (turnkey) — J3 = DNP, do not install, SC1 |
| Solder paste | SAC305 or equivalent no-clean |
| Reflow profile | Per IPC J-STD-020, component Tg >= 260 C peak |
| IPC class | Class 2 |

Note on refdes list: the SMT and THT rows above are verified against `co2_timer_v5_BOM.csv`. SC1 (supercap, radial can) is THT hand-solder alongside C1 — see the special assembly notes. J3 is intentionally omitted from all assembly rows (DNP — present on programming jig only).

### Special assembly notes

- **U1 (ATtiny84A-SSU, SOIC-14, SMT):** U1 is placed and reflowed with the rest of the SMT components in the normal pick-and-place run. The buyer programs U1 IN-CIRCUIT after board assembly via J3 (programming jig). Do not consign pre-programmed chips; do not use a socket. WDTON fuse must be burned by the buyer during in-circuit programming (always-on ~2 s watchdog). Program at 3.3 V only (J3.2 = VCC rail); never program at 5 V. Program SCK <= 125 kHz because the DS3231M (U2) sits on the I2C/ISP-shared bus during programming.

- **U4 (DRV8871DDAR, HSOP-8 PowerPAD):** The exposed thermal pad (PAD, electrically GND) on the underside of U4 MUST be soldered to the GND thermal pad on the PCB. The GND pad under U4 must be backed by a grid of thermal vias stitching to the B.Cu GND pour. Confirm the reflow profile achieves solder paste collapse under the exposed pad. A cold joint or missing EP bond will cause U4 to fail under solenoid drive current.

- **J3 (ISP header, 2x3, 2.54 mm):** DNP in all production and pilot assemblies. J3 is present on the PCB footprint and is wired correctly for in-circuit programming (pin 1=MISO, pin 2=VCC, pin 3=SCK, pin 4=MOSI, pin 5=/RESET, pin 6=GND). It is installed only on the buyer's programming jig boards, not on shipped product. Do not populate J3. Do not include J3 in the THT hand-solder step.

- **C1 (470 uF / 16 V / 105 C, radial THT electrolytic):** Hand solder after reflow. Observe polarity: positive lead to square pad (marked + on silkscreen). 470 uF low-ESR 105 C grade required (solenoid pulse reservoir; replaces v3 100 uF). Verify ESR <= 100 mohm.

- **SC1 (1F / 5.5 V supercap, radial THT):** Hand solder after reflow. Observe polarity per silkscreen. Eaton PB-5R0V105-R or KEMET FT0H105ZF (verify body dimensions fit footprint CP_Radial_D14.0mm_P5.00mm before order). SC1 provides RTC (U2) VBAT backup; trickle-charged via R5 + D2 to approximately 3.05 V, which is within the DS3231M VBAT range of 2.3–5.5 V.

- **J1, J2, J6 (screw terminals, 5.08 mm pitch):** Angled connectors. All three connect to components enclosed INSIDE the case (no wall penetrations): J1 = BAT1 (internal 9 V cell in a base-tray clip), J6 = BAT2 (internal 9 V cell), J2 = solenoid (internal bistable valve, tubing to the rear CO₂ barbs). Silkscreen polarity: J1/J6 marked +/-, J2 marked SOL+/SOL-. See CO2_Timer_Enclosure_Drilling_v5.md → Internal Component Layout.

- **J4 (1x4, 2.54 mm pin header, TM1637 display connector):** Hand solder. Front face per enclosure drilling doc (X = 18 mm from front edge). Pin 1 = VCC, pin 2 = GND, pin 3 = TM_DIO (PA7), pin 4 = TM_CLK (PA3).

- **J5 (DC barrel jack, 5.5/2.1 mm):** Hand solder. Center positive. Front face per enclosure drilling doc (X = 52 mm, Y = 20 mm). Pin 3 (insertion switch) ties to GND. Install protective rubber dust cap after assembly. Verify DC-005 footprint pin order against LCSC part before order (PJ-002A or compatible).

- **TVS1 / TVS2 (SMAJ15A, DO-214AC):** SMT. TVS1 is placed at J5 input (15 V standoff; MCP1703A VIN abs max is 16 V — if the specified DC adapter has an unloaded open-circuit voltage > 15 V, upgrade TVS1 to SMAJ18A and re-verify MCP1703A margin). TVS2 is placed on the VM rail near U4 to clamp inductive solenoid kickback.

- **D1, D4, D5 (SS34, DO-214AC):** SMT. OR-diode power input network. Reversed diodes will block input power entirely. Cathode to VIN_OR per silkscreen.

- **D2, D3, D6 (BAT54, SOD-123):** SMT. D2: supercap trickle-charge series diode. D3: TPS3839 push-pull supervisor isolation into open-drain /ALERT net (anode = /ALERT, cathode = /SUPV). D6: one-shot Q to DRV_IN2 diode-OR (anode = ONESHOT_Q, cathode = DRV_IN2). Observe polarity per silkscreen.

- **SW1, SW2 (6x6 mm SMD tact):** SMT; replaces v3 THT switches. SW1 = UP (front face, X = 18 mm, Y = 30 mm from top-left). SW2 = SET (X = 34 mm, Y = 30 mm). Silkscreen labels: UP and SET.

- **CPL note:** Use the SMT-only CPL file (excluding THT refdes and J3 DNP) for the SMT placement run. THT assembly (C1, SC1, J1, J2, J4, J5, J6) is covered separately.

---

## Mechanical

| Parameter | Value |
|---|---|
| Mounting holes | 4x M3 clearance (3.2 mm dia), 4x 10 mm standoffs |
| Mounting hole positions | 3 mm from each corner: (3,3), (67,3), (3,47), (67,47) |
| Target enclosure | Hammond 1554CGY (120 x 65 x 40 mm ABS) |
| PCB clearance in enclosure | 21 mm L/R, 3.5 mm T/B |

---

## Layout Requirements

- **U4 PowerPAD:** Thermal via grid under the HSOP-8 exposed pad, stitching to B.Cu GND pour. Verify paste aperture in the stencil covers the pad fully. See special assembly note above.
- **Power traces (VM, VIN_OR, SOL_OUT1, SOL_OUT2, VBAT1_IN, VBAT2_IN, VIN_DC):** Minimum 1 mm trace width.
- **B.Cu:** Full GND copper pour with stitching vias throughout.
- **Decoupling caps:** Place at the supply pin of each IC (C6 at U1 pin 1, C7 at U2 pin 2, C2/C3 at U3 pins 2/3, C4/C5 at U4 pin 5, C13 at U5 pin 3, C8 at U6 pin 8).
- **C1 and SC1:** Radial THT bodies; ensure clearance for D10 mm (C1) and D14 mm (SC1) cans.
- **J3 footprint:** Retain on PCB copper and silkscreen; DNP per assembly doc.

---

## Gerber File Index

Exported with KiCad 10.0.3 `kicad-cli` (Protel extensions, soldermask subtracted from silkscreen, Excellon drill in mm, separate PTH/NPTH). All files in `gerbers/`.

| File | Layer |
|---|---|
| `co2_timer_v5-F_Cu.gtl` | Front copper |
| `co2_timer_v5-B_Cu.gbl` | Back copper |
| `co2_timer_v5-F_Mask.gts` | Front solder mask |
| `co2_timer_v5-B_Mask.gbs` | Back solder mask |
| `co2_timer_v5-F_Paste.gtp` | Front solder paste (stencil) |
| `co2_timer_v5-F_Silkscreen.gto` | Front silkscreen |
| `co2_timer_v5-B_Silkscreen.gbo` | Back silkscreen |
| `co2_timer_v5-Edge_Cuts.gm1` | Board outline |
| `co2_timer_v5-PTH.drl` | Plated through-holes (Excellon, mm) |
| `co2_timer_v5-NPTH.drl` | Non-plated holes (Excellon, mm) |
| `co2_timer_v5-job.gbrjob` | Gerber job file (Finish = HASL-LF) |

---

## DRC Status

| Check | Result |
|---|---|
| Unconnected nets | **0** |
| Physical violations (errors) | **0** |
| Warnings | 127 — all cosmetic or intentional: 54 lib_footprint_mismatch + 7 lib_footprint_issues (script-generated footprints diverge from stock library entries by design), 24 via_dangling (GND stitching vias into the B.Cu pour, intentional), 23 silk_over_copper + 19 silk_overlap (cosmetic silkscreen only) |
| Tool / version | KiCad 10.0.3 (`kicad-cli pcb drc`) |
| Date of DRC run | 2026-07-10 |
