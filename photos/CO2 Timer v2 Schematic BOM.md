# GreenGuard CO2 Trap Timer — Rev 2.0

## Schematic & Bill of Materials

### Schedule: ON 5:30 AM / OFF 11:30 PM | TM1637 Display | 2-Button Time Set | No CR2032

-----

## What Changed from Rev 1.0

|Item        |Rev 1.0                    |Rev 2.0                     |
|------------|---------------------------|----------------------------|
|Display     |None (LED blink feedback)  |TM1637 4-digit 7-segment    |
|Time setting|Single button + blink count|2-button UP/SET with display|
|Buttons     |1x tactile                 |2x tactile                  |
|RTC backup  |CR2032 coin cell           |3.3V rail (no coin cell)    |
|Status LEDs |2x (power + valve)         |Removed — display shows time|
|Net BOM cost|~$4.30/board               |~$4.05/board                |

-----

## Schematic — Net List

### Power

Two input options share the J1 screw terminal — only one should be connected at a time:

```
Option A — 9V Battery:
  9V Battery (+) via snap connector ──> J1(+)

Option B — DC Wall Adapter:
  120V AC wall adapter (9V DC output, 500 mA min, center-positive)
  ──> Rear-panel barrel jack (5.5 mm / 2.1 mm) ──> pigtail wires ──> J1(+/−)

Both options:
  J1(+) ──> [F1 Polyfuse 1A] ──> [D1 1N4007] ──> VIN_PROTECTED
  VIN_PROTECTED ──> [U3 AMS1117-3.3] ──> VCC (3.3V) ──> MCU, RTC, Display
  VIN_PROTECTED ──> RAW_9V rail ──> Solenoid (+)
  GND ──> Common ground
```

### ATtiny85 (U1) Pin Assignment

```
Pin 1  PB5/RESET  ── [R1 10kΩ] ── VCC
Pin 2  PB3        ── [R2 10kΩ pullup] ── BTN_UP (SW1) ── GND
Pin 3  PB4        ── [R3 10kΩ pullup] ── BTN_SET (SW2) ── GND
Pin 4  GND        ── GND
Pin 5  PB0        ── TM1637 CLK  (also DS3231 SDA via soft I2C — see note)
Pin 6  PB1        ── TM1637 DIO  (also DS3231 SCL via soft I2C — see note)
Pin 7  PB2        ── [R4 100Ω] ── MOSFET Gate (Q1)
                  ── DS3231 INT (via [D2 1N4007] diode isolation — see note)
Pin 8  VCC        ── 3.3V
```

> **Pin-sharing note — bench validation required before production:**
> PB0 and PB1 are shared between the TM1637 display (bit-bang protocol) and the DS3231 RTC (software I2C). The firmware serializes all bus access — only one device is addressed at a time — but this shared-bus scheme relies on correct firmware timing and idle-state behavior. D2 (1N4007, cathode to PB2) prevents DS3231 INT from inadvertently asserting the MOSFET gate: when PB2 drives HIGH (valve open), D2 is reverse-biased and INT cannot pull the gate down; when PB2 is LOW (valve closed), INT may also pull LOW, which is harmless. Both shared-pin arrangements require bench validation on assembled hardware before committing to production quantities. If contention is observed, the recommended upgrade path is ATtiny1616/1626 (14 pins, dedicated hardware I2C, drop-in for this application).

### DS3231 RTC (U2)

```
VCC  ── 3.3V
GND  ── GND
SDA  ── ATtiny85 PB0 (shared with TM1637 CLK via soft I2C) ── [R5 4.7kΩ] ── VCC
SCL  ── ATtiny85 PB1 (shared with TM1637 DIO via soft I2C) ── [R7 4.7kΩ] ── VCC
INT  ── ATtiny85 PB2 via D2 1N4007 (cathode to PB2, anode to INT) ── [R6 10kΩ] ── VCC
VBAT ── 3.3V (no coin cell — powered from main rail)
32K  ── NC
```

### TM1637 Display Module

```
VCC ── 3.3V
GND ── GND
CLK ── ATtiny85 PB0
DIO ── ATtiny85 PB1
```

### Solenoid Driver

```
ATtiny85 PB2 ── [R4 100Ω] ── MOSFET Gate (Q1: IRL540N)
                              MOSFET Source ── GND
                              MOSFET Drain  ── Solenoid (-)
                              Solenoid (+)  ── RAW_9V

[D3 1N4007] Cathode ── RAW_9V
            Anode   ── MOSFET Drain  (flyback protection)

[C1 100µF 16V] across RAW_9V and GND near solenoid
```

### Decoupling

```
[C2 100nF] across VCC and GND near U1
[C3 100nF] across VCC and GND near U2
```

-----

