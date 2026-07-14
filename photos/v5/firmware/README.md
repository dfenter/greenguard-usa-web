# CO2 Timer v5 Firmware — ATtiny84A

**GreenGuard USA | Timer-001 Rev 5.0 | 2026-07-09**

Files:

- `co2_timer_v5.ino` — main firmware (Arduino/ATTinyCore sketch, single translation unit)
- `pins_v5.h` — pin map, mirrors `/photos/v5/NETLIST.md` Section 2 (the authoritative source)

Based on the working v3 logic (`fab_handover/firmware/co2_timer_v3/co2_timer_v3.ino`) but
restructured for the v5 hardware: USI hardware-assisted I2C on the real USI pins, dedicated
TM1637 pins, shared `/ALERT` interrupt, always-on watchdog, EEPROM-persisted valve state,
and VM battery monitoring.

---

## 1. Fuse settings (ATtiny84A)

| Fuse | Value | Contents |
|---|---|---|
| Low  | **0xE2** | Internal RC 8 MHz (CKSEL=0010), SUT=10, CKDIV8 **unprogrammed** (full 8 MHz), CKOUT unprogrammed |
| High | **0xC5** | SPIEN programmed, **WDTON programmed** (watchdog always on), **EESAVE programmed** (EEPROM survives chip erase / reflash), **BODLEVEL=101 (2.7 V)**, RSTDISBL/DWEN unprogrammed |
| Ext  | **0xFF** | SELFPRGEN unprogrammed |

```
avrdude -c usbasp -p t84 -B 8 \
  -U lfuse:w:0xE2:m -U hfuse:w:0xC5:m -U efuse:w:0xFF:m
```

Why these matter to the firmware:

- **WDTON**: the WDT runs from the instant of every reset at the 16 ms default. The sketch
  reprograms it to **2.0 s in `.init3`** (before `main()`), so no code path may stall >2 s
  without `wdt_reset()`. All long loops (menu, display, I2C retry, solenoid pulse) pat it.
  RSTDISBL must never be burned (PB3 is /RESET on J3).
- **EESAVE**: the wear-leveled valve-state journal and the user schedule live in EEPROM and
  must survive reflashing. Without EESAVE, every flash erases the commanded-valve record and
  the boot reconciliation will re-derive state from the schedule (safe, but pulses once).
- **BOD 2.7 V**: guarantees clean EEPROM writes and sane behavior as VM collapses; the
  TPS3839 (2.93 V) + hardware one-shot act first, BOD is the backstop.

## 2. Flashing via J3 (in-circuit ISP)

J3 is a standard AVR-ISP-6 (DNP in production — fit a header or use a pogo adapter):
J3.1=MISO(PA5), J3.2=VCC, J3.3=SCK(PA4), J3.4=MOSI(PA6), J3.5=/RESET, J3.6=GND.

**Caveats (from NETLIST.md Section 1 — read before flashing):**

1. **3.3 V only.** The programmer must target/supply 3.3 V on J3.2. Never program at 5 V:
   the DS3231M and the 3.3 V-rail parts sit directly on the shared lines.
2. **The RTC shares SCK/MOSI.** SCL/SDA double as ISP SCK/MOSI, and R2/R3 10K pull-ups stay
   connected. 10K to 3.3 V is far too weak to bother a push-pull programmer, but the DS3231M
   *watches* the SPI traffic and could theoretically decode a spurious I2C write. Mitigation:
   - program at **SCK ≤ 125 kHz** (`avrdude -B 8` on USBasp/AVRISP),
   - after every flash, **set the clock and let the firmware reprogram the alarms** (the
     firmware rewrites alarm registers + control on every boot anyway, and flags OSF).
3. **Expect solenoid silence during flash.** R14/R15 pull-downs keep the DRV8871 asleep while
   /RESET is held. If VCC dips below 2.93 V during programming, U5/U6 will fire a hardware
   CLOSE pulse — harmless (valve is bistable; boot reconciliation corrects state).
4. WDTON does not interfere with ISP (the chip is held in reset throughout).

## 3. Compile / toolchain note

**No AVR toolchain is installed on this machine — this sketch is written conservatively but
has NOT been compiled.** Validation requires arduino-cli + ATTinyCore (or avr-gcc):

```
arduino-cli core install ATTinyCore:avr --additional-urls \
  http://drazzy.com/package_drazzy.com_index.json
arduino-cli compile \
  --fqbn ATTinyCore:avr:attinyx4:chip=84a,clock=8internal,bod=2v7,eesave=aenable \
  co2_timer_v5.ino
```

