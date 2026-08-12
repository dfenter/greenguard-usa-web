# CO2 Trap Timer v5 — Fabrication Handover Package

**GreenGuard USA | Timer-001 Rev 5.1 | 2026-08-11**

> Rev 5.1 supersedes the 2026-07-10 package: fail-safe chain redesigned (TPS3700 VM
> supervisor + SN74LVC1G3157 takeover muxes replace the prior supervisor/monostable/
> diode-OR chain),
> U3 regulator pinout corrected, C1 -> 2x 1000 uF, SC1 resized, diode packages fixed
> to SOD-323, firmware updated + compiled (HEX INCLUDED in `firmware/`).

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
| `firmware/CO2_Timer_v5_ATtiny84A_8MHz.hex` | **Production firmware image** (2026-08-12 build, 6,492 B, SHA-256 `64b0808e…4453`) — flash THIS, do not rebuild |
| `firmware/README.md` | Build environment, fuse values, in-circuit ISP flashing via J3 |

---

## Quick Reference

- **Quantity:** 100 boards (Bittele Q101474A1) — fab all 100, **assemble + functionally test the first 5 only** (first-article hold), ship the 5 for design validation, hold the remaining 95 for written approval.
- **Assembly:** Full turnkey — shop sources all BOM parts and assembles SMT + THT. **No consignment parts.** U1 ships blank and is programmed in-circuit per the delivered HEX + fuse settings.
- **Board:** 70 x 50 mm, 2-layer FR-4 1.6 mm, ENIG (per Bittele quote)
- **SMT top side (47 placements):** see `co2_timer_v5_CPL_SMT.csv` — includes U5 (TPS3700, SOT-23-6) and U6/U7 (SN74LVC1G3157, SC-70-6); D2/D3 are SOD-323
- **THT hand solder (turnkey):** C1, C19, SC1, J1, J2, J4, J5, J6 — **J3 = DNP (do not install)**
- **Enclosure (buyer scope, not CM):** Hammond 1554C2GY (120 x 65 x 40 mm polycarbonate IP68, gasketed) — see `CO2_Timer_Enclosure_Drilling_v5.md`
- **Power inputs:** J5 barrel jack 9–12 V DC center-positive, **REGULATED adapter only (≤13 V open-circuit)** — TVS1 protected; J1/J6 9 V battery screw terminals. All three OR-diode isolated (D1/D4/D5, SS34) — may be connected simultaneously. All sources fused via F1.
- **DRC:** 0 errors, 0 unconnected; remaining warnings are primarily inline
  footprint naming, silk overlaps, and plane-connected vias — KiCad 10.0.3,
  2026-08-11. Pad-net oracle: 172/172 PASS.

> **CPL note:** `co2_timer_v5_CPL_SMT.csv` uses Designator, Val, Package, Mid X, Mid Y, Rotation, Layer headers and contains only the 47 top-side SMT placements (KiCad plot origin, Y negative-down — confirm coordinate convention with the CM before line setup). Test points TP1–TP3 are bare PCB pads, intentionally absent from both CPL and BOM. THT parts (C1, C19, SC1, J1, J2, J4, J5, J6) are hand-soldered after reflow per `FABRICATION_SPEC.md` special assembly notes.

---

## What to Send the Shop

**Order: 100 boards, full turnkey (SMT + THT), first-article hold at 5 units. No consignment.**

Send the shop this folder. The BOM includes MPN + Digi-Key # + LCSC # for every component. Resolve the `C TBD-verify` LCSC numbers flagged at the bottom of the BOM before ordering.

Use `co2_timer_v5_CPL_SMT.csv` as the SMT placement file. THT hand-solder scope (C1, SC1, J1, J2, J4, J5, J6) is defined in `FABRICATION_SPEC.md`.

