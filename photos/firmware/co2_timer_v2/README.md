# CO2 Trap Timer v2 — Firmware

**GreenGuard USA | Timer-001 Rev 2.0 | ATtiny85-20PU**

---

## Files

| File | Description |
|---|---|
| `co2_timer_v2.ino` | Main firmware (Arduino sketch) |
| `flash.sh` | avrdude flash script with correct fuse bytes |

---

## Build Environment

- **IDE:** Arduino IDE 1.8.x or 2.x
- **Core:** ATTinyCore by Spence Konde
  - Board Manager URL: `http://drazzy.com/package_drazzy.com_index.json`
- **Board settings:**
  - Board: `ATtiny85`
  - Clock: `8 MHz (internal)`
  - BOD: `2.7V`
  - Programmer: `USBasp`
- **Libraries required:**
  - `DS3231` by Andrew Wickert (Library Manager)
  - `TM1637Display` by avishorp (Library Manager)
  - `Wire.h` — included with ATTinyCore

**Burn fuses before first flash:** Arduino IDE > Tools > Burn Bootloader (writes fuses only — no bootloader installed). Do this once per blank chip.

---

## Programming

**In-circuit via J3** is supported on v2. J3 routes correctly to ATtiny85 ISP pins.
Connect USBasp to J3, power board from 9V battery or USBasp VCC, then run:

```bash
# 1. Export hex: Arduino IDE > Sketch > Export Compiled Binary
# 2. Flash:
chmod +x flash.sh
./flash.sh co2_timer_v2/co2_timer_v2.ino.hex
```

**ZIF socket** also works — see wiring in `flash.sh` header comments.

Fuses set by flash.sh:
- `LFUSE 0xE2` — 8 MHz internal RC oscillator
- `HFUSE 0xDD` — SPI ISP enabled, RESET active, BOD at 2.7V
- `EFUSE 0xFF` — self-programming disabled

---

## Pin Assignments

| ATtiny85 Pin | Port | Net | Function |
|---|---|---|---|
| 1 | PB5/RESET | RESET | ICSP reset; R1 10K pullup to VCC |
| 2 | PB3 | BTN_UP | UP button (active low, R2 10K pullup) |
| 3 | PB4 | BTN_SET | SET button (active low, R3 10K pullup) |
| 4 | GND | GND | — |
| 5 | PB0 | TM1637_CLK / SDA | TM1637 CLK + DS3231 SDA (shared bit-bang) |
| 6 | PB1 | TM1637_DIO / SCL | TM1637 DIO + DS3231 SCL (shared bit-bang) |
| 7 | PB2 | SOLENOID_CTRL / RTC_INT | MOSFET gate (via R4) + DS3231 INT (via D2 diode) |
| 8 | VCC | +3.3V | — |

---

## Behavior

| Event | Action |
|---|---|
| Power on | Shows `----` for 1 s, evaluates schedule, opens/closes valve |
| 5:30 AM | Solenoid opens (MOSFET HIGH), display active |
| 11:30 PM | Solenoid closes (MOSFET LOW), MCU sleeps |
| Sleeping | Power-down mode; wakes on DS3231 alarm |
| Hold SET 3 s | Enter time-set mode (display flashes) |
| Time-set UP | Increment hour or minute field |
| Time-set SET | Advance field (hour then minute) |
| Time-set hold SET 2 s | Save to RTC and exit |
| Hold SET on boot | Enter time-set immediately (first-boot flow) |

---

## Shared Bus Note

TM1637 CLK/DIO and DS3231 SDA/SCL share PB0 and PB1. Both are driven by software bit-bang. Never call TM1637 and I2C routines simultaneously. The firmware serializes all bus access — no concurrent access issues.
