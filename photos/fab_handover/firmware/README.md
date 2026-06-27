# CO2 Trap Timer v3 — Firmware

**GreenGuard USA | Timer-001 Rev 3.0 | ATtiny84A**

---

## Files

| File | Description |
|---|---|
| `co2_timer_v3/co2_timer_v3.ino` | Main firmware (Arduino sketch) |
| `flash.sh` | avrdude flash script with correct fuse bytes |

---

## Build environment

- **IDE:** Arduino IDE 2.x
- **Core:** ATTinyCore 1.5.x by Spence Konde
  - Install: Arduino IDE > Boards Manager > search "ATTinyCore"
  - Board URL: `http://drazzy.com/package_drazzy.com_index.json`
- **Board settings:**
  - Board: `ATtiny84(a)`
  - Clock: `8 MHz (internal)`
  - BOD: `2.7V`
  - Pin Mapping: `default (counterclockwise)`
  - Programmer: `USBasp`
- **No external libraries required** — firmware uses bit-bang I2C; no Wire, DS3231, or TM1637 library dependencies

---

## Programming

**J3 on the PCB is a known design limitation** — it routes to PB0/PB1/PB2, not the ATtiny84A's actual ISP pins (PA4/PA5/PA6). In-circuit programming via J3 does not work. This is a known issue deferred to v4. For v3, chips are pre-programmed in a ZIF socket before installation (see below).

**ZIF socket connections:**

| USBasp pin | ATtiny84A physical pin | Port |
|---|---|---|
| MOSI | 7 | PA6 |
| MISO | 8 | PA5 |
| SCK | 9 | PA4 |
| RESET | 4 | PB3 |
| VCC | 1 | VCC |
| GND | 14 | GND |

**Flash a chip:**
```bash
# 1. Export hex from Arduino IDE: Sketch > Export Compiled Binary
# 2. Run:
chmod +x flash.sh
./flash.sh co2_timer_v3/co2_timer_v3.ino.hex
```

Fuses set by flash.sh:
- `LFUSE 0xE2` — 8 MHz internal RC oscillator
- `HFUSE 0xDD` — SPI ISP enabled, RESET active, BOD at 2.7V
- `EFUSE 0xFF` — self-programming disabled

---

## Pin assignments

| Arduino D# | Port | Net | Function |
|---|---|---|---|
| D0 | PA0 | IN1 | DRV8833 AIN1 — solenoid open direction |
| D1 | PA1 | IN2 | DRV8833 AIN2 — solenoid close direction |
| D2 | PA2 | INT | DS3231M /INT alarm (PCINT2, active low) |
| D3 | PA3 | SDA/DIO | DS3231M SDA + TM1637 DIO (shared, bit-bang) |
| D4 | PA4 | SCL/CLK | DS3231M SCL + TM1637 CLK (shared, bit-bang) |
| D5 | PA5 | — | Unused |
| D6 | PA6 | BTN_UP | UP button (active low, 10K pull-up R2) |
| D7 | PA7 | BTN_SET | SET button (active low, 10K pull-up R3) |

---

## Behavior

| Event | Action |
|---|---|
| Power on | Shows `----`, evaluates schedule, opens/closes valve accordingly |
| 5:30 AM alarm | Opens bistable valve (50ms pulse), turns on display |
| 11:30 PM alarm | Closes bistable valve (50ms pulse), turns off display, sleeps |
| Sleeping (OFF period) | Power-down mode (~115µA total), wakes on DS3231M alarm or button press |
| Hold SET 3 s | Enter time-set mode |
| Time-set: UP | Increment current field (hour or minute) |
| Time-set: SET | Advance to next field (hour → minute) |
| Time-set: Hold SET 2 s | Save and exit time-set mode |
| Time-set: 30 s inactivity | Auto-exit without saving |

---

## Shared bus note

TM1637 CLK/DIO and DS3231M SCL/SDA share the same two GPIO pins (PA3/PA4). Both are driven by software bit-bang. Never call TM1637 and I2C routines simultaneously. The firmware serializes all bus access in a single thread — no RTOS, no interrupts during bus transactions.
