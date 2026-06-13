# GreenGuard CO2 Trap Timer — Rev 3.1 "Mini"

## Smallest build that meets all current (Rev 3.0) requirements

### Schedule ON 05:30 / OFF 23:30 | TM1637 display | 2-button set | latching solenoid | 9V battery + DC barrel jack | IP65

-----

## Design goal

Rev 3.0 works but is sized by through-hole parts and redundant features, not by
the actual requirements. Rev 3.1 keeps **every functional requirement** and the
**exact ATtiny84A pinout (zero firmware change)** while cutting the board from
70×50 mm to **45×30 mm** and the enclosure from 100×68×50 mm to **~83×58×33 mm**.

### Requirements held constant (nothing dropped)

| Requirement | Rev 3.0 | Rev 3.1 Mini |
|-------------|---------|--------------|
| Schedule ON 05:30 / OFF 23:30, user-settable | ✅ | ✅ (same firmware) |
| RTC timekeeping survives reboot | DS3231M | DS3231M (unchanged) |
| TM1637 4-digit display, on-demand wake | ✅ | ✅ (unchanged) |
| 2-button time set | ✅ | ✅ (unchanged) |
| 12V bistable latching solenoid drive | DRV8833 | DRV8833 (unchanged) |
| ≥7-month battery life | ~7 mo (1× 9V) | ~7 mo (1× 9V) |
| Dual power (battery + barrel jack) | ✅ | ✅ |
| IP65 weatherproof, CO2 in/out barbs | ✅ | ✅ |

-----

## What changed from Rev 3.0 (size only — no function lost)

| Item | Rev 3.0 | Rev 3.1 Mini | Size win |
|------|---------|--------------|----------|
| MCU package | ATtiny84A **DIP-14** | ATtiny84A **SOIC-14** | same silicon/pinout, ~70% smaller footprint, **no firmware change** |
| Reverse-pol / OR diodes | 3× 1N4007 **DO-41** (D1/D4/D5) | 2× SS14 **SMA** Schottky (D1/D4) | DO-41 is ~5×9 mm each; SMA is 5×2.6 mm. Also lower Vf |
| Flyback diodes | 2× 1N4007 DO-41 (D2/D3) | **removed** | DRV8833 has internal body diodes; latching pulse is 50 ms coast-to-brake. External flyback unnecessary |
| Second 9V battery | J6 screw term + D5 OR-diode | **removed** | 1× 9V already meets the 7-month spec; redundant pack drove enclosure depth |
| Battery / solenoid connectors | 3× 5.08 mm screw terminals | 3× **JST-PH 2-pin** (or solder pads) | 5.08 mm pitch is the single biggest edge-hog |
| Bulk cap | 100 µF THT radial | 100 µF **SMD electrolytic** (6.3 mm can) | frees a tall through-hole footprint |
| Buttons | 6×6 mm THT | 4.5×4.5 mm SMD side/right-angle (or panel-mount via flylead) | |
| Resistors/caps | 0805 | 0603 | minor |
| LDO | MCP1703A SOT-23 | MCP1703A SOT-23 (unchanged) | already small |
| PCB | 70×50 mm, 2-layer | **45×30 mm**, 2-layer | ~62% area reduction |
| Enclosure | 100×68×50 mm | **~83×58×33 mm** IP65 ABS | depth set by 9V battery (17 mm) + PCB on 6 mm standoffs |

-----

## Schematic — net list (Rev 3.1)

Identical topology to Rev 3.0 minus the second battery and the two flyback
diodes. **ATtiny84A pin assignment is unchanged**, so `co2_timer_v3.ino`
flashes as-is.

### Power

```
9V Battery (+)  → [F1 Polyfuse 1A] → [D1 SS14 Schottky] → VIN_PROTECTED
DC Barrel Jack(+) →                  [D4 SS14 Schottky] → VIN_PROTECTED   (OR — higher source wins)
VIN_PROTECTED → [C1 100µF SMD] → GND
VIN_PROTECTED → [U3 MCP1703A-3302E] → VCC 3.3V → MCU, RTC, display, DRV8833 logic
VIN_PROTECTED → VM rail → DRV8833 H-bridge output (solenoid)
GND → common
```

### ATtiny84A (U1, SOIC-14) — UNCHANGED pinout

