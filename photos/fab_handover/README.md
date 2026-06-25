# CO2 Trap Timer v3 — Fabrication Handover Package

**GreenGuard USA | Timer-001 Rev 3.0 | 2026-06-18**

---

## Package Contents

| File | Description |
|---|---|
| `co2_timer_v3_gerbers.zip` | All Gerber + drill files — upload directly to fab portal |
| `co2_timer_v3_BOM.csv` | Full BOM with MPN, manufacturer, Digi-Key #, LCSC #, and SMT/THT callout |
| `co2_timer_v3_CPL_SMT.csv` | SMT pick-and-place file (SMT components only — C2–C4, F1, R1–R3, R5–R7, U2, U3, U4) |
| `co2_timer_v3_THT_assembly.md` | THT hand-solder instructions (for CM hand-solder step, not SMT line) |
| `co2_timer_v3_assembly_top.pdf` | Top-side assembly drawing (F.Fab + silkscreen + courtyard) |
| `co2_timer_v3_assembly_bottom.pdf` | Bottom-side assembly drawing (B.Fab + silkscreen + courtyard) |
| `CO2 Timer Enclosure Drilling.md` | Enclosure drilling guide — Hammond 1554CGY 120×65×40 mm ABS |
| `co2_timer_v3_front_drill_template.svg` | 1:1 printable front face drill template (display window + buttons + DC jack) |
| `FABRICATION_SPEC.md` | Full fab spec: stackup, finish, IPC class, special assembly notes |
| `TEST_PROCEDURE.md` | Board test procedure + factory functional test |
| `co2_timer_v3.kicad_sch` | KiCad schematic source |
| `co2 timer v3.kicad_pcb` | KiCad PCB layout source |
| `firmware/co2_timer_v3/co2_timer_v3.ino` | Arduino firmware source |
| `firmware/co2_timer_v3/flash.sh` | avrdude flash script — ZIF socket wiring + fuse + program |
| `firmware/README.md` | Build environment, ZIF socket wiring, pin assignments, behavior |
| `GreenGuard_CO2_Timer_v3_SpecSheet_source.html` | Spec sheet source — open in browser, print to PDF |

---

## Quick Reference

- **Quantity:** Buyer specifies (prototype = 10 boards)
- **Assembly:** Turnkey — shop to source all BOM parts and assemble SMT + THT, except U1 (consignment)
- **Board:** 70 × 50 mm, 2-layer FR-4 1.6 mm, HASL lead-free
- **SMT top side:** U2, U3, U4, F1, R1–R3, R5–R7, C2–C4
- **THT turnkey:** D1–D5, SW1, SW2, C1, J1, J2, J4, J5, J6, U1_SOCKET — **J3 = DNP (do not install)**
- **THT consignment:** U1 — buyer ships pre-programmed ATtiny84A-20PU chips; CM installs into U1_SOCKET after delivery
- **Enclosure:** Hammond 1554CGY (120 × 65 × 40 mm ABS, snap-fit lid)
- **Power input (J5):** 9–12 V DC center-positive via front-panel barrel jack (J5, PCB-mounted PJ-002A). OR-diode D4 protects against backfeed. Wall adapter (120 V AC → 9 V DC, 500 mA min) connects to J5.
- **Power input (J1/J6):** 9 V battery via screw terminals. OR-diodes D1 (J1) and D5 (J6) — all three inputs (J1, J5, J6) may be connected simultaneously.
- **DRC:** 0 unconnected, 0 physical violations — KiCad 10.0.3

> **CPL note:** Use `co2_timer_v3_CPL_SMT.csv` for the SMT placement file — do not send the old `co2_timer_v3_CPL.csv` (it incorrectly includes THT references). See `co2_timer_v3_THT_assembly.md` for the THT hand-solder callout.

---

## What to Send the Shop

**Quote request: [N] boards, turnkey, fully assembled (SMT + THT).**

Send the shop this folder. The BOM includes MPN + Digi-Key # for every component — shop to source all parts except U1 (buyer consignment).

Use `co2_timer_v3_CPL_SMT.csv` as the SMT placement file. Use `co2_timer_v3_THT_assembly.md` as the THT assembly callout.

