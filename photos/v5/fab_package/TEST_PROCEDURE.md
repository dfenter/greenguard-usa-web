# CO2 Trap Timer v5.1 — First-Article Test Procedure

**GreenGuard USA | Timer-001 Rev 5.1 | 2026-08-11**

This is the acceptance procedure for the as-built board. The fail-safe chain is
`VM -> TPS3700 -> /VM_OK -> U6/U7 mux takeover -> DRV8871`, with the takeover
forcing `IN1=0, IN2=1` (CLOSE). It is a level-held hardware takeover, not a
timed monostable circuit.

## Release gates

- [ ] T0 characterizes and qualifies the actual valve sample lot before the
  trip threshold or drive limits are frozen.
- [ ] T1-T8 and graft tests G1-G3 pass on the real valve and the enclosure
  dry-fit passes.
- [ ] A written approval releases the remaining production quantity. Until
  then, only the five Bittele first articles may be in bench disposition.

## Equipment and fixtures

- Regulated 9-12 VDC adapter for J5, with no more than 13 V open-circuit
  voltage; center positive. Do not use an unregulated adapter.
- Variable bench supply for the 12 V-to-5 V ramp and the threshold tests.
- DMM, oscilloscope, current shunt or current probe, and thermocouple or
  thermal camera.
- 3.3 V-capable USBasp or AVRISP-compatible programmer and `avrdude`.
- The actual qualified valve sample, CO2 source/regulator, bubble/leak-down
  fixture, and a position or flow indicator.
- A dummy load whose measured coil resistance matches the qualified valve
  measured resistance within +/-20%. Do not substitute an arbitrary fixed
  resistance; the qualified valve measurement is the reference.
- Leads for holding U1 in reset, forcing PB0 high, and making an abrupt J5
  disconnect repeatable.

## 1. Incoming inspection

- [ ] Confirm the installed reference inventory matches the as-built NETLIST:
  U1-U7; D1-D5; TVS1/TVS2; F1; R1-R18; C1-C7, C9-C12, C14, C18, C19; SC1;
  SW1/SW2; J1-J6.
- [ ] Verify U3 MCP1703A-3302E/CB: pin 1 GND, pin 2 VOUT=`+3V3`, pin 3
  VIN=`VM`.
- [ ] Verify U4 DRV8871DDAR: pin 1 GND, pin 2 IN2, pin 3 IN1, pin 4 ILIM,
  pin 5 VM, pin 6 OUT1, pin 7 PGND/GND, pin 8 OUT2, exposed pad GND.
- [ ] Verify U5 TPS3700DDCR: VDD=`VM`, divider input=`VM_DIV`, OUTA=`/VM_OK`,
  OUTB NC, and divider values R13=180K 1% / R16=10K 1%.
- [ ] Verify U6 and U7 SN74LVC1G3157DCKR. Healthy `/VM_OK=1` passes the MCU
  inputs. Tripped `/VM_OK=0` selects U6 B1=GND and U7 B1=`+3V3`, forcing
  `DRV_IN1=0` and `DRV_IN2=1`.
- [ ] Verify C1 and C19 are each 1000 uF, 25 V, D10 x 20 mm, P5.00 mm, with
  correct polarity. They support source impedance and trip-command hold-up;
  they are not an unassisted full-pulse close-energy source.
- [ ] Verify J5 is labeled for a regulated 9-12 V adapter, <=13 V OCV. Do not
  accept an adapter solely because its nominal label says 12 V.
- [ ] Verify J3 is unpopulated in production and the board has no visible
  solder bridges, lifted pads, or mechanical damage.

## 2. Firmware, fuses, and ISP

Use the 2026-08-11 reference build:

- Flash: **~6.2 KB** (see `firmware/README.md` §3).
- SHA-256: use the SHA-256 recorded in `firmware/README.md` §3 and
  `SHA256SUMS`; do not substitute a locally rebuilt image without recording it.
- Fuses are unchanged: low `0xE2`, high `0xC5`, extended `0xFF`.

The ISP flow is unchanged. Program at 3.3 V on J3 and keep SCK at or below
125 kHz while the RTC shares the ISP lines:

```text
avrdude -c usbasp -p t84 -B 8 \
  -U lfuse:w:0xE2:m -U hfuse:w:0xC5:m -U efuse:w:0xFF:m \
  -U flash:w:CO2_Timer_v5_ATtiny84A_8MHz.hex:i
```

- [ ] Read back low/high/extended fuses and confirm `0xE2/0xC5/0xFF`.
- [ ] Confirm J3.2 is 3.3 V only. Never program from a 5 V target.
- [ ] Set the RTC after flashing and confirm there is no display or valve
  chatter during ISP.