**Critical assembly flags for the CM:**
- U4 (DRV8871, HSOP-8 PowerPAD) exposed pad MUST reflow to the GND thermal-via pad — a cold EP joint fails under solenoid drive current.
- J3 is DNP everywhere. Footprint stays empty on shipped boards.
- C1 and C19 (2x 1000 uF, D10/P5.0) and SC1 (0.1 F supercap) are polarized radial THT — observe silkscreen polarity.

**RFQ separation:** Submit PCB assembly and enclosure work as separate RFQs. Source the Hammond 1554CGY separately and do the front-panel milling and side/rear drilling locally per `CO2_Timer_Enclosure_Drilling_v5.md`.

---

## Buyer Actions After Assembly (In-Circuit Programming — replaces v3 consignment flow)

v5 has **no pre-programmed chip consignment**. U1 (ATtiny84A-SSU, SOIC-14) is soldered blank by the CM and programmed in-circuit through J3.

1. **Fixture:** J3 is a standard AVR-ISP-6 footprint (pin 1 = MISO, 2 = VCC, 3 = SCK, 4 = MOSI, 5 = /RESET, 6 = GND), correctly wired to the ATtiny84A ISP pins (v3's miswired header is fixed). Since J3 is DNP, use a pogo-pin adapter or temporarily fit a 2x3 header on the programming jig.
2. **Programmer settings:** 3.3 V target voltage ONLY (never 5 V — the DS3231M and 3.3 V-rail parts sit on the shared lines). SCK <= 125 kHz (`avrdude -B 8`) because the RTC shares SCK/MOSI with I2C SCL/SDA.
3. **Burn fuses first:** lfuse 0xE2, hfuse 0xC5 (WDTON + EESAVE + BOD 2.7 V), efuse 0xFF — see `firmware/README.md` Section 1 for the avrdude command and rationale.
4. **Flash the delivered image:** `firmware/CO2_Timer_v5_ATtiny84A_8MHz.hex` (verify SHA-256 `64b0808ea20a9fdfb8e63ff79032c40ef1e266e1793a5ae4640142e677814453`). Do NOT rebuild from source for production; the source + arduino-cli command in `firmware/README.md` exist for traceability.
5. **After every flash:** set the clock via the front buttons — the firmware rewrites the DS3231M alarm/control registers on every boot and clears OSF.
6. **Run** `TEST_PROCEDURE.md` factory functional test on every programmed board.

> **Enclosure cutouts (buyer, not CM):** per `CO2_Timer_Enclosure_Drilling_v5.md` — front face only: 32 x 14 mm display window, 2x 6 mm button holes, 12 mm barrel jack hole (>= 4 mm web between all cutouts); rear face: 2x 10 mm CO2 barb holes. **No side-wall penetrations — batteries and valve are fully internal** (lid = service access). Print `front_drill_template_v5.svg` at 100%.

> **First-article bench test:** Before releasing the 95-board balance, run the full T0–T8 series in `TEST_PROCEDURE.md` on the 5 FA units with the real valve: valve characterization, supervisor falling trip **7.21–7.75 V** and rising release **7.38–7.82 V** on VM (nominal 7.50/7.60 V), mux takeover with MCU held in reset AND with IN1 forced high, abrupt-disconnect close, reset-path matrix, lockout thresholds (8.2/8.6 V + 5 s), enclosure dry-fit.

---

## Key Part Numbers

| Ref | Part | MPN | Digi-Key |
|---|---|---|---|
| U1 | ATtiny84A MCU (SOIC-14) | ATTINY84A-SSU | ATTINY84A-SSU-ND |
| U2 | DS3231M RTC (SO-16) | DS3231M+TRL | DS3231M+TRLCT-ND |
| U3 | MCP1703A-3302E LDO | MCP1703AT-3302E/CB | MCP1703AT-3302E/CBCT-ND |
| U4 | DRV8871 H-bridge (HSOP-8) | DRV8871DDAR | 296-44801-1-ND |
| U5 | TPS3700 window supervisor (VM, SOT-23-6) | TPS3700DDCR | 296-30395-1-ND |
| U6, U7 | SPDT takeover mux (SC-70-6) | SN74LVC1G3157DCKR | 296-14909-1-ND |
| SC1 | 0.1 F 5.5 V supercap | CHP5R5L104R-TW | see BOM |
| J5 | DC barrel jack | PJ-002A | CP-002A-ND |

---

## Architecture Notes — Rev 5.0 Design Decisions

**All-source fusing:** F1 (1.1 A PPTC) sits AFTER the OR-diode junction (VIN_OR -> F1 -> VM), so every input (J1, J5, J6) is fused — v3 fused battery 1 only.

**In-circuit ISP (v3 defect fixed):** J3 is now wired to the real ATtiny84A ISP pins (PA4/PA5/PA6 + /RESET). No ZIF socket, no consignment, no DIP socket — U1 is SMT and field-reflashable through J3.

**Hardware fail-safe close (Rev 5.1 redesign):** U5 (TPS3700) watches **VM directly** through a 180K/10K 1% divider — trip 7.50 V falling / 7.60 V rising, guaranteed above the DRV8871's 6.4 V worst-case UVLO, so the close command always reaches a live bridge. On trip, U6/U7 (SN74LVC1G3157 SPDT muxes) **disconnect the MCU from both bridge inputs and hard-force IN1=0 / IN2=1 = CLOSE** — a hung MCU holding IN1 high cannot produce the 1/1 brake state. Level-held with no RC timing: CLOSE is asserted as long as VM is below the release threshold. Firmware force-closes when VM reads below 8.20 V and releases when VM reads above 8.60 V sustained; the awake path takes 5 s and the asleep WDT-hop path releases automatically within ~10 s.

**RTC keeps time through battery swaps (v3 gap fixed):** SC1 0.1 F supercap on DS3231M VBAT, trickle-charged via R5 + D2 to ~3.05 V. Covers battery swaps and brief outages (~6.5 h at timekeeping draw); it is not multi-day storage.

**Solenoid driver:** DRV8871 (single H-bridge, HSOP-8); ILIM ~1.49 A via R6 = 43K — deliberately oversized margin for the **leak-qualified 6 V direct-acting micro latching class, ~200–353 mA at 17–30 ohm; production MPN + measured coil current frozen at T0**. C1 + C19 (2x 1000 uF) provide rail-sag support and hold-up through the supervisor trip window; they are support capacitance, not a stored-energy close reservoir. Bistable valve, directed pulses, zero holding current; firmware journals commanded state in EEPROM (tear-safe 3-byte complement-validated slots) and reconciles on every boot.

**Watchdog always on:** WDTON fuse burned — ~2 s hardware watchdog cannot be disabled by firmware.

**Display / I2C separation (v3 quirk removed):** TM1637 has dedicated pins (PA7 DIO, PA3 CLK); DS3231M is on the USI I2C pins (PA6 SDA, PA4 SCL). No shared bit-bang bus.

**Input protection:** TVS1 (SMAJ15A) at the J5 input, TVS2 on the VM rail near U4 for solenoid kickback. J5 requires a **regulated 9–12 V adapter (≤13 V open-circuit)**: the SMAJ15A is transparent between 15 V and its ~16.7 V breakdown, exactly the band that overstresses the MCP1703A (16 V operating max). Do NOT substitute SMAJ18A — a higher standoff widens the unprotected band.

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
| 10 | Hardware fail-safe close | With U1 held in reset, slow VM ramp-down makes `/VM_OK` fall within 7.21–7.75 V and selects the level-held mux state `IN1=0, IN2=1`; rising release must be within 7.38–7.82 V |
| 11 | Watchdog recovery | Firmware stall (test hook) resets within ~2 s; valve state reconciled after reset |
| 12 | Enclosure closes without interference | Lid snaps closed; jack, buttons, display, and terminals all accessible; >= 4 mm web intact between all front-face cutouts |
| 13 | CO2 flow (if connected) | Flows during ON window; stops at OFF time; no leak at barb fittings |
