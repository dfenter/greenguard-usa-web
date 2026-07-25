# CO2 Trap Timer v5 — Fabrication Handover Package

**GreenGuard USA | Timer-001 Rev 5.0 | 2026-07-10**

---

## Package Contents

| File | Description |
|---|---|
| `gerbers/` | Gerbers (Protel extensions) + Excellon drill (PTH/NPTH split) + `.gbrjob` — upload the folder (zipped) directly to the fab portal |
| `co2_timer_v5_BOM.csv` | Full BOM with MPN, manufacturer, Digi-Key #, LCSC #, and SMT/THT callout |
| `co2_timer_v5_CPL_SMT.csv` | SMT pick-and-place file, JLCPCB column format (SMT components only, top side — excludes THT refs and J3 DNP) |
| `assembly_top.pdf` | Top-side assembly drawing (F.Silkscreen + F.Fab + Edge.Cuts) |
| `assembly_bottom.pdf` | Bottom-side assembly drawing (B.Silkscreen + B.Fab + Edge.Cuts, mirrored) |
| `co2_timer_v5_schematic.pdf` | Full schematic |
| `CO2_Timer_Enclosure_Drilling_v5.md` | Enclosure drilling guide — Hammond 1554CGY, coordinates re-derived from the v5 board |
| `front_drill_template_v5.svg` | 1:1 printable front face drill template (print at 100%) |
| `FABRICATION_SPEC.md` | Full fab spec: stackup, finish, IPC class, special assembly notes, Gerber index, DRC status |
| `TEST_PROCEDURE.md` | Board test procedure + factory functional test |
| `firmware/co2_timer_v5.ino` | Arduino firmware source (ATTinyCore) |
| `firmware/pins_v5.h` | Pin map header |
| `firmware/README.md` | Build environment, fuse values, in-circuit ISP flashing via J3 |

---

## Quick Reference

- **Quantity:** Pilot = 10 boards; production = 200 boards
- **Assembly:** Full turnkey — shop sources all BOM parts and assembles SMT + THT. **No consignment parts.** U1 ships blank and is programmed in-circuit by the buyer after assembly.
- **Board:** 70 x 50 mm, 2-layer FR-4 1.6 mm, HASL lead-free (`.gbrjob` Finish = HASL-LF)
- **SMT top side (46 placements):** U1–U6, D1–D6, TVS1, TVS2, F1, SW1, SW2, C2–C14, R1–R16
- **THT hand solder (turnkey):** C1, SC1, J1, J2, J4, J5, J6 — **J3 = DNP (do not install)**
- **Enclosure:** Hammond 1554CGY (120 x 65 x 40 mm ABS, snap-fit lid)
- **Power inputs:** J5 barrel jack 9–12 V DC center-positive (TVS1 protected), J1/J6 9 V battery screw terminals. All three OR-diode isolated (D1/D4/D5, SS34) — may be connected simultaneously. All sources fused via F1 (fixes v3 battery-1-only fusing).
- **DRC:** 0 errors, 0 unconnected, 127 warnings (all cosmetic or intentional — see `FABRICATION_SPEC.md` DRC Status) — KiCad 10.0.3, 2026-07-10

> **CPL note:** `co2_timer_v5_CPL_SMT.csv` uses JLCPCB headers (Designator, Val, Package, Mid X, Mid Y, Rotation, Layer) and contains only the 46 top-side SMT placements. THT parts (C1, SC1, J1, J2, J4, J5, J6) are hand-soldered after reflow per `FABRICATION_SPEC.md` special assembly notes.

---

## What to Send the Shop

**Quote request: [N] boards, full turnkey, fully assembled (SMT + THT). No consignment.**

Send the shop this folder. The BOM includes MPN + Digi-Key # + LCSC # for every component. Resolve the `C TBD-verify` LCSC numbers flagged at the bottom of the BOM before ordering.