## 3. Power-on and regulator-current test

J5 tests require the regulated adapter constraint above. Record the supply
voltage, VM, +3V3, display state, and input current.

### 3a. 9 V repeat

1. Apply 9 V through J5 with no valve connected.
2. Confirm clean startup, display activity, and no unexpected driver activity.
3. With the display on, accept **15-25 mA** input current; reject **over
   30 mA**. Record the value and check U3 for abnormal heating.
4. Confirm the RTC and controls operate before continuing.

### 3b. 12 V repeat

1. Remove power, then repeat the power-on test at 12 V using the same
   regulated adapter constraint.
2. Confirm the display, +3V3 rail, RTC, and controls remain functional.
3. Repeat the display-on current measurement: **15-25 mA** is the expected
   range; reject **over 30 mA**.
4. Observe U3 during the active display interval. This is the F11 thermal
   corner check; apply the 15-25 mA expected range and reject over 30 mA.

## 4. RTC, display, controls, and sleep smoke test

- [ ] Hold SET to enter the clock wizard; UP and SET advance through all
  fields, and a committed setting is retained.
- [ ] Verify the display battery view and the open/closed colon indication.
- [ ] Verify the display dims/blanks and the board returns to the intended
  low-current sleep behavior.
- [ ] Verify buttons and the RTC alarm wake the MCU.
- [ ] Verify a fresh or faulted RTC fails safe to the closed state and shows
  the documented error indication.
- [ ] Verify SC1 retains the RTC through the first-article power-loss test.
  Record the measured retention interval; do not infer valve behavior from
  the RTC backup capacitor.

## 5. T0 — valve characterization and qualification gate

T0 is mandatory before freezing the threshold or interpreting any current
result. Use the actual candidate valve from the qualified sample lot.

Record:

- valve manufacturer, sample-lot identifier, and production MPN (or
  `TBD — qualified sample lot`);
- cold and hot coil resistance, inductance if available, and current waveform;
- latch and unlatch voltage sweep, including operation down to 7.0 V;
- minimum pulse at the 7.60 V hardware release condition;
- closure and opening verified by valve position or CO2 flow, not merely by
  observing DRV8871 activity;
- 24-72 hour CO2 bubble leak-down at 1-2 psi for incoming qualification;
- 100 open/close cycles at the selected low-voltage operating point.

The valve class requirement is: **2-way direct-acting bistable latching
solenoid, 6VDC single-coil polarity-reversing, 1.0-1.5 mm orifice, zero
minimum differential, coil 17-30 ohm**. The production MPN remains
`TBD — qualified sample lot` and is not to be invented from a catalog class.

The drive requirement is a **6 V coil from VM=7.5-12 V, 30-50 ms pulse**.
DRV8871 with R6=43K sets approximately **1.49 A ILIM**; this is deliberately
oversized for margin, not a claim that the qualified coil draws 1.49 A.
Freeze the pulse and current acceptance values only after T0.

## 6. Valve drive and dummy-load test

1. Connect the real valve to J2, or use a dummy whose measured resistance is
   within +/-20% of the qualified valve measured resistance.
2. Capture VM, both DRV8871 outputs, and coil current for OPEN and CLOSE.
3. Confirm each commanded pulse is within the qualified 30-50 ms class and
   that the valve changes state by position or flow.
4. Confirm the output returns to the non-drive state after the pulse and that
   no MCU reset or schedule transition leaves a sustained drive.
5. Repeat with the dummy load and retain the waveform as the electrical
   reference for the first-article record.

## 7. T1-T8 — independent fail-safe verification

The supervisor watches VM directly. The TPS3700 nominal falling trip is
**7.50 V** and release is **7.60 V**. For acceptance, include the 1% divider
and TI threshold corners: falling trip **7.21–7.75 V** and rising release
**7.38–7.82 V**. The 8.2 V firmware close threshold remains above the worst-case
7.82 V rising release. Below trip, `/VM_OK=0` and the two muxes hold the bridge
at `IN1=0, IN2=1` until release. The expected hardware propagation from trip to
the live bridge is under 1 ms.

### T1 — slow VM ramp

Ramp 12 V down to 5 V at 0.1 V/s. Record the falling `/VM_OK` transition and
require **7.21–7.75 V**. Ramp back up and require the rising release transition
within **7.38–7.82 V**. Confirm `IN1=0, IN2=1` within 1 ms and record real valve
closing current and position/flow.

### T2 — MCU reset and stuck-high PB0

Repeat the threshold test with U1 held in reset and again with PB0 forced high.
The bridge must see `IN1=0, IN2=1`, never `1,1` brake and never an OPEN drive.
Pass/fail is based on actual valve closure by position or flow, not only on
DRV8871 pin activity.

