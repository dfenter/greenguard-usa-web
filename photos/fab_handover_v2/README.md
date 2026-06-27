# CO2 Trap Timer v2 — Fabrication Handover Package

**GreenGuard USA | Timer-001 Rev 2.0 | 2026-06-17**

---

## Package Contents

| File | Description |
|---|---|
| `co2_timer_v2_gerbers.zip` | Gerber + drill files — upload directly to JLCPCB or equivalent fab portal |
| `co2_timer_v2_BOM.csv` | Full BOM with MPN, manufacturer, Digi-Key #, LCSC #, and SMT/THT callout |
| `co2_timer_v2_CPL_SMT.csv` | SMT pick-and-place file (SMT components only — C2, C3, F1, R1–R7, U2, U3) |
| `co2_timer_v2_THT_assembly.md` | THT hand-assembly list (for CM hand-solder step, not SMT line) |
| `CO2 Timer Enclosure Drilling.md` | Enclosure drilling guide — Zulkit IP65 100×68×50 mm ABS |
| `CO2 Timer v2 Schematic BOM.md` | Schematic netlist, BOM, power-on test procedure |
| `co2_timer_v2.kicad_sch` | KiCad schematic source |
| `co2_timer_v2.kicad_pcb` | KiCad PCB layout source |
| `firmware/co2_timer_v2/co2_timer_v2.ino` | Arduino firmware source |
| `firmware/co2_timer_v2/flash.sh` | Flash script (avrdude) — see Buyer Actions below |
| `GreenGuard_CO2_Timer_SpecSheet_v2_source.html` | Spec sheet source — open in browser, File → Print → Save as PDF |
| `co2_timer_v2_lid_drill_template.svg` | 1:1 printable lid drill template (display window + button holes) |

---

## Quick Reference

- **Quantity:** Buyer specifies (prototype = 5–10 boards)
- **Assembly:** Turnkey — shop to source all BOM parts and assemble SMT + THT, except U1 (consignment)
- **Board:** 65 × 45 mm, 2-layer FR-4 1.6 mm, HASL lead-free
- **SMT top side:** U2, U3, F1, R1–R7, C2, C3
- **THT turnkey:** D1, D2, D3, Q1, SW1, SW2, C1, J1, J2, J3, J4, U1_SOCKET
- **THT consignment:** U1 — buyer ships pre-programmed ATtiny85-20PU chips; CM installs into U1_SOCKET after delivery
- **Power input (J1):** 9V battery snap connector OR 9V DC wall adapter via rear-panel barrel jack pigtail to J1 screw terminal. D1 provides reverse-polarity protection for both inputs.

> **Enclosure IP rating note:** The Zulkit enclosure is rated IP65 as shipped. After adding the display window cutout and button holes, the finished assembly is **splash-resistant only** unless the display aperture and button holes are sealed. See `CO2 Timer Enclosure Drilling.md` for sealing options. Do not claim IP65 on assembled units without sealing all penetrations.

---

## What to Send the Shop

**Quote request: [N] boards, turnkey, fully assembled (SMT + THT).**

Send the shop this folder. The BOM includes MPN + Digi-Key # for every component — shop to source all parts except U1 (buyer consignment).

Use `co2_timer_v2_CPL_SMT.csv` for the SMT placement file — **do not send the old co2_timer_v2_CPL.csv** (it incorrectly includes THT references). See `co2_timer_v2_THT_assembly.md` for the THT hand-solder callout to include in your assembly work order.

---

## Buyer Actions Before Assembly

1. **Program U1 chips:** Compile `firmware/co2_timer_v2/co2_timer_v2.ino` in Arduino IDE (ATtinyCore, 8 MHz internal, USBasp programmer), export the HEX, then run `flash.sh` to set fuses and flash each blank ATtiny85-20PU chip. Full instructions are in the flash script and in `CO2 Timer v2 Schematic BOM.md` → Firmware Programming section.

2. **Ship programmed chips to CM:** Pack programmed ATtiny85-20PU chips (one per unit) with the order. CM will seat each chip into the pre-installed U1_SOCKET after assembly and inspection — **CM does not solder U1 directly.** This allows field firmware updates.

3. **Enclosure cutouts (buyer, not CM):** Per `CO2 Timer Enclosure Drilling.md` — display window in lid (38×12 mm), 2× button holes (6 mm dia), 2× PG7 cable gland holes in side faces (12 mm dia). Apply display sealing per drilling guide before field deployment.

4. **Gerbers:** Current — regenerated from fully routed PCB (2026-06-18). No further action needed before submitting.

> **Pre-production bench test:** Before ordering production boards, bench-test the complete assembly (assembled PCB + 9V battery + selected solenoid valve + CO2 pressure applied) for a full simulated day cycle. The 9V battery driving a 12V-rated solenoid is an accepted cost/size tradeoff for prototype quantities, but actual battery life under continuous solenoid load must be validated before committing to production. See `CO2 Timer v2 Schematic BOM.md` → Power-On Test Procedure.

---

## Key Part Numbers