Use `co2_timer_v5_CPL_SMT.csv` as the SMT placement file. THT hand-solder scope (C1, SC1, J1, J2, J4, J5, J6) is defined in `FABRICATION_SPEC.md`.

**Critical assembly flags for the CM:**
- U4 (DRV8871, HSOP-8 PowerPAD) exposed pad MUST reflow to the GND thermal-via pad — a cold EP joint fails under solenoid drive current.
- J3 is DNP everywhere. Footprint stays empty on shipped boards.
- C1 and SC1 are polarized radial THT — observe silkscreen polarity.

**RFQ separation:** Submit PCB assembly and enclosure work as separate RFQs. Source the Hammond 1554CGY separately and do the front-panel milling and side/rear drilling locally per `CO2_Timer_Enclosure_Drilling_v5.md`.

---

## Buyer Actions After Assembly (In-Circuit Programming — replaces v3 consignment flow)

v5 has **no pre-programmed chip consignment**. U1 (ATtiny84A-SSU, SOIC-14) is soldered blank by the CM and programmed in-circuit through J3.

1. **Fixture:** J3 is a standard AVR-ISP-6 footprint (pin 1 = MISO, 2 = VCC, 3 = SCK, 4 = MOSI, 5 = /RESET, 6 = GND), correctly wired to the ATtiny84A ISP pins (v3's miswired header is fixed). Since J3 is DNP, use a pogo-pin adapter or temporarily fit a 2x3 header on the programming jig.
2. **Programmer settings:** 3.3 V target voltage ONLY (never 5 V — the DS3231M and 3.3 V-rail parts sit on the shared lines). SCK <= 125 kHz (`avrdude -B 8`) because the RTC shares SCK/MOSI with I2C SCL/SDA.
3. **Burn fuses first:** lfuse 0xE2, hfuse 0xC5 (WDTON + EESAVE + BOD 2.7 V), efuse 0xFF — see `firmware/README.md` Section 1 for the avrdude command and rationale.
4. **Flash:** Build `firmware/co2_timer_v5.ino` in Arduino IDE (ATTinyCore, ATtiny84, 8 MHz internal), export the HEX, flash via avrdude/USBasp on J3.
5. **After every flash:** set the clock via the front buttons — the firmware rewrites the DS3231M alarm/control registers on every boot and clears OSF.
6. **Run** `TEST_PROCEDURE.md` factory functional test on every programmed board.

> **Enclosure cutouts (buyer, not CM):** per `CO2_Timer_Enclosure_Drilling_v5.md` — front face: 32 x 14 mm display window, 2x 6 mm button holes, 12 mm barrel jack hole (>= 4 mm web between all cutouts; v3 window/jack overlap fixed); left face: J1/J6 slots; right face: J2 slot; rear face: 2x 10 mm CO2 barb holes. Print `front_drill_template_v5.svg` at 100%.

> **Pre-production bench test:** Before releasing the 200-board run, bench-test a complete pilot assembly (PCB + enclosure + bistable solenoid + CO2 pressure) through a full simulated day cycle. Confirm open at 05:30 and close at 23:30, measure sleep current in the OFF window, and verify the hardware brown-out CLOSE pulse (U5/U6 one-shot) by slow supply ramp-down. See `TEST_PROCEDURE.md`.

---

## Key Part Numbers

| Ref | Part | MPN | Digi-Key |
|---|---|---|---|
| U1 | ATtiny84A MCU (SOIC-14) | ATTINY84A-SSU | ATTINY84A-SSU-ND |
| U2 | DS3231M RTC (SO-16) | DS3231M+TRL | DS3231M+TRLCT-ND |
| U3 | MCP1703A-3302E LDO | MCP1703AT-3302E/CB | MCP1703AT-3302E/CBCT-ND |
| U4 | DRV8871 H-bridge (HSOP-8) | DRV8871DDAR | 296-44801-1-ND |
| U5 | TPS3839 2.93 V supervisor | TPS3839K33DBZR | 296-38290-1-ND |
| U6 | One-shot monostable | SN74LVC1G123DCUR | 296-10430-1-ND |
| SC1 | 1F 5.5 V supercap | PB-5R0V105-R | 283-5237-ND |
| J5 | DC barrel jack | PJ-002A | CP-002A-ND |

---

## Architecture Notes — Rev 5.0 Design Decisions

**All-source fusing:** F1 (1.1 A PPTC) sits AFTER the OR-diode junction (VIN_OR -> F1 -> VM), so every input (J1, J5, J6) is fused — v3 fused battery 1 only.

**In-circuit ISP (v3 defect fixed):** J3 is now wired to the real ATtiny84A ISP pins (PA4/PA5/PA6 + /RESET). No ZIF socket, no consignment, no DIP socket — U1 is SMT and field-reflashable through J3.

**Hardware fail-safe close:** U5 (TPS3839, 2.93 V) + U6 (one-shot, ~47 ms pulse) + D6 force a solenoid CLOSE pulse on supply collapse even with the MCU dead — CO2 cannot be left flowing after power loss.

**RTC keeps time through power loss (v3 gap fixed):** SC1 1F supercap on DS3231M VBAT, trickle-charged via R5 + D2 to ~3.05 V. Clock survives days without any power input; no coin cell to service.

**Solenoid driver:** DRV8871 (single H-bridge, HSOP-8) replaces v3's DRV8833; ILIM set to ~1.49 A via R6 = 43K. C1 raised to 470 uF low-ESR as the pulse reservoir. Bistable valve, 50 ms directed pulses, zero holding current; firmware journals commanded state in EEPROM (EESAVE) and reconciles on every boot.

**Watchdog always on:** WDTON fuse burned — ~2 s hardware watchdog cannot be disabled by firmware.

**Display / I2C separation (v3 quirk removed):** TM1637 has dedicated pins (PA7 DIO, PA3 CLK); DS3231M is on the USI I2C pins (PA6 SDA, PA4 SCL). No shared bit-bang bus.

**Input protection:** TVS1 (SMAJ15A) at the J5 input, TVS2 on the VM rail near U4 for solenoid kickback. If the wall adapter's unloaded output exceeds 15 V, substitute SMAJ18A (see BOM note) — MCP1703A VIN abs max is 16 V.

---

## Prototype Acceptance Criteria

Before committing to the 200-board run, each pilot unit must pass all of the following:

| # | Criterion | Pass condition |
|---|-----------|----------------|
| 1 | RTC keeps time with ALL power removed | Remove every input for 1 hour — time correct on repower (SC1 supercap backup; v3 lost time by design) |
| 2 | In-circuit programming | Blank board fuses + flashes via J3 pogo adapter at 3.3 V, SCK <= 125 kHz, first try |
| 3 | User can set clock | UP + SET enter time-set; auto-exit at 30 s inactivity |
| 4 | Display readable | TM1637 digits legible during ON window; display off during OFF window |
| 5 | Solenoid opens at schedule | 05:30 — 50 ms pulse, valve opens |
| 6 | Solenoid closes at schedule | 23:30 — 50 ms pulse, valve closes |
| 7 | Any power input works | Operates from J1 battery, J6 battery, and J5 adapter, individually and simultaneously |
| 8 | Sleep current | OFF window current within TEST_PROCEDURE.md limit |
| 9 | Wake from sleep | Wakes on DS3231M alarm; reconciles valve state from EEPROM journal |
| 10 | Hardware fail-safe close | Slow supply ramp-down below 2.93 V fires the U5/U6 one-shot CLOSE pulse with MCU held in reset |
| 11 | Watchdog recovery | Firmware stall (test hook) resets within ~2 s; valve state reconciled after reset |
| 12 | Enclosure closes without interference | Lid snaps closed; jack, buttons, display, and terminals all accessible; >= 4 mm web intact between all front-face cutouts |
| 13 | CO2 flow (if connected) | Flows during ON window; stops at OFF time; no leak at barb fittings |