```
Pin 1  VCC      ── 3.3V
Pin 2  PB0      ── ICSP MOSI
Pin 3  PB1      ── ICSP MISO
Pin 4  PB3/RST  ── [R1 10k] ── VCC
Pin 5  PB2      ── ICSP SCK
Pin 6  PA7      ── [R3 10k] ── BTN_SET (SW2) ── GND
Pin 7  PA6      ── [R2 10k] ── BTN_UP (SW1) ── GND
Pin 8  PA5      ── (spare)
Pin 9  PA4      ── TM1637 CLK / DS3231 SCL (soft I2C)
Pin 10 PA3      ── TM1637 DIO / DS3231 SDA (soft I2C)
Pin 11 PA2      ── [R6 10k] ── DS3231 INT (PCINT2)
Pin 12 PA1      ── DRV8833 IN2 (CLOSE)
Pin 13 PA0      ── DRV8833 IN1 (OPEN)
Pin 14 GND      ── GND
```

### DRV8833 (U4) — solenoid drive, UNCHANGED

```
AIN1←PA0  AIN2←PA1  AOUT1→coil(+)  AOUT2→coil(-)
VM←VIN_PROTECTED  VCC←3.3V  nSLEEP←VCC  VCP─[C4 100nF]─GND
OPEN  : AIN1=1,AIN2=0 50ms → coast
CLOSE : AIN1=0,AIN2=1 50ms → coast
Internal body diodes handle coil flyback (D2/D3 removed).
```

### DS3231M (U2) and TM1637 — UNCHANGED from Rev 3.0

```
DS3231M: VCC/VBAT←3.3V  SDA←PA3  SCL←PA4  INT─[R6 10k]─PA2
TM1637 : VCC←3.3V  CLK←PA4  DIO←PA3  (4-pin header J4)
I2C pullups: [R5 4.7k] SDA→VCC, [R7 4.7k] SCL→VCC
```

-----

## Bill of Materials — PCB (Rev 3.1)

| Ref | Description | Value | Package | Qty | Unit $ | Ext $ |
|-----|-------------|-------|---------|-----|--------|-------|
| U1 | MCU | ATtiny84A-SSU | **SOIC-14** | 1 | $1.20 | $1.20 |
| U2 | RTC | DS3231M | SO-16 | 1 | $0.80 | $0.80 |
| U3 | LDO 2µA Iq | MCP1703A-3302E | SOT-23-3 | 1 | $0.25 | $0.25 |
| U4 | H-bridge | DRV8833PWP | HTSSOP-16 | 1 | $0.35 | $0.35 |
| D1 | Reverse-pol OR | SS14 Schottky | **SMA** | 1 | $0.04 | $0.04 |
| D4 | Barrel-jack OR | SS14 Schottky | **SMA** | 1 | $0.04 | $0.04 |
| SW1 | UP button | 4.5×4.5 SMD tactile | SMD | 1 | $0.04 | $0.04 |
| SW2 | SET button | 4.5×4.5 SMD tactile | SMD | 1 | $0.04 | $0.04 |
| F1 | Polyfuse | 1A/2A trip | 1206 SMD | 1 | $0.18 | $0.18 |
| R1,R2,R3,R6 | Pullups | 10kΩ | 0603 | 4 | $0.01 | $0.04 |
| R5,R7 | I2C pullups | 4.7kΩ | 0603 | 2 | $0.01 | $0.02 |
| C1 | Bulk | 100µF 16V | SMD elec 6.3mm | 1 | $0.08 | $0.08 |
| C2,C3,C4 | Decoupling | 100nF | 0603 | 3 | $0.01 | $0.03 |
| J1 | Battery in | JST-PH 2P | SMD/THT | 1 | $0.08 | $0.08 |
| J2 | Solenoid out | JST-PH 2P | SMD/THT | 1 | $0.08 | $0.08 |
| J3 | ICSP | 2×3 1.27mm or Tag-Connect pads | SMD | 1 | $0.05 | $0.05 |
| J4 | TM1637 header | 1×4 2.54mm | THT | 1 | $0.08 | $0.08 |
| J5 | DC barrel jack | 5.5/2.1mm PCB | THT | 1 | $0.20 | $0.20 |
| **PCB TOTAL** | | | | | | **~$3.71** |

Removed vs Rev 3.0: D2, D3, D5 (three DO-41 diodes), J6 (2nd battery screw term).
Net BOM is cheaper **and** smaller.

### Off-board / mechanical