**RFQ separation:** Submit PCB assembly and enclosure drilling as separate RFQs. PCB assembly shops are not set up for enclosure machining. Source the enclosure separately (Hammond 1554CGY) and have the buyer or a local shop do the front panel milling and side/rear drilling.

---

## Buyer Actions Before Assembly

1. **Program U1 chips:** Build `firmware/co2_timer_v3/co2_timer_v3.ino` in Arduino IDE (ATTinyCore, 8 MHz internal, BOD 2.7V), export the HEX (`Sketch > Export Compiled Binary`), then run `firmware/co2_timer_v3/flash.sh` to set fuses and flash each blank ATtiny84A-20PU chip via ZIF socket + USBasp. See `firmware/README.md` for ZIF wiring.

   > **J3 ISP note:** J3 on the PCB is non-functional for in-circuit programming (wired to PB0/PB1/PB2, not the ATtiny84A's ISP pins PA4/PA5/PA6). All chips must be programmed in a ZIF socket before installation. This is a known Rev 3.0 limitation, deferred to v4.

2. **Ship programmed chips to CM:** Pack programmed ATtiny84A-20PU chips (one per unit) with the order. CM inserts each chip into the pre-installed U1_SOCKET — does not solder U1 directly. This allows field firmware updates.

3. **Enclosure cutouts (buyer, not CM):** Per `CO2 Timer Enclosure Drilling.md` — front face: display window (38×12 mm), 2× button holes (6 mm dia), barrel jack hole (12 mm dia). Left side: 2× slots for J1/J6. Right side: 1× slot for J2. Rear face: 2× 10 mm holes for CO2 barb fittings.

4. **DC adapter (if used):** J5 barrel jack (PJ-002A) is PCB-mounted and protrudes through the front face 12 mm hole. No additional wiring required — J5 connects to the power OR-diode network on-board. Connect a 9–12 V DC wall adapter (center-positive) directly to J5.

> **Pre-production bench test:** Before ordering production boards, bench-test the complete assembly (assembled PCB + enclosure + selected bistable solenoid + CO2 pressure applied) through a full simulated day cycle. Confirm solenoid opens at 05:30 and closes at 23:30 with the 50 ms directional pulse. Measure sleep current in OFF window (target ~115 µA). See `TEST_PROCEDURE.md`.

---

## Key Part Numbers

| Ref | Part | MPN | Digi-Key |
|---|---|---|---|
| U1 | ATtiny84A MCU | ATTINY84A-PU | ATTINY84A-PU-ND |
| U2 | DS3231M RTC | DS3231M+TRL | DS3231M+TRLCT-ND |
| U3 | MCP1703A-3302E LDO | MCP1703AT-3302E/CB | MCP1703AT-3302E/CBCT-ND |
| U4 | DRV8833PWP H-bridge | DRV8833PWP | 296-28875-5-ND |
| J5 | DC barrel jack | PJ-002A | CP-002A-ND |

---

## Architecture Notes — Rev 3.0 Design Decisions

**Power input and OR-diode network:** Three independent power inputs share a common bus through OR-diodes:
- J1 (battery input 1) → D1 (1N4007) → VIN_PROTECTED
- J6 (battery input 2) → D5 (1N4007) → VIN_PROTECTED
- J5 (DC barrel jack, 9–12 V, center-positive) → D4 (1N4007) → VIN_PROTECTED

All three inputs may be connected simultaneously without backfeed damage. D2 and D3 are flyback protection diodes across the DRV8833 solenoid outputs. This OR-diode topology allows a battery to serve as backup while a wall adapter is primary — no relay or ideal-diode controller required.

**Bistable latching solenoid (DRV8833):** The DRV8833 drives a bistable latching valve with a 50 ms directed pulse (IN1 HIGH = open, IN2 HIGH = close). After the pulse, both inputs return LOW and the coil draws zero current. This is highly power-efficient relative to a normally-closed solenoid requiring sustained drive. The tradeoff is that valve state is lost on power loss — the firmware evaluates and re-pulses the correct state on every boot.

**Shared bus (PA3/PA4):** TM1637 CLK/DIO and DS3231M SCL/SDA share PA3 and PA4 via bit-bang. No hardware I2C conflict — only one device is addressed at a time. Both protocols are bit-banged in a single thread with no concurrent access.

**Sleep / wake:** During the OFF window (23:30–05:30), the MCU enters SLEEP_MODE_PWR_DOWN (~115 µA total). Wake sources: DS3231M /INT alarm on PA2 (PCINT2) and either button (PCINT6, PCINT7). The DS3231M drives both Alarm 1 (ON time) and Alarm 2 (OFF time) simultaneously, so the MCU wakes at the exact schedule boundary each day.

**ISP header (known issue):** J3 ISP header is wired to PB0/PB1/PB2, not the ATtiny84A's correct ISP pins (PA4/PA5/PA6). In-circuit programming via J3 does not work. All chips must be programmed in a ZIF socket before installation. Fix deferred to v4: reroute J3 to PA4 (MOSI), PA5 (MISO), PA6 (SCK), PB3 (RESET).

**LDO efficiency:** U3 MCP1703A-3302E has 1.6 µA quiescent current — well suited for battery operation. This was chosen specifically for low-Iq sleep performance (vs. AMS1117 at ~5 mA Iq, which would dominate sleep current).

---

## Prototype Acceptance Criteria

Before shipping units or committing to production quantities, each prototype must pass all of the following:

| # | Criterion | Pass condition |
|---|-----------|----------------|
| 1 | RTC maintains time during partial power loss | With 9V battery on J1, remove DC adapter — display shows correct time within 1 minute after reconnect. Full removal of all power resets RTC by design (no backup cell). |
| 2 | User can set clock | UP + SET buttons enter time-set; time persists while at least one power input remains connected; auto-exits at 30 s inactivity |
| 3 | Display readable | TM1637 digits legible during ON window; display off during OFF window |
| 4 | Solenoid opens at schedule | 05:30 — 50 ms pulse on IN1; bistable valve switches to open position |
| 5 | Solenoid closes at schedule | 23:30 — 50 ms pulse on IN2; bistable valve switches to closed position |
| 6 | Battery input (J1 or J6) | Unit powers up and operates normally from 9 V battery |
| 7 | DC adapter input (J5) | Unit powers up and operates normally from 9–12 V DC wall adapter |
| 8 | Sleep current | During OFF window: measured current ≤ 150 µA (target ~115 µA) |
| 9 | Wake from sleep | Unit wakes on DS3231M alarm; evaluates schedule; re-pulses valve if needed |
| 10 | No spurious valve pulse on power-up | Power on during OFF window — no solenoid pulse; valve remains in whatever state it was in |
| 11 | Boot during ON window forces open state | Power on during ON window — firmware sends OPEN pulse unconditionally to establish known valve state (firmware has no memory of prior valve position after power loss) |
| 12 | Enclosure closes without interference | Lid snaps closed; no component contact; all connectors accessible |
| 13 | CO2 flow (if connected) | CO2 flows during ON window; stops at OFF time; no leak at barb fittings |

---

## Cost Reduction Notes (Future Revisions)

| Item | Current | Opportunity | Notes |
|------|---------|-------------|-------|
| J3 ISP wiring | Wired to PB0/PB1/PB2 (non-functional) | Reroute to PA4/PA5/PA6/PB3 in v4 | Eliminates ZIF socket requirement; enables in-circuit programming for production testing |
| DRV8833 | TSSOP-16 dual H-bridge | Could use single H-bridge (DRV8837, WSON-8) if only one solenoid output needed | Minor cost and footprint reduction; DRV8833 is appropriate if a second channel is ever needed |
| U3 LDO | MCP1703A 1.6 µA Iq | Already optimal for battery operation — no change needed | Chosen specifically for low Iq; any replacement should be ≤ 2 µA Iq |
| Enclosure RFQ | Bundled with PCB quote | Separate RFQ | PCB assembly shops are not set up for lid milling and slot/hole drilling; splitting into two RFQs (PCB CM + local machining) reduces lead time and cost |