| Ref | Part | MPN | Digi-Key |
|---|---|---|---|
| U1 | ATtiny85-20PU MCU | ATTINY85-20PU | ATTINY85-20PU-ND |
| U2 | DS3231SN RTC | DS3231SN# | DS3231SN#-ND |
| U3 | AMS1117-3.3 LDO | AMS1117-3.3 | AMS1117-3.3CT-ND |
| Q1 | IRL540NPBF MOSFET | IRL540NPBF | IRL540NPBF-ND |
| J1/J2 | Screw terminal 5.08mm | 1729128 | 277-1247-ND |

---

## Architecture Notes — Rev 2.0 Design Decisions

**Power input options:** J1 screw terminal accepts two configurations:
- **9V battery:** 9V alkaline or NiMH pack via snap connector wired to J1 (positive to +, negative to −). Battery mounts inside the enclosure with Velcro.
- **DC wall adapter:** 120V AC → 9V DC, 500 mA minimum, center-positive (5.5 mm / 2.1 mm barrel). A panel-mount barrel jack is installed in the rear face of the enclosure; a pigtail (bare wire leads) connects barrel jack + and − to J1. D1 (1N4007) provides reverse-polarity protection for both inputs. The 12V-rated solenoid operates at reduced force from a 9V supply — see Battery/solenoid note below.

**Pin sharing (PB0/PB1/PB2):** The ATtiny85's 5 I/O pins require careful assignment. PB0/PB1 are shared between the TM1637 display (bit-bang) and DS3231 RTC (soft I2C). The firmware must not address both devices simultaneously — only one protocol is active at a time, and both are bit-banged so there is no hardware I2C conflict. PB2 serves dual duty as the MOSFET gate and DS3231 INT input; D2 (1N4007) provides diode isolation so the RTC cannot pull the gate high inadvertently. This architecture requires bench validation before committing to production. If pin contention is observed, consider a pin-compatible upgrade to ATtiny1616/1626 (14 pins, hardware I2C, 3× more I/O).

**Firmware sleep/wake (validation required):** The firmware enters `SLEEP_MODE_PWR_DOWN` between schedule evaluations and wakes on DS3231 INT (PB2/INT0 LOW). The alarm is set to the next schedule boundary (05:30 or 23:30). The code comment references a ~60 s periodic display refresh, but **no watchdog timer is configured in the current firmware** — the display will remain off until the next alarm fires. Bench test should confirm: (a) DS3231 alarm reliably fires at the correct time, (b) display updates correctly on wake, and (c) whether a periodic WDT wake for display refresh is required for the use case. This is not a fabrication blocker but must be confirmed before field deployment.

**Battery/solenoid voltage:** The design runs a 12V-rated solenoid from a 9V battery. The solenoid will open at reduced force and run cooler; this is intentional for lower standby current and smaller enclosure. Bench test is required to confirm the selected solenoid model opens reliably at 9V with CO2 pressure applied.

**RFQ separation:** Submit PCB assembly and enclosure fabrication as separate RFQs. PCB assembly shops are not set up for enclosure machining — mixing both in one quote adds lead time and cost. Quote PCB assembly (Gerbers + BOM + CPL + THT callout) through a dedicated PCB CM. Source the enclosure separately (Zulkit or equivalent) and have the buyer or a local shop do the lid milling and side drilling.

---

## Prototype Acceptance Criteria

Before shipping units or committing to production quantities, each prototype must pass all of the following:

| # | Criterion | Pass condition |
|---|-----------|----------------|
| 1 | RTC maintains time | After power cycle, display shows correct time (within 1 minute of reference) |
| 2 | User can set clock | UP + SET buttons enter time-set mode; time persists after power cycle |
| 3 | Display readable | TM1637 4-digit display legible in normal indoor and outdoor light |
| 4 | Solenoid actuates on schedule | CO2 valve opens at 05:30 and closes at 23:30; audible click on transition |
| 5 | Battery input | Unit powers up and operates normally from 9V battery via J1 |
| 6 | Wall adapter input | Unit powers up and operates normally from 9V DC adapter via rear barrel jack |
| 7 | Enclosure closes without interference | Lid seats flush with no component contact; all screws tighten to stop |
| 8 | No unintended valve actuation on power-up | Solenoid remains closed during boot sequence if current time is outside ON window |
| 9 | Sleep / wake cycle | Unit enters sleep, wakes on DS3231 alarm, re-evaluates schedule — no lock-up observed over 24-hour soak |
| 10 | CO2 flow (if connected) | With regulator attached, CO2 flows during ON window and stops at OFF time; no leak at fittings or glands |

---

## Revision Notes — Rev 2.0

- Added R7 (4.7kΩ 0805): I2C SCL pullup on PB1. Previously missing; DS3231 requires both SDA and SCL pulled up.
- Drilling template corrected: removed v1 LED holes, added TM1637 display window and UP/SET button holes.
- Firmware unchanged from prior build (co2_timer_v2.ino).
- PCB fully routed — 224 traces, 14 nets, DRC clean (0 violations, 0 unconnected). Gerbers and CPL regenerated from routed board.
- U2 SO-16 pad height corrected to 0.6mm (IPC standard for 1.27mm pitch). U3 SOT-223 center pad width corrected to 1.9mm. Five component positions adjusted for clearance: U3, R3, R7, F1, C1.
- CPL split into SMT-only (co2_timer_v2_CPL_SMT.csv) + THT hand-assembly list (co2_timer_v2_THT_assembly.md).
- KiCad source files and firmware added to package.
