# CO2 Trap Timer v5 — Board Test Procedure

**GreenGuard USA | Timer-001 Rev 5.0**

---

## Equipment Required

- 9-12 VDC regulated bench supply (500 mA capable), current-limited to 500 mA, via J5 barrel jack (center positive)
- Multimeter (voltage + current, 4-wire or clamp for mA-range sleep current)
- Oscilloscope (2-channel, 5 MHz bandwidth minimum; current probe or 1-ohm shunt preferred)
- USBasp or AVRISP-compatible ISP programmer, 3.3 V supply mode (do not use 5 V adapters)
- avrdude (any recent version) on the test host
- Inductive dummy load for solenoid testing (see Section 4 for spec)
- Variable bench supply capable of slow ramp-down (0-15 VDC, 1 A), used for brown-out tests
- Small flathead screwdriver (J1/J2/J6 terminals)

---

## 1. Incoming Inspection

- [ ] Verify all SMT components present on top side (U1-U6, F1, TVS1, TVS2, R1-R16, C1-C14, SC1, D1-D6)
- [ ] Verify U4 (DRV8871DDAR, HSOP-8 PowerPAD) — no bridged pins; confirm EP is soldered to thermal pad on B.Cu with thermal vias
- [ ] Verify U5 (TPS3839G30DBZR, SOT-23-3) pin 1 is GND, pin 2 is /RESET, pin 3 is VDD (verify against TI SBVS193D; orientation error caused the v3/v4 defect)
- [ ] Verify U6 (SN74LVC1G123DCUR, VSSOP-8) — pin 5 is Q (output to D6 anode), not Cext; confirm C9 is on pin 6 (Cext)
- [ ] Verify U2 (DS3231M+TRL, SO-16) — pin 2 is VCC, pin 3 is /INT//SQW, pin 13 is GND, pin 14 is VBAT, pin 15 is SDA, pin 16 is SCL (verify against Maxim DS3231M Rev 19-5312; wrong pinout caused the v3/v4 defect)
- [ ] Verify THT components: D1, D4, D5 SS34 (cathode band to square pad); SC1 supercap (+ lead to VBAT_RTC); J1/J2/J5/J6 screw terminals
- [ ] Verify **J3 is NOT installed** (DNP in production — footprint must be empty)
- [ ] Verify U1 ATtiny84A-SSU (SOIC-14) is installed; confirm pin 1 (VCC notch/dot) orientation
- [ ] No visible cold joints, solder bridges, or lifted pads; check U4 EP under X-ray or by thermal imaging if available

---

## 2. ISP Flash and Fuse Verification

Perform this step before applying bench power via J5. Use the J3 footprint with a pogo adapter or solder a temporary 2x3 header.

**Caveat (from firmware/README.md Section 2, Item 1-2):**
- The programmer must target 3.3 V on J3.2. Never program at 5 V: U2 (DS3231M), U3 (MCP1703A), and all 3.3 V rail parts share the lines.
- SCL/SDA double as ISP SCK/MOSI. R2/R3 10K pull-ups stay connected; the DS3231M watches the SPI bus and may decode a spurious I2C write. Program at SCK <= 125 kHz (`-B 8` on USBasp).
- After every flash, re-initialize the clock via the wizard (firmware rewrites alarm registers on every boot).
- R14/R15 pull-downs keep the DRV8871 asleep during reset; solenoid silence during programming is expected.

### 2a. Write fuses and flash

```
avrdude -c usbasp -p t84 -B 8 \
  -U lfuse:w:0xE2:m -U hfuse:w:0xC5:m -U efuse:w:0xFF:m \
  -U flash:w:co2_timer_v5.hex:i
```

### 2b. Fuse read-back verification

Immediately after writing, read back all three fuse bytes and the lock byte and confirm against the expected values:

```
avrdude -c usbasp -p t84 -B 8 \
  -U lfuse:r:-:h -U hfuse:r:-:h -U efuse:r:-:h -U lock:r:-:h
```

| Fuse | Expected | Meaning |
|---|---|---|
| Low | `0xe2` | Internal RC 8 MHz, no CKDIV8, SUT=10 |
| High | `0xc5` | SPIEN on, **WDTON** on (watchdog always-on), **EESAVE** on (EEPROM survives erase), BOD 2.7 V, RSTDISBL off |
| Ext | `0xff` | SELFPRGEN off |
| Lock | `0xff` | No lock bits (expected for production panels) |

**WDTON check:** hfuse `0xC5` = `0b11000101`; bit 4 (WDTON) = 0 = programmed (active low fuse). Confirm.
**EESAVE check:** hfuse bit 3 = 0 = programmed. Confirm.
**BOD check:** hfuse bits 2:0 = `101` = 2.7 V threshold. Confirm.

Reject the board if any fuse byte does not match. Do not proceed to power-on tests until fuses are correct.

---

## 3. Power-On Test

1. Connect bench supply to J5 (center positive, 9 VDC, current limit 300 mA).
2. Measure current at power-on — expect < 50 mA at idle (display on, RTC active).
3. Verify display shows `----` within 1 second of power-on, then transitions to `Err` or `0000` (RTC uninitialized after flash is normal; set the clock in Section 5).
4. Measure +3V3 at C3/C6/C12 (any accessible pad on the `+3V3` net) — expect 3.28-3.32 V.
5. Measure VM at TP3 — expect (supply voltage) - V_F(D4) approximately 0.3-0.4 V below J5 input.

---

## 4. DS3231M RTC Communication

1. Hold SET button 2 seconds — display should enter the settings wizard (`CL` prompt for clock set).
2. Press UP to increment hour — confirm display increments. Hold UP to confirm fast-advance (8/s after 600 ms).
3. Press SET once — display advances to minute field.
4. Press UP to increment minute — confirm display increments.
5. Press SET to commit clock. Display shows the set time advancing in real time in HH:MM format with blinking colon (valve closed state).

Pass: time advances in real time with correct HH:MM format; no `Err` after clock set.

---

## 4a. RTC Backup Test (Supercap SC1)

This test confirms the supercap (SC1, 1F/5.5V on `VBAT_RTC`) keeps the DS3231M running through a complete power loss. This is a v5-specific feature — v3 had no backup path.

1. Apply 9 V to J5 and set the clock to a known time (e.g., 10:00).
2. Allow SC1 to charge to steady state: wait at minimum 5 * R5 * C = 5 * 220 * 1 = approximately 1100 seconds (18 minutes). Alternatively, verify VBAT_RTC is within 50 mV of its target (approximately 3.0-3.1 V; measure if VBAT_RTC is accessible).
3. **Remove all power** from J5 (and J1/J6 if connected). Board goes completely dark.
4. Wait **60 seconds**.
5. Reapply power to J5.
6. Verify display shows time within 5 s of the value set in step 1 (accounting for 60 s elapsed). If the clock shows 10:01 (or 10:00 if still within the minute), pass.

Pass: RTC retains time across a 60-second complete power loss. Fail: display shows `Err`, `----`, or `0000` = supercap uncharged, charge path faulty (check R5, D2, SC1 polarity), or DS3231M OSF set.

> Note: unlike v3, v5 has an independent supercap backup path. Full removal of all power no longer resets the RTC once SC1 is charged.

---

## 5. Display and Button UX Smoke Test

1. With the display running, press UP briefly — display should show battery voltage for 2 s (e.g., `b 9:2` = 9.2 V on a 9 V supply). Verify format and that it returns to the time view automatically.
2. Let the display idle: verify it dims at 10 s and blanks at 30 s (entering sleep). Note: sleep ends in a WDT reset approximately every 2 s; the display reactivates only on a button press or /ALERT edge.
3. While display is dark (sleep), press any button — verify display reactivates immediately.
4. Hold SET 2 s from the running display — wizard should start. Cycle through all wizard steps: `CL` (clock), `on` (ON time), `oFF` (OFF time), `dSt` (DST toggle). Confirm each step responds to UP.
5. Let wizard idle 30 s without input — verify auto-cancel with no settings saved; display returns to time.
6. Re-enter wizard; at the `dSt` step press SET to save — verify display flashes 3 times then returns to running time (confirms save acknowledged).
7. Verify colon behavior: with valve closed (post-flash, valve state unknown — a close pulse may have fired on boot) the colon should blink (valve OPEN) or be solid (valve CLOSED); set an ON time in the past so the valve opens, then confirm colon transitions to blinking.

---

## 6. Valve Output Test (Production Inductive Dummy Load)

### 6a. Dummy load specification

Use an inductive dummy that represents a typical 9-12 V bistable CO2 latching solenoid valve coil. Representative spec (e.g., Sirai/Spartan/Parker type for 1/4" CO2 service):

| Parameter | Value |
|---|---|
| Coil DC resistance (R_coil) | 30-60 ohm (select to set ~150-300 mA peak into 9 V; 60 ohm gives 150 mA at 9 V) |
| Inductance (L_coil) | 50-150 mH (sets current rise time tau = L/R; 100 mH / 50 ohm = 2 ms) |
| Construction | Wire-wound on ferrite or air-core bobbin; freewheeling diode NOT included (DRV8871 has internal recirculation) |

A suitable substitute if a production valve is unavailable: 50 ohm wirewound resistor (2 W) in series with a 100 mH inductor (rated >= 500 mA). Do not use a resistive-only dummy (the v3 90-100 ohm resistive test at ~90 mA does not exercise the DRV8871's ILIM current-sense, the fly-back energy, or the solenoid's inductive hold behavior).

### 6b. Test setup

1. Connect the inductive dummy across J2 terminals (pin 1 = SOL_OUT1, pin 2 = SOL_OUT2).
2. Connect oscilloscope channel 1 to SOL_OUT1 (J2 pin 1) and channel 2 to SOL_OUT2 (J2 pin 2), both referenced to GND. Set timebase to 20 ms/div.
3. Place a 1-ohm current-sense shunt in series with the dummy load (or use a current probe). Connect to oscilloscope channel 3 / math if available. Set 200 mA/div.
4. Set supply to 9 VDC.

### 6c. Trigger OPEN pulse

Advance time into the ON window via the wizard, or use a test firmware build with a shortened schedule offset. Allow the schedule to fire naturally (MCU wake from sleep -> reconcile -> pulse).

Observe on oscilloscope:
- SOL_OUT1 rises to approximately VM (9 V less a few hundred mV DRV8871 drop) for approximately 50 ms, then returns to 0 V.
- SOL_OUT2 remains at 0 V (held low) during OPEN, then both outputs return to 0 V (H-bridge sleep mode).
- Current waveform: rises with time constant L/R toward V/R peak, then may show ILIM clamp (approximately 1.49 A per R6 = 43K) if peak is reached before pulse ends. Peak current must be >= 100 mA (confirm coil energization) and the DRV8871 must not sustain drive after the 50 ms pulse.

### 6d. Trigger CLOSE pulse

Advance time into the OFF window.

Observe on oscilloscope:
- SOL_OUT2 rises to approximately VM for approximately 50 ms, then returns to 0 V (CLOSE direction: IN2 high, IN1 low, DRV_IN2 driven by MCU via R16).
- SOL_OUT1 remains at 0 V.
- Same current waveform criteria as OPEN.

### 6e. Pass/fail criteria

| Measurement | Pass | Fail |
|---|---|---|
| Pulse duration (both directions) | 45-55 ms | < 40 ms or > 65 ms |
| Peak current into 50 ohm / 100 mH dummy | 100-300 mA at 9 V supply (150 mA expected for 60 ohm coil) | < 80 mA (open circuit) or ILIM clamp sustained > 5 ms (short) |
| Output voltage during pulse | >= VM - 0.5 V (DRV8871 on-state drop) | < 7 V with 9 V supply |
| Quiescent current after pulse | < 5 mA into J2 | >= 5 mA (sustained drive = H-bridge not sleeping) |
| DRV8871 thermal (touch test) | Warm, not hot after 5 pulses | Hot (> 60 deg C case) = possible short or layout issue |

---

## 7. Brown-Out Fail-Safe Test

This section verifies that the solenoid closes reliably when the supply collapses, via BOTH the firmware-initiated path (ADC threshold) AND the independent hardware supervisor path (U5/U6 one-shot with MCU held in reset).

### 7a. Firmware-initiated close on ADC threshold

The firmware locks out at VM < 7.0 V and forces a CLOSE pulse plus a low-battery lockout. The `Lo` display warning appears below 7.6 V.

1. With valve OPEN (colon blinking on display), connect the variable bench supply to J5.
2. While monitoring SOL_OUT2 on the oscilloscope and VM at TP3, ramp the supply voltage down at approximately 0.5 V/s.
3. Observe:
   - At VM approximately 7.6 V: display should begin alternating between time and `Lo` (low battery nag).
   - At VM approximately 7.0 V: firmware issues a CLOSE pulse (SOL_OUT2 pulses high approximately 50 ms). Display may show `Lo` or go dark as the MCU enters lockout.
4. Ramp supply back up above 8.0 V — verify display returns to normal time view and lockout clears (reopening is permitted again by firmware).

Pass: CLOSE pulse on SOL_OUT2 observed at or before VM = 7.0 V; no OPEN pulse fires on the way down.

### 7b. Hardware supervisor path (MCU held in reset)

This test verifies the U5 (TPS3839) -> U6 (SN74LVC1G123) -> D6 -> DRV8871 IN2 hardware path operates entirely independently of the MCU firmware.

1. With valve OPEN and a fresh 9 V supply, manually assert /RESET by jumpering J3.5 (/RESET) to GND (or momentarily shorting the /RESET test pad to GND and holding it). MCU is now held in reset; display goes dark. Hold reset asserted for the duration of this sub-test.
2. Monitor TP2 (/SUPV output of U5), SOL_OUT2, and VM at TP3.
3. While /RESET is held low, slowly ramp supply down on the variable bench supply.
4. Observe:
   - At VM approximately 3.2-3.3 V (corresponding to +3V3 rail sagging below 2.93 V, the U5 threshold): TP2 (/SUPV) should pull low (U5 /RESET output asserts).
   - Immediately: U6 Q output (ONESHOT_Q) goes high for approximately 47 ms (R13 = 100K, C9 = 470 nF), driving DRV8871 IN2 via D6.
   - SOL_OUT2 should show a clean approximately 47 ms pulse (close direction) with the supply still above DRV8871 minimum VM (6.5 V); if the supply has already collapsed below 6.5 V at the threshold point, this path cannot drive the solenoid. Verify the U5 threshold fires while C1 (470 µF reservoir) and remaining supply still exceed 6.5 V.
5. Release /RESET (remove jumper). Restore supply to 9 V.

Pass: SOL_OUT2 shows a close pulse when TP2 asserts low, without any MCU involvement. U6 one-shot width should be 40-55 ms (within C9/R13 tolerance).

Note: the TPS3839G30 threshold is 2.93 V typical on the +3V3 rail. C1 (470 µF on VM) provides the reservoir energy for the close pulse. If U5 does not trip at or near 2.93 V on +3V3, check U5 orientation (pin 1 = GND, pin 2 = /RESET out, pin 3 = VDD per TI SBVS193D).

---

## 8. Sleep / Wake Test

1. Set a schedule where current time is in the OFF window (display blanks after approximately 10/30 s of idle).
2. After display blanks and board enters power-down sleep, measure current at J5 — expect approximately 115 µA total (MCU in power-down plus DS3231M active plus LDO quiescent).
3. Sleep ends in a WDT reset every approximately 2 s (WDTON burned); confirm current briefly spikes (MCU boot) then returns to sleep level within 100 ms.
4. Press UP or SET during sleep — verify display reactivates within 200 ms and schedule is re-evaluated.
5. Allow DS3231M Alarm1 or Alarm2 to fire (/ALERT goes low): board should wake, evaluate schedule, pulse valve if needed, then return to sleep.

Pass: current <= 150 µA in sleep (target approximately 115 µA); button and /ALERT wake both work.

---

## 9. Pre-Programmed U1 Verification

The firmware startup sequence on a correctly programmed chip with correct fuses:
- Displays `----` briefly
- Transitions to `Err` (OSF set on fresh chip) or `0000` if RTC uninitialized; or current time if RTC was set and supercap retained it
- Responds to SET/UP buttons immediately
- No display lockup, no rapid cycling, no solenoid chatter at boot

If chip is blank or fuses are wrong the WDT resets the board rapidly (< 2 s cycle), the display will remain off or show garbage, or the board may appear dead. Re-flash and re-verify fuses per Section 2.

---

## Pass Criteria

| Test | Pass condition |
|---|---|
| Fuse read-back | lfuse=0xE2, hfuse=0xC5 (WDTON+EESAVE+BOD2.7V confirmed), efuse=0xFF |
| Power-on | `----` then `Err`/`0000` within 1 s; +3V3 in 3.28-3.32 V; VM = supply - V_F |
| RTC comms | Wizard entry/exit and real-time advance; no `Err` after clock set |
| RTC backup | Time retained through 60-second complete power-off (supercap path) |
| Valve output — inductive | 50 ms directed pulse both directions; peak current 100-300 mA; < 5 mA quiescent |
| BOD — firmware path | CLOSE pulse at VM <= 7.0 V; `Lo` nag at <= 7.6 V |
| BOD — hardware path | SOL_OUT2 pulse when TP2 asserts, MCU in reset (U5/U6 path independent) |
| Display/buttons UX | All wizard steps work; auto-cancel at 30 s; dim/blank/wake; voltage view; colon state |
| Sleep/wake | Current <= 150 µA; WDT hop visible; button and /ALERT wake |
| U1 firmware | Clean startup; no lockup; no spurious solenoid drive |

---

## Factory Functional Test

Run after full assembly (PCB + enclosure + wiring complete). Record results per unit — any fail = reject for rework.

| # | Step | Method | Pass |
|---|------|--------|------|
| 1 | Fuse verify | Read back lfuse/hfuse/efuse via avrdude before enclosing | lfuse=0xE2, hfuse=0xC5, efuse=0xFF — exact match required |
| 2 | Apply DC adapter input | Connect 9 V DC adapter to J5 (center-positive) | No smoke; F1 does not trip; display shows `----` within 1 s |
| 3 | Apply battery 1 input | Disconnect adapter; connect 9 V battery to J1 | Same startup; OR-diode failover works |
| 4 | Apply battery 2 input | Connect 9 V battery to J6 (second battery terminal) | Same startup; D5 OR path works |
| 5 | Simultaneous inputs | Connect J5 adapter + J1 battery + J6 battery | All connected without issue; no elevated heat on D1/D4/D5 |
| 6 | +3V3 rail | Measure at C6 or C12 | 3.28-3.32 V |
| 7 | VM rail | Measure at TP3 | Supply - 0.3-0.4 V (SS34 V_F) |
| 8 | Display startup | Power on | `----` for approximately 1 s then `Err` or `0000`; no garbage or frozen digits |
| 9 | Wizard entry | Hold SET 2 s | `CL` prompt; UP increments hour; SET advances to minute; dSt step present; hold SET/SET at dSt saves; 3x flash confirm; auto-cancel at 30 s |
| 10 | RTC retention (supercap) | Set time, remove ALL power, wait 60 s, reapply | Time within 5 s of set value — requires SC1 charged (pre-charge 18 min or skip if already done) |
| 11 | Battery voltage view | Press UP briefly from running display | `b X:X` format for 2 s; returns to time |
| 12 | Solenoid OPEN pulse (inductive dummy) | Schedule ON time in past; observe J2 / oscilloscope | SOL_OUT1 high 45-55 ms; peak current 100-300 mA; < 5 mA after |
| 13 | Solenoid CLOSE pulse (inductive dummy) | Schedule OFF time in past | SOL_OUT2 high 45-55 ms; same current criteria |
| 14 | No sustained drive | After either pulse, measure J2 current | < 5 mA (coil off; bistable valve retains state) |
| 15 | BOD firmware path | Ramp supply down slowly with valve OPEN | CLOSE pulse on SOL_OUT2 at or before VM = 7.0 V; `Lo` at 7.6 V |
| 16 | BOD hardware path | Hold /RESET via J3.5, ramp supply; observe TP2 + SOL_OUT2 | TP2 asserts at approximately 2.93 V on +3V3; SOL_OUT2 pulses approximately 47 ms; MCU not required |
| 17 | Sleep current | Leave unit in OFF window (display off, past auto-blank) | Ammeter reads <= 150 µA (target approximately 115 µA) |
| 18 | Wake on alarm | Let DS3231M /ALERT fire at schedule boundary | MCU wakes; display activates; schedule re-evaluated; valve pulsed if needed |
| 19 | Wake on button | During sleep, press UP or SET | Display activates immediately; colon reflects valve state |
| 20 | Boot valve state — OFF window | Power on when time is in OFF window | No valve pulse; EEPROM state matches; no unexpected open |
| 21 | Boot valve state — ON window | Power on when time is in ON window | CLOSE then OPEN pulse fires if EEPROM state disagreed (reconcile); valve reaches known open state within 2 s |
| 22 | Colon state | After confirmed OPEN/CLOSE | Colon blinks when valve OPEN; colon solid when valve CLOSED |
| 23 | Enclosure fit | Close snap-fit lid | Lid seats fully; no component contact; J1/J5/J6 accessible; CO2 barbs accessible |

Record fuse bytes, +3V3 voltage, VM voltage, sleep current, and solenoid pulse width (OPEN and CLOSE) for each unit. These are key production metrics. Any fail = reject for rework; do not ship.