## Bill of Materials

### PCB Components

|Ref          |Description      |Value               |Package   |LCSC # |Qty|Unit $|Ext $     |
|-------------|-----------------|--------------------|----------|-------|---|------|----------|
|U1           |Microcontroller  |ATtiny85-20PU       |DIP-8     |C89852 |1  |$1.20 |$1.20     |
|U2           |RTC              |DS3231SN            |SO-16     |C9868  |1  |$1.50 |$1.50     |
|U3           |LDO Regulator    |AMS1117-3.3         |SOT-223   |C6186  |1  |$0.15 |$0.15     |
|Q1           |N-Ch MOSFET      |IRL540NPBF          |TO-220    |C60330 |1  |$0.45 |$0.45     |
|D1           |Reverse polarity |1N4007              |DO-41     |C727110|1  |$0.05 |$0.05     |
|D2           |RTC INT isolation|1N4007              |DO-41     |C727110|1  |$0.05 |$0.05     |
|D3           |Flyback          |1N4007              |DO-41     |C727110|1  |$0.05 |$0.05     |
|SW1          |UP Button        |6x6mm Tactile       |THT       |C318884|1  |$0.05 |$0.05     |
|SW2          |SET Button       |6x6mm Tactile       |THT       |C318884|1  |$0.05 |$0.05     |
|F1           |Polyfuse         |1A / 2A trip        |1812 SMD  |C369150|1  |$0.20 |$0.20     |
|R1           |RESET pullup     |10kΩ                |0805      |C17414 |1  |$0.01 |$0.01     |
|R2           |BTN_UP pullup    |10kΩ                |0805      |C17414 |1  |$0.01 |$0.01     |
|R3           |BTN_SET pullup   |10kΩ                |0805      |C17414 |1  |$0.01 |$0.01     |
|R4           |MOSFET gate      |100Ω                |0805      |C17408 |1  |$0.01 |$0.01     |
|R5           |I2C SDA pullup   |4.7kΩ               |0805      |C17673 |1  |$0.01 |$0.01     |
|R6           |INT pullup       |10kΩ                |0805      |C17414 |1  |$0.01 |$0.01     |
|R7           |I2C SCL pullup   |4.7kΩ               |0805      |C17673 |1  |$0.01 |$0.01     |
|C1           |Bulk cap         |100µF 16V           |THT radial|C62923 |1  |$0.10 |$0.10     |
|C2           |Decoupling       |100nF               |0805      |C49678 |1  |$0.01 |$0.01     |
|C3           |Decoupling       |100nF               |0805      |C49678 |1  |$0.01 |$0.01     |
|J1           |Power input (battery or adapter)|2P 5.08mm screw term|THT  |C8465  |1  |$0.15 |$0.15     |
|J2           |Solenoid output  |2P 5.08mm screw term|THT       |C8465  |1  |$0.15 |$0.15     |
|J3           |ICSP header      |2x3 2.54mm          |THT       |C124378|1  |$0.10 |$0.10     |
|J4           |Display connector|1x4 2.54mm          |THT       |C358686|1  |$0.10 |$0.10     |
|U1_SOCKET    |DIP-8 IC socket  |8-pin 0.3"          |THT       |—      |1  |$0.10 |$0.10     |
|**PCB TOTAL**|                 |                    |          |       |   |      |**~$4.26**|

### Off-Board / Mechanical Components

|Item                         |Spec                          |Source         |Unit $     |
|-----------------------------|------------------------------|---------------|-----------|
|TM1637 display module        |4-digit 7-seg, red, 0.36”     |Amazon / LCSC  |$1.50      |
|Solenoid valve               |US Solid 1/4” NPT NC 12V Viton; ~400 mA @ 12V; rated 0–100 PSI; NC (CO2 off when unpowered); flow bidirectional — verify inlet/outlet against regulator plumbing before assembly|Amazon         |$10.99     |
|IP65 ABS enclosure           |100x68x50mm                   |Amazon (Zulkit)|$7.99      |
|1/4” NPT to 6mm barb fittings|Brass x2                      |Amazon         |$3.50      |
|PG7 cable glands x2          |IP65 — CO2 inlet/outlet       |Amazon         |$2.00      |
|Panel-mount DC barrel jack   |5.5 mm OD / 2.1 mm ID, center-positive; mounts in rear face 12 mm hole; pigtail wired to J1 screw terminal|Amazon|$1.50|
|9V DC wall adapter           |120V AC input, 9V DC 1A min output, center-positive; **optional** — use instead of battery|Amazon|$8.00|
|9V battery snap connector    |PCB mount; use with 9V battery — **omit if using wall adapter**|Amazon|$1.00|
|M3 brass standoffs 10mm x4   |PCB mount                     |Amazon         |$2.00      |
|Hook-up wire 22AWG           |Solenoid leads + barrel jack pigtail|Shop stock |$1.00      |
|**MECHANICAL TOTAL (battery)**|                             |               |**~$31.48**|
|**MECHANICAL TOTAL (adapter)**|Replace battery+snap with adapter+jack|          |**~$38.48**|

