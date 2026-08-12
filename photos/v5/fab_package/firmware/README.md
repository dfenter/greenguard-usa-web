# CO2 Timer v5 Firmware — ATtiny84A

**GreenGuard USA | Timer-001 Rev 5.1 | 2026-08-12** (originally 2026-07-09, Rev 5.0)

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
- **BOD 2.7 V**: guarantees clean EEPROM writes and sane behavior as the rails collapse;
  the TPS3700 VM supervisor (nominal 7.50 V trip; see the datasheet-corner T1 band)
  + mux takeover act far earlier, BOD is the
  last-ditch backstop for the MCU itself.

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
   /RESET is held. If the bench supply feeding VM sits below the TPS3700's 7.50 V trip during
   programming, U6/U7 hold the bridge inputs at the CLOSE state — harmless (valve is
   bistable; boot reconciliation corrects state).
4. WDTON does not interfere with ISP (the chip is held in reset throughout).

## 3. Compile / toolchain note

**COMPILED 2026-08-12** (arduino-cli 1.5.1 + ATTinyCore 1.5.2 on gg-wsl, includes the
safety changelog items 1-11): 6,492 bytes flash (79 %), 94 bytes RAM (18 %),
no warnings. Artifacts in `build/` —
`CO2_Timer_v5_ATtiny84A_8MHz.hex` (SHA-256
`64b0808ea20a9fdfb8e63ff79032c40ef1e266e1793a5ae4640142e677814453`), `.elf`. One source
fix was required: explicit prototypes for `btnPoll1`/`btnHeldMs` after the `Btn` typedef
(the Arduino builder hoists auto-prototypes above it). Build command:

```
mkdir -p co2_timer_v5
cp firmware/co2_timer_v5.ino firmware/pins_v5.h co2_timer_v5/
arduino-cli core install ATTinyCore:avr --additional-urls \
  http://drazzy.com/package_drazzy.com_index.json
arduino-cli compile \
  --fqbn "ATTinyCore:avr:attinyx4:chip=84,clock=8internal,millis=enabled,LTO=enable" \
  --output-dir build co2_timer_v5
```
(Note: the core's option is `chip=84`, not `84a` — same die/binary. BOD/EESAVE are
fuse-time settings, not compile options; they come from the Section 1 fuse bytes.)

For FA T3 only, stage the sketch directory before compiling:

```
mkdir -p co2_timer_v5
cp firmware/co2_timer_v5.ino firmware/pins_v5.h co2_timer_v5/
```

Then add `--build-property compiler.cpp.extra_flags=-DTEST_HANG=1` to the compile
command. The flag makes holding both buttons for more than 5 s enter an intentional
watchdog-reset hang; it must **never** be present in a production build. After T3,
reflash the production HEX and verify its SHA-256 against this section and
`SHA256SUMS` before releasing the FA unit.

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
- **EEPROM wear-leveling:** valve state is journaled across 32 rotating 3-byte slots
  (`[seq, val, ~val]` at 0x10–0x6F). `0xFF` is an erased/sentinel sequence and is never
  emitted; after `0xFE`, the next sequence is `0`. The loader counts successor breaks
  across the entire ring: exactly one break selects that slot; zero breaks (a fully
  continuous ring, including wrap) or two or more breaks (corruption) invalidate the
  journal, so reconciliation force-pulses to a known safe state. 32 × 100k cycles ≈
  3.2 M state changes (≈2/day → effectively unlimited). Settings (ON/OFF/DST) live at
  0x00–0x06 with magic + XOR checksum and are only written on wizard commit.
- **I2C robustness:** USI TWI master with a ~1 ms stuck-SCL timeout per bit, START-condition
  verification, 9-clock bus recovery + STOP on failure, and a 3-attempt retry wrapper. A
  persistent failure sets `g_rtcFault` → display shows `Err` and the schedule fails safe
  (valve CLOSED).
- **Shared `/ALERT` (PB2/INT0):** ISR masks INT0 (level-triggered) and defers. The service
  routine classifies by INDEPENDENT measurement: it samples VM first — `/ALERT` low with
  VM below 8.20 V is treated as the supervisor trip (**immediate CLOSE pulse + lockout**)
  even if RTC alarm flags happen to be set; only with VM healthy does an A1F/A2F flag take
  the alarm branch (clear flags, evaluate schedule). This prevents a coincident alarm from
  journaling OPEN while the muxes have physically forced CLOSE. The true safety path is the
  TPS3700 → SN74LVC1G3157 mux takeover forcing IN1=0/IN2=1 entirely in hardware; the
  firmware pulse is confirmation.