Board settings: **ATtiny84(a), 8 MHz internal, BOD 2.7 V, millis enabled, LTO on.**
Registers used are ATtiny84A-datasheet-verified only: `USICR/USISR/USIDR` (USI TWI),
`WDTCSR` (timed-sequence prescaler write), `ADMUX/ADCSRA/ADC/DIDR0`, `GIMSK/GIFR/MCUCR/
PCMSK0`, `MCUSR`, `PORTA/B DDRA/B PINA/B`, EEPROM via `<avr/eeprom.h>`. ISR vectors:
`EXT_INT0_vect`, `PCINT0_vect`. Estimated footprint ~5–6 KB flash, well under the 8 KB part.

## 4. Architecture notes (what a reviewer should know)

- **Sleep = WDT-reset hops.** With WDTON burned, interrupt-mode WDT is unavailable, so
  power-down sleep ends in a full reset after ≤2 s. This is deliberate: boot is *quiet* on a
  WDRF-only reset (no splash, no display) and *idempotent* — `reconcile()` pulses the valve
  only when the EEPROM journal disagrees with the schedule-correct state. Idle behavior is
  sleep ~2 s → reset → ~20–50 ms of checks → sleep (≈1–2 % duty). Buttons (PCINT1/2) and
  `/ALERT` (INT0 low level) wake it immediately.
- **EEPROM wear-leveling:** valve state is journaled across 32 rotating 2-byte slots
  (`[seq, 0x50|state]` at 0x10–0x4F). Newest slot = the valid slot whose successor does not
  continue the sequence. 32 × 100k cycles ≈ 3.2 M state changes (≈2/day → effectively
  unlimited). Settings (ON/OFF/DST) live at 0x00–0x06 with magic + XOR checksum and are only
  written on wizard commit.
- **I2C robustness:** USI TWI master with a ~1 ms stuck-SCL timeout per bit, START-condition
  verification, 9-clock bus recovery + STOP on failure, and a 3-attempt retry wrapper. A
  persistent failure sets `g_rtcFault` → display shows `Err` and the schedule fails safe
  (valve CLOSED).
- **Shared `/ALERT` (PB2/INT0):** ISR masks INT0 (level-triggered) and defers; the service
  routine reads DS3231M status 0x0F — A1F/A2F set = alarm (clear flags, evaluate schedule);
  no flags (or dead bus) while the line is low = supervisor brown-out → **immediate CLOSE
  pulse + low-battery lockout**. The true safety path is U5→U6→DRV8871 in hardware; the
  firmware pulse is confirmation.
- **Battery monitoring:** VM via 100K/33K on ADC0, 13.0 mV/LSB, first conversion discarded
  (25 kΩ source impedance, C14 reservoir). Below **7.0 V** (double-checked) the valve force-
  closes and reopening locks out until VM > **8.0 V**; below 7.6 V the display nags `Lo`.
  The lockout is re-derived from a fresh reading every boot, so it survives WDT hops
  statelessly. 7.0 V keeps a comfortable margin over the DRV8871's 6.5 V minimum VM.
- **DST:** the RTC always keeps *standard* time. `dSt=1` shifts display, schedule evaluation,
  and the alarm registers by +1 h. Toggling DST never rewrites the time-of-day registers.
- **Alarms:** DS3231M Alarm1 = ON edge, Alarm2 = OFF edge, both daily (A1M4/A2M4=1),
  INTCN|A1IE|A2IE = 0x07. Reprogrammed idempotently on every boot and on wizard commit;
  OSF is preserved when clearing A1F/A2F and only cleared after the user sets the clock.

## 5. User interface

| Action | Result |
|---|---|
| Any button (display dark) | Wake display (full brightness) |
| UP short | Battery voltage view for 2 s (`b 9:2` = 9.2 V) |
| Hold SET 2 s (or hold SET at power-up) | Settings wizard |
| Wizard: `CL` → `on` → `oFF` → `dSt` | Set clock, ON time, OFF time, DST toggle |
| In wizard: UP | +1; **hold UP = fast-advance (8/s after 600 ms)** |
| In wizard: SET | Next field / next item; after `dSt` = save + 3× flash |
| Wizard idle 30 s | Cancel, nothing saved |
| Display idle 10 s / 30 s | Dim / blank & sleep |
| Colon blinking / solid | Valve OPEN / CLOSED |
| `Lo` alternating with time | VM < 7.6 V (lockout at 7.0 V) |
| `Err` | RTC unreachable or oscillator-stop flag set → set the clock |

## 6. Known limitations

- Not compiled (no toolchain here) — run the Section 3 build before release candidate.
- TM1637 driver assumes a standard 4-digit module with on-board pull-ups on J4 and a wired
  colon (digit-2 bit 7); bare TM1637 layouts without pull-ups need external 10Ks on DIO/CLK.
- `millis()` restarts on every WDT hop; all timing is relative, so nothing user-visible
  depends on it, but debug logging (none fitted) could not use it as a wall clock.
- The battery view reuses the colon as a decimal point (no DP segments on clock modules).