### Total Unit Cost by Volume

|Volume          |PCB+Assembly|Mechanical|Labor|Total   |
|----------------|------------|----------|-----|--------|
|10 units (proto)|$10.60      |$29.98    |—    |**~$41**|
|100 units       |$6.00       |$18.00    |$5.00|**~$29**|
|500 units       |$4.50       |$12.00    |$3.50|**~$20**|

Retail target: **$79.99** — 66% gross margin at 100 units.

-----

## Time-Setting Instructions (for manual / label)

```
TO SET TIME:
1. Hold SET button 3 seconds → display flashes
2. Press UP to set hour (00–23)
3. Press SET to confirm hour
4. Press UP to set minutes
5. Hold SET 2 seconds to save

Display shows current time at all times.
CO2 ON: 05:30  |  CO2 OFF: 23:30
```

-----

## Firmware Programming

### Requirements

| Tool | Version / Note |
|------|----------------|
| Arduino IDE | 1.8.x or 2.x |
| ATtiny85 board package | `attinycore` by Spence Kachmar — add via Board Manager URL `http://drazzy.com/package_drazzy.com_index.json` |
| Programmer | USBasp or Adafruit USBtinyISP connected to J3 (2×3 ICSP header) |
| Arduino libraries | `DS3231` (Andrew Wickert), `TM1637Display` (avishorp) |

### Clock Fuse Setting

ATtiny85 must be fused for **8 MHz internal oscillator** (not the default 1 MHz) before flashing firmware.

In Arduino IDE: Tools → Board → ATtiny85 → Clock: "8 MHz (internal)". Then: Tools → Burn Bootloader (this writes the fuses — no bootloader is installed). Do this once per blank chip.

### Flash Command (avrdude alternative)

```
avrdude -c usbasp -p t85 -U flash:w:co2_timer_v2.hex:i
```

### First-Boot Time Set

On first power-up the RTC defaults to 2000-01-01 00:00:00. Hold the SET button while applying power to enter time-set mode immediately on boot and set the current time.

-----

## Power-On Test Procedure

Perform these checks before sealing the enclosure.

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1. Power on | Connect 9V battery | Display shows "----" for ~1 s, then current time (HH:MM) with colon |
| 2. Time accuracy | Compare display to phone clock | Within 1 minute (within 10 s after fresh RTC set) |
| 3. Schedule — OFF window | Test before 05:30 or after 23:30 | Solenoid de-energized; measure 0V across solenoid leads |
| 4. Schedule — ON window | Temporarily set time to 06:00 via time-set mode | Solenoid energizes; measure battery voltage (~8–9V) across solenoid leads |
| 5. Solenoid function | During ON window: connect solenoid, apply CO2 | Audible click on open/close; CO2 flows through valve |
| 6. Time-set mode | Hold SET 3 s | Display flashes, UP cycles hour 00–23, SET confirms, hold SET 2 s saves |
| 7. Sleep / wake | Leave unit running outside schedule window | Display turns off on sleep; wakes and updates on DS3231 alarm fire (see sleep/wake note below) |
| 8. Battery life check | Measure open-circuit voltage | 9V battery reads ≥ 8.0V before deployment |
| 9. DC adapter input (if fitted) | Disconnect battery; connect 9V DC wall adapter to rear barrel jack | Display powers on, solenoid operates correctly; measure ~9V at J1 terminals |
| 10. Sleep / display refresh | Let unit run for 2 minutes outside schedule window | Display turns off on sleep entry; wakes and shows correct time on DS3231 alarm. **Note:** current firmware has no WDT — display refresh only occurs at schedule-boundary alarms (05:30 / 23:30), not every 60 s. Confirm this behavior is acceptable before field deployment. |

**Solenoid note:** The BOM specifies a 12V NC solenoid operating from a 9V supply. The solenoid opens at reduced force and runs cooler; this is an accepted tradeoff for prototype scale (smaller battery, smaller enclosure). Do not substitute a 24V solenoid.

**DC adapter note:** The panel-mount barrel jack (rear face) wires directly to J1. Do not connect both battery snap and adapter simultaneously — J1 has no source-select protection. Polarity: center-positive on barrel jack → J1 positive terminal.

