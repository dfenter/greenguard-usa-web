# CO2 Trap Timer v3 — Board Test Procedure

**GreenGuard USA | Timer-001 Rev 3.0**

---

## Equipment Required

- 5 VDC regulated bench supply (500 mA capable) or 9–12 VDC via J5 barrel jack
- Multimeter (voltage + current)
- Bistable latching solenoid (or resistive dummy load on J2)
- Small flathead screwdriver (J1/J2/J6 terminals)

---

## 1. Incoming Inspection

- [ ] Verify all SMT components present on top side (U2, U3, U4, F1, R1–R7, C2–C4)
- [ ] Verify U4 (DRV8833, TSSOP-16) — no bridged pins; confirm EP is soldered to thermal pad on B.Cu
- [ ] Verify THT components present: D1–D5 (cathode band matches square pad), C1 (+ lead to square pad), SW1/SW2, J1/J2/J3/J4/J5/J6
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