- **Battery monitoring:** VM via 100K/33K on ADC0, 13.0 mV/LSB, first conversion discarded
  (25 kΩ source impedance, C14 reservoir). The firmware force-closes when VM reads below
  **8.20 V** and locks out reopening until VM reads above **8.60 V** sustained. The awake
  path releases after 5 s; the asleep path releases after three consecutive ~2 s WDT hops,
  automatically within ~10 s. Below **8.40 V** the display nags `Lo`. The lockout latch lives
  in validated `.noinit` so it survives the 2 s WDT hops; after any non-WDT reset, a first
  live reading below 8.60 V reasserts the latch, so an 8.2–8.6 V power-cycle boots locked.
  Threshold ladder: fw 8.6/8.2 >
  HW release 7.38–7.82 > HW trip 7.21–7.75 >
  DRV8871 minimum 6.5 / UVLO 6.4.
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
| `Lo` alternating with time | VM reads below 8.40 V (force-close below 8.20 V; release above 8.60 V sustained) |
| `Err` | RTC unreachable or oscillator-stop flag set → set the clock |

## 6. Known limitations

- Compiles clean (2026-07-23, see Section 3) but has never run on hardware — first-article
  bench validation still required.
- TM1637 driver assumes a standard 4-digit module with on-board pull-ups on J4 and a wired
  colon (digit-2 bit 7); bare TM1637 layouts without pull-ups need external 10Ks on DIO/CLK.
- `millis()` restarts on every WDT hop; all timing is relative, so nothing user-visible
  depends on it, but debug logging (none fitted) could not use it as a wall clock.
- The battery view reuses the colon as a decimal point (no DP segments on clock modules).

## 7. Changelog — 2026-08-11

- Item 1: Preserve DS3231M OSF while clearing alarm flags in both alarm-clear paths.
- Item 2: Re-evaluate the schedule every 30 seconds while the main loop remains awake.
- Item 3: Force CLOSE on non-quiet resets and rescue repeated WDT setup hops with a `.noinit` counter.
- Item 4: Harden the EEPROM valve journal with a format magic byte, value inverse, tear-safe write order, and successor-break loading.
- Item 5: Validate RTC BCD minutes/hours and latch `g_rtcFault` on malformed time data.
- Item 6: Re-read OSF on every time read and fail closed when alarm programming fails via sticky `g_alarmFault`.
- Item 7: Correct the supervisor part comment and derive ADC battery scaling from the 3.3 V reference and divider.
- Item 8 (2026-08-11, post-design-judgment): lockout thresholds raised to the adopted
  ladder — force-close below 8.20 V, release above 8.60 V sustained (awake 5 s or
  asleep WDT-hop release within ~10 s; was 7.0/8.0 V);
  "Lo" warning at 8.4 V; lockout latch moved to `.noinit` (validated `0xA0|state`)
  so the 8.2–8.6 V hysteresis band survives 2 s WDT hops.
- Item 9 (2026-08-11, post-re-review): non-WDT boots in the 8.2–8.6 V band
  restore the lockout latch after the first battery sample; journal loading is
  wrap-safe with `0xFF` excluded from the sequence domain; RTC alarm-clear write
  failures set sticky `g_alarmFault` so schedule evaluation closes the valve.
- Item 10 (2026-08-11, Rev 5.1 round-3 gate): journal loads require exactly one
  successor break; rescue boots hold the forced close against schedule reopening;
  and lockout release counts three above-threshold WDT hops while asleep.
- Item 11 (2026-08-12, gate round 4): serviceAlert() classifies by independent VM
  measurement — /ALERT low with VM below 8.20 V takes the supervisor path (close +
  lockout) even when RTC alarm flags are also set, so a coincident alarm can no
  longer journal OPEN against a hardware-forced-closed valve; `g_rescueHold` now
  gates evaluateSchedule() itself, covering the alarm/periodic/menu/battery paths,
  and is released on the first completed loop pass (healthy MCU), so a rescue can
  never leave a healthy device closed indefinitely.