**Pre-production validation required:** Before ordering production boards, bench-test the complete assembly — 9V battery, assembled PCB, selected solenoid, CO2 pressure applied, enclosure closed — for a continuous simulated 18-hour ON cycle (05:30–23:30). Measure solenoid current draw, battery voltage at end of cycle, and confirm CO2 flow throughout. The 9V battery capacity under continuous solenoid load must be measured against your target service interval before committing to production.

**U1 installation:** U1 (ATtiny85) rides in U1_SOCKET and is not soldered directly. The socket (U1_SOCKET, 8-pin DIP-8) is installed and soldered by the CM. The buyer inserts the pre-programmed ATtiny85 chip into the socket after delivery. This allows field firmware updates without desoldering.

-----

## Factory Functional Test

Perform after full assembly (PCB + enclosure + wiring complete, before shipping prototype units).

| # | Step | Method | Pass |
|---|------|--------|------|
| 1 | Apply 9V input | Connect 9V battery to J1 | No smoke; F1 does not trip |
| 2 | Display startup | Power on | "----" for ~1 s, then HH:MM with colon; no garbage segments |
| 3 | Enter time-set mode | Hold SET 3 s | Display flashes; UP increments hour 00–23; SET advances to minutes; hold SET 2 s saves |
| 4 | RTC retains time | Set time, power off 60 s, power on | Time within 5 s of set value |
| 5 | MOSFET output — valve open | Set time into ON window (05:30–23:29); measure PB2 (TP or J2) | PB2 = HIGH (3.3 V); J2 output = ~9 V (solenoid open) |
| 6 | MOSFET output — valve closed | Set time to OFF window; measure J2 | J2 = 0 V (solenoid de-energized) |
| 7 | Solenoid energizes | Connect solenoid; time in ON window | Audible click on open; no click when already open |
| 8 | Wall adapter | Disconnect battery; connect 9V DC adapter to rear barrel jack | Unit powers on; display shows time; solenoid state matches schedule |
| 9 | Current draw — OFF window | Ammeter in series with input; time in OFF window (display on) | < 30 mA (primarily display + RTC) |
| 10 | Current draw — ON window | Ammeter in series with input; time in ON window | Display + RTC + solenoid; measure and record; flag if > 450 mA |
| 11 | Power-up valve state | Power off during ON window; wait 5 s; power on | Solenoid opens within 2 s of boot — no prolonged open/closed ambiguity |
| 12 | Enclosure fit | Close lid; check all screws | Lid seats flush; no component interference; all screws tighten to stop |

Record results per unit. Any fail = reject for rework before shipment.

-----

## Cost Reduction Notes (Future Revisions)

These are not prototype concerns. Document here for production planning.

| Item | Current | Opportunity | Notes |
|------|---------|-------------|-------|
| Q1 MOSFET | IRL540NPBF TO-220 | Smaller logic-level MOSFET (e.g., AO3400 SOT-23 or similar) | IRL540 is far oversized for ~400 mA solenoid load; TO-220 requires extra board area and heatsink pad; SOT-23 part reduces BOM cost and PCB footprint |
| U3 LDO | AMS1117-3.3 (quiescent ~5 mA) | Lower-Iq LDO (e.g., MCP1700, AP2112, XC6206) | Battery-powered operation makes quiescent current significant; MCP1700-3302E has 1.6 µA Iq vs. 5 mA for AMS1117 — materially extends battery life |
| Enclosure RFQ | Bundled with PCB | Separate RFQ | PCB assembly shops are not set up for lid milling and cable gland drilling; splitting into two RFQs (PCB CM + local machining or dedicated enclosure vendor) reduces lead time and avoids mixed-trade markups |

-----

## Supplied Files

| File | Purpose |
|------|---------|
| `co2_timer_v2.kicad_sch` | KiCad schematic (source) |
| `co2_timer_v2.kicad_pcb` | KiCad PCB layout (source) |
| `firmware/co2_timer_v2/co2_timer_v2.ino` | Arduino firmware source |
| `firmware/co2_timer_v2/flash.sh` | avrdude flash script — sets fuses + programs chip |
| `co2_timer_v2_BOM.csv` | Full BOM with MPN, Digi-Key #, LCSC #, SMT/THT callout |
| `co2_timer_v2_CPL_SMT.csv` | SMT pick-and-place (SMT components only) |
| `co2_timer_v2_THT_assembly.md` | THT hand-solder instructions |
| `CO2 Timer v2 Schematic BOM.md` | This document — schematic, BOM, test procedure |
| `CO2 Timer Enclosure Drilling.md` | Enclosure drilling guide with hole positions and sealing plan |
| `co2_timer_v2_lid_drill_template.svg` | 1:1 printable lid drill template |
| `GreenGuard_CO2_Timer_SpecSheet_v2_source.html` | Spec sheet source — print to PDF for customer distribution |

*GreenGuard USA — Rev 2.0 — All dimensions in mm unless noted*