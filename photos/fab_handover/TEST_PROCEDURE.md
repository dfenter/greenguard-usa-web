# CO2 Trap Timer v3 — Board Test Procedure

**GreenGuard USA | Timer-001 Rev 3.0**

---

## Equipment Required

- 9–12 VDC regulated bench supply (500 mA capable), current-limited to 500 mA, via J5 barrel jack (center positive)
- Multimeter (voltage + current)
- Bistable latching solenoid (or resistive dummy load on J2)
- Small flathead screwdriver (J1/J2/J6 terminals)

---

## 1. Incoming Inspection

- [ ] Verify all SMT components present on top side (U2, U3, U4, F1, R1–R7, C2–C4)
- [ ] Verify U4 (DRV8833, TSSOP-16) — no bridged pins; confirm EP is soldered to thermal pad on B.Cu
- [ ] Verify THT components present: D1–D5 (cathode band matches square pad), C1 (+ lead to square pad), SW1/SW2, J1/J2/J4/J5/J6
- [ ] Verify **J3 is NOT installed** (DNP — J3 footprint must be empty)
- [ ] Verify U1 socket or U1 chip installed (consignment)
- [ ] No visible cold joints, solder bridges, or lifted pads

---

## 2. Power-On Test

1. Connect bench supply to J5 (center positive, 9 VDC, current limit 300 mA).
2. Measure current at power-on — expect < 50 mA at idle.
3. Verify display shows `----` within 1 second of power-on.
4. Measure 3.3 V at U3 output pin — expect 3.28–3.32 V.

---

## 3. DS3231M RTC Communication

1. Hold SET button 3 seconds — display should enter time-set mode (hour digits blinking).
2. Press UP to increment hour — confirm display increments.
3. Press SET once — display advances to minute field (minute digits blinking).
4. Press UP to increment minute — confirm display increments.
5. Hold SET 2 seconds — display exits time-set mode and shows set time running.

Pass: time advances in real time with correct HH:MM format.

> **RTC backup note:** The DS3231M has no coin cell or supercap backup. It holds time only while the board is powered by at least one input (battery or adapter). Full removal of all power resets the RTC.

---

## 3a. RTC Retention Under Partial Power Loss

This test confirms the OR-diode network allows the 9V battery to maintain the RTC while the DC adapter is disconnected.

1. Connect 9V battery to J1 AND 9V adapter to J5.
2. Set time via SET button.
3. **Disconnect DC adapter only** — leave battery connected to J1.
4. Wait 60 seconds.
5. Reconnect DC adapter.
6. Verify time is within 5 s of the set value.

Pass: RTC holds time during adapter removal when battery is present.

> **Full power-off behavior:** If both battery and adapter are removed, the RTC resets to 00:00 on next power-on. This is expected — there is no independent backup power path.

---

## 4. Valve Output Test

1. Connect a dummy load (100 ohm / 2W resistor) across J2 terminals.
2. Trigger open pulse: advance time to 5:30 AM via time-set (or shorten alarm offset in firmware test build).
3. Observe ~50 ms pulse on J2 in OPEN direction (IN1 high, IN2 low).
4. Trigger close pulse: advance time to 11:30 PM.
5. Observe ~50 ms pulse on J2 in CLOSE direction (IN2 high, IN1 low).

Pass: both pulses present, ~50 ms duration, no sustained drive.

---

## 5. Button Test

1. With display running, press UP — no action in normal mode (expected; UP only active during time-set).
2. Hold SET 3 seconds — enters time-set. Press UP; confirm increment. Press SET; confirm field advance.
3. Wait 30 seconds without pressing anything — confirm auto-exit from time-set mode (display resumes showing time).

---

## 6. Sleep / Wake Test

1. Advance time to 11:30 PM via time-set.
2. After close pulse, display turns off and board enters power-down sleep.
3. Measure current in sleep state — expect approximately 115 µA total.
4. Press any button — board wakes, display re-illuminates, evaluates schedule.

---

## 7. Pre-Programmed U1 Verification

The firmware startup sequence on a correctly programmed chip:
- Displays `----` briefly
- Transitions to current time (HH:MM) if RTC is set, or `0000` if RTC is uninitialized
- No display lockup or rapid cycling

If chip is blank or fuses are wrong the display will remain off or show garbage. Re-program using ZIF socket per `firmware/README.md`.

---

## Pass Criteria

| Test | Pass condition |
|---|---|
| Power-on | `----` appears within 1 s; 3.3 V rail in spec |
| RTC comms | Time-set entry/exit and real-time advance work |
| Valve output | 50 ms directed pulse on both OPEN and CLOSE |
| Buttons | Time-set UX fully functional; auto-exit at 30 s |
| Sleep/wake | Current drops to ~115 µA; button wakes correctly |
| U1 firmware | Clean startup sequence, no lockup |

---

## Factory Functional Test

Run after full assembly (PCB + enclosure + wiring complete). Record results per unit — any fail = reject for rework.

| # | Step | Method | Pass |
|---|------|--------|------|
| 1 | Apply DC adapter input | Connect 9 V DC adapter to J5 (center-positive) | No smoke; F1 does not trip; display shows `----` within 1 s |
| 2 | Apply battery input | Disconnect adapter; connect 9 V battery to J1 | Same startup; confirm OR-diode failover works |
| 3 | Simultaneous inputs | Connect both J5 adapter and J1 battery | Both connected without issue; no elevated heat on D1 or D4 |
| 4 | 3.3 V rail | Measure at U3 output pin | 3.28–3.32 V |
| 5 | Display startup | Power on | `----` for ~1 s then HH:MM with colon; no garbage or frozen digits |
| 6 | Time-set entry | Hold SET 3 s | Display flashes; hour field blinks; UP increments 00–23; SET advances to minutes; hold SET 2 s saves; auto-exits at 30 s if no input |
| 7 | RTC retention (partial) | Connect 9V battery to J1 + adapter to J5, set time, disconnect adapter only, wait 60 s, reconnect adapter | Time within 5 s of set value. Note: full removal of all power resets RTC (no backup cell). |
| 8 | Solenoid OPEN pulse | Advance time to 05:30 window via time-set; monitor IN1 (PA0) | IN1 HIGH for ~50 ms then LOW; valve clicks open |
| 9 | Solenoid CLOSE pulse | Advance time to 23:30 window | IN2 HIGH for ~50 ms then LOW; valve clicks closed |
| 10 | No sustained drive | After pulse, measure J2 current | < 5 mA (coil off — bistable valve retains state) |
| 11 | Sleep current | Leave unit in OFF window (display off) | Ammeter reads ≤ 150 µA (target ~115 µA) |
| 12 | Wake on alarm | Let DS3231M alarm fire at schedule boundary | MCU wakes; display activates; schedule re-evaluated; valve pulsed if needed |
| 13 | Wake on button | During sleep, press UP or SET | Display activates immediately; schedule displayed |
| 14 | Boot valve state — OFF window | Power on when time is in OFF window | No valve pulse; valve state unchanged |
| 15 | Boot valve state — ON window | Power on when time is in ON window | OPEN pulse fires unconditionally (firmware cannot know prior valve state after power loss); valve reaches known open state within 2 s |
| 16 | Enclosure fit | Close snap-fit lid | Lid seats fully; no component contact; J1/J5/J6 accessible; CO2 barbs accessible |

Record current draw at step 11 and solenoid pulse width at steps 8–9 for each unit — these are key production metrics.