| Item | Spec | Unit $ |
|------|------|--------|
| TM1637 display module | 4-digit 0.36" red | $0.50 |
| Bistable latching solenoid | 12V 1/4" NPT Viton | $8.00 |
| IP65 ABS enclosure | **~83×58×33 mm** (Gainta G203 / equiv) | $2.50 |
| Brass barb bulkheads 1/4"NPT 6mm ×2 | | $1.50 |
| DC barrel jack panel-mount, capped | 5.5/2.1 weatherproof | $0.80 |
| 9V battery snap, PCB lead ×1 | | $0.80 |
| M3 brass standoffs 6mm ×4 | | $1.00 |
| Hook-up wire 22AWG | | $0.50 |
| **MECH TOTAL** | | **~$15.60** |

### Unit cost by volume

| Volume | PCB+Asm | Mech | Labor | Total | Margin @ $89.99 |
|--------|---------|------|-------|-------|-----------------|
| 10 (proto) | $10.00 | $20.00 | — | **~$30** | 67% |
| 100 | $5.00 | $15.60 | $4.50 | **~$25** | 72% |
| 500 | $3.80 | $11.00 | $2.50 | **~$17** | 81% |

-----

## PCB layout (45×30 mm, 2-layer)

```
┌─────────────────────────────────────────────┐ 45mm
│ J5 barrel   J1 batt        J2 solenoid       │
│   ▢           ▢                ▢             │
│  [U2 DS3231]   [U1 ATtiny84A]  [U4 DRV8833]  │
│  [C1] D1 D4 F1   R's/C's        VCP C4       │  30mm
│  J4 TM1637 hdr   J3 ICSP pads                │
│  SW1 ○        SW2 ○   (or panel flyleads)    │
└─────────────────────────────────────────────┘
```

Mounting: 4× M3 holes, 3 mm inset from corners. Stretch target 40×28 mm if
buttons are moved to panel-mount flyleads and ICSP uses Tag-Connect pads.

-----

## Enclosure drilling — ~83×58×33 mm IP65 ABS

Depth note: interior usable ≈ 28 mm. 9V battery (17 mm) lies flat on the base;
PCB sits on 6 mm standoffs above it. Front lid carries the display + buttons.

```
FRONT LID (83×58)            LEFT (58×33)        RIGHT (58×33)
┌───────────────────────┐    ┌────────────┐      ┌────────────┐
│  ┌─────────────────┐  │    │            │      │            │
│  │ 40×14 display   │  │    │  ◎ CO2 IN  │      │  CO2 OUT ◎ │
│  └─────────────────┘  │    │ [29,16]    │      │   [29,16]  │
│     ○ UP    ○ SET     │    └────────────┘      └────────────┘
│  [28,42]   [55,42]    │      12mm barb           12mm barb
└───────────────────────┘
   BACK (83×58): ◉ barrel jack [41,29], 12mm, weatherproof cap
```

| Face | Hole | Position (X,Y from top-left) | Size |
|------|------|------------------------------|------|
| Front lid | Display window | 21,11 (corner) | 40×14 mm |
| Front lid | UP button | 28,42 | 8 mm Ø |
| Front lid | SET button | 55,42 | 8 mm Ø |
| Left side | CO2 IN barb | 29,16 | 12 mm Ø |
| Right side | CO2 OUT barb | 29,16 | 12 mm Ø |
| Back | DC barrel jack | 41,29 | 12 mm Ø |

Seal barb bulkheads with PTFE tape + nut inside; silicone bead around barrel-jack
flange to keep IP65. Cap barrel jack when on battery.

-----

## Firmware

**No change.** `firmware/co2_timer_v3/co2_timer_v3.ino` flashes unmodified — the
SOIC-14 ATtiny84A has the identical pinout and peripherals as the DIP-14. Same
ATTinyCore target, 8 MHz internal, BOD 2.7V. Program in a SOIC-14 clip/ZIF
before assembly (J3 ISP caveat from Rev 3.0 still applies).

-----

## Could it be smaller still? (rejected for requirement conflicts)

- **Drop to ATtiny85 SOIC-8:** would need to free 2 I/O (analog button ladder +
  watchdog-poll instead of RTC INT). Saves ~4×4 mm but **changes firmware** and
  raises sleep current (WDT wake), eroding the 7-month battery spec. Not worth it.
- **Drop the 9V for 2× AA / coin:** 9V is the largest component, but it both
  powers the 12V solenoid pulse directly and hits the 7-month target. Switching
  cells would need a boost converter (more board, more quiescent draw). Keep 9V.
- **Drop the barrel jack:** violates the "dual power" requirement. Kept.