### T3 — hung-MCU simulation

Build the FA-only test image from the source with the existing board options and
`-DTEST_HANG=1` (for `arduino-cli`, use
`--build-property compiler.cpp.extra_flags=-DTEST_HANG=1`). From the package root,
first stage the sketch directory:

```
mkdir -p co2_timer_v5
cp firmware/co2_timer_v5.ino firmware/pins_v5.h co2_timer_v5/
```

This flag is a test hook only and must **never** be used for production. With
healthy rails, hold both UP and SET buttons for more than 5 s; the hook enters an
intentional infinite loop with `wdt_reset()` suppressed. The first rescue close
occurs after `WDT_HOP_THRESHOLD+1` watchdog cycles (four cycles at the current
threshold); acceptance is close observed within **15 s of hang onset**, and the
valve remains closed while the hang persists. Verify that repeated
CLOSE→OPEN chatter does **not** occur. Record the reset cause and valve
position/flow. After T3, reflash the
production HEX and verify its SHA-256 against `firmware/README.md` §3 and
`SHA256SUMS`; the FA unit must not leave the test image.

### T4 — abrupt disconnect

At 9 V with the valve open, connect the qualified valve and then repeat with a
resistive dummy equal to **80% of the qualified coil resistance measured at T0**
(the worst-case current dummy; record its value and tolerance in T0). Disconnect
J5 abruptly for each load. Confirm VM remains above 6.4 V for the measured close
pulse where possible. Report the actual hold-up time and the result even if the
test fails; the abrupt-disconnect result is an explicit release gate and sets
the maximum defensible pulse width for the source-disconnect corner.

### T5 — firmware lockout and release

Verify firmware force-close when VM reads below **8.20 V**; release when VM reads
above **8.60 V sustained**, using a threshold tolerance of +/-0.15 V. The awake
path releases after 5 s; the asleep WDT-hop path releases automatically within
approximately **10 s** (three consecutive ~2 s hops). Confirm no OPEN command is
accepted while locked out.

### T6 — power-up sequencing

Test cold start and hot restart through VM=6.5-7.6 V. Confirm no spurious
OPEN pulse and no uncontrolled repeated CLOSE activity. Record the mux levels
before +3V3 is fully established; R17/R18 must leave `/VM_OK` deterministic.

### T7 — real-valve close repeatability

At VM=7.60 V, command 100 CLOSE operations on the actual valve. Require
100/100 successful latches and verify each result by position or flow. A
current pulse without a state change is a failure.

### T8 — reservoir and ESR check

Measure the parallel C1+C19 array: total capacitance must be at least **2000
uF**, ESR no more than **50 mOhm**, and measured hold-up above **6.5 V** must
be at least **200 ms** with the **same T0 resistive dummy (80% of qualified coil
resistance)** connected at J2. This is source-sag and trip-command support; it
is not a claim that the capacitors alone close an arbitrary valve after power
removal. Record the result as part of the abrupt-disconnect release gate.

## 8. Graft tests from the design judgment

### G1 — continuous-drive corner

Hold VM in the **6.5-7.4 V** band after the hardware trip. Measure coil
temperature, current, and time to source collapse while the mux holds CLOSE.
If the qualified coil cannot tolerate this sustained-drive corner, stop and
revisit the bounded-pulse architecture before release.

### G2 — reset-path matrix

Exercise power-on reset (POR), brown-out reset (BOR), external reset (EXT),
and watchdog reset (WDT). Verify the close semantics documented by the
reference firmware: non-quiet reset paths close before schedule evaluation;
ordinary quiet WDT sleep hops remain quiet when the journal agrees; repeated
WDT setup hops invoke the `.noinit` rescue close. Record reset cause, pulse,
and valve position/flow for every path.

### G3 — release debounce

Hold VM above **8.60 V** for 5 s while awake before allowing firmware lockout
release; while asleep, verify the three-hop release occurs automatically within
approximately 10 s. Verify that a shorter excursion or a drop below the release
threshold keeps the valve locked out.

## 9. Acceptance record

Attach to each first-article record:

- board serial/lot and Bittele build identifier;
- firmware SHA-256, fuse read-back, and ISP result;
- T0 valve identity, measured coil resistance, leak-down result, and
  qualification disposition;
- 9 V and 12 V display-on current measurements;
- T1-T8 and G1-G3 waveforms/results, including actual valve position/flow;
- enclosure dry-fit photographs showing the PCB, two 9 V cells, valve,
  tubing, and lid clearance.

Any failed gate holds the remaining 95 units. Release requires written
approval after corrective action and repeat testing.
