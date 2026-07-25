# CO2 Timer v5 — First-Article Checklist

**Status: DESIGN COMPLETE — Ready for 10-board pilot manufacturing**

**Last Updated:** 2026-07-12

---

## Phase 1: Firmware Compilation (Pre-Manufacturing)

- [ ] Install avr-gcc (`brew install avr-gcc` or equivalent on Linux)
- [ ] Compile firmware with correct board settings:
  ```bash
  cd /Users/lucille/greenguard-usa-web/photos/v5/firmware
  # ATtiny84(a), 8 MHz internal, BOD 2.7 V, EESAVE on, millis enabled, LTO on
  avr-gcc -mmcu=attiny84 -DF_CPU=8000000UL -Os \
    -o co2_timer_v5.elf co2_timer_v5.ino
  avr-objcopy -O ihex co2_timer_v5.elf co2_timer_v5.hex
  ```
  OR via arduino-cli (once ATTinyCore board URL certificate is fixed):
  ```bash
  arduino-cli compile --fqbn ATTinyCore:avr:attinyx4:chip=84a,clock=8internal,bod=2v7,eesave=aenable \
    co2_timer_v5.ino
  ```
- [ ] Verify compiled size < 8 KB (expected ~5–6 KB)
- [ ] Generate `.hex` file for manufacturing programmer

---

## Phase 2: Manufacturing & Delivery (JLCPCB or Equivalent)

### Fab Package Contents (in `GreenGuard_CO2_Timer_v5_FabPackage.zip`)
- ✓ Gerber files (protel extended format, 1:1 1/32" grid)
- ✓ PTH/NPTH drill files (excellon format)
- ✓ JLCPCB CPL (SMT-only, no through-hole placement)
- ✓ Schematic PDF + assembly reference PDFs (top/bottom)
- ✓ FABRICATION_SPEC.md (part list, tolerances, notes)
- ✓ CO2_Timer_Enclosure_Drilling_v5.md (enclosure fit, internal layout)
- ✓ Front panel drill template (1:1 SVG)
- ✓ Firmware (binary or hex for post-fab programming)

### Manufacturing Steps
1. [ ] Upload `GreenGuard_CO2_Timer_v5_FabPackage.zip` to JLCPCB
2. [ ] Verify board preview:
   - Layout looks correct (Hammond 1554CGY footprint, 70×50 mm, 2-layer)
   - J5, SW1, SW2, J4 on front face; J1 (left 14mm from edge), J6 (left 54mm), J2 (right 38mm)
   - No silkscreen on pads (intentional for dense layout)
3. [ ] **DO NOT** assemble; order boards only (assembler will not place through-hole parts like H-bridge anyway)
4. [ ] **Allow 5–7 days for manufacturing**

### Components to Source Separately (see BOM)
- [ ] ATtiny84A-SSU (U1) — SOIC-14, buy pre-programmed if desired
- [ ] DS3231M+TRL (U2) — SO-16
- [ ] DRV8871DDAR (U4) — SOIC-8
- [ ] TPS3839K33 (U5) — SOT-23-3
- [ ] SN74LVC1G123 (U6) — SOT-23-5
- [ ] Passives: 0603 capacitors (100nF, 470µF bulk), resistors (10K, 100K, 1K, 4.7K)
- [ ] TVS diodes (BZX55C15), SS34 Schottky ORs, BAT54
- [ ] ISP header J3 (pogo adapter or 6-pin header)
- [ ] 2× 9V battery harnesses (molex or similar)
- [ ] TM1637 display module (common, ~$2)
- [ ] 2× tactile buttons (SPST, 6mm pitch)

---

## Phase 3: Board Assembly & Firmware Programming

### Hand Soldering (if assembling locally)
1. [ ] Check for DOAs: visual inspection, continuity test key nets
2. [ ] Program firmware via J3 (in-circuit ISP):
   - [ ] Fit ISP header or pogo adapter to J3
   - [ ] Set programmer to **3.3 V supply, 125 kHz clock** (avrdude: `-B 8`)
   - [ ] Burn fuses first (see firmware/README.md Section 1):
     ```bash
     avrdude -c usbasp -p t84 -B 8 \
       -U lfuse:w:0xE2:m -U hfuse:w:0xC5:m -U efuse:w:0xFF:m
     ```
   - [ ] Flash firmware:
     ```bash
     avrdude -c usbasp -p t84 -B 8 -U flash:w:co2_timer_v5.hex:i
     ```
   - [ ] Set RTC clock & verify alarms programmed (firmware does this on boot)
3. [ ] Enclosure preparation:
   - [ ] 3D-print Hammond 1554CGY enclosure (or source plastic shell)
   - [ ] Drill/CNC front and rear faces using CO2_Timer_Enclosure_Drilling_v5.md
   - [ ] Install 10mm standoffs on PCB (4× M3 nylon)
   - [ ] Verify internal component clearance (tight: 40 mm shell height, ~22 mm valve, 2× 9V cells)

---

## Phase 4: Bench Validation (First Article)

### Test Procedure Reference
See `TEST_PROCEDURE.md` for detailed steps. Key items:

1. **Power-up & Display Test**
   - [ ] No smoke, no shorts
   - [ ] Display shows time (may be 00:00 if RTC not set)
   - [ ] Buttons respond (UP → battery voltage, SET hold 2s → settings wizard)
   - [ ] Colon blinks (valve closed) or solid (valve open)

2. **Fuse Readback** (verify BOD)
   - [ ] Read fuses to confirm BOD 2.7 V was programmed
   - [ ] `avrdude -c usbasp -p t84 -U lfuse:r:-:h` should show 0xE2

3. **RTC Functionality**
   - [ ] Set clock via menu (SET hold 2s → CL → UP/SET to increment)
   - [ ] Verify time advances (check after 10–30 seconds of real time)
   - [ ] If `Err` shows, RTC failed I2C comms (debug: check DS3231M power/pull-ups)

4. **One-Shot Hardware Fail-Safe** (critical for CO2 tank safety)
   - [ ] Remove battery → firmware can't execute
   - [ ] Slowly drop VM below 7.0 V (inject current, or use voltage regulator)
   - [ ] U5 (supervisor) at 2.93 V triggers U6 (one-shot) → **valve closes via hardware**
   - [ ] No MCU involvement needed — timing is 50–100 ms hard pulse
   - [ ] With new battery, verify firmware reads lockout & prevents re-open until VM > 8.0 V

5. **470 µF Reservoir Sizing** (brownout hold-up)
   - [ ] Measure voltage sag when solenoid pulls 100–200 mA (typical)
   - [ ] Check that VCC stays > 2.93 V (supervisor threshold) for at least 100 ms
   - [ ] If dips below, supercap + DRV8871 TVS may not protect RTC
   - **Expected:** 470 µF + 100 nF provides ~100–150 mV drop for 100 ms pulse

6. **Real Solenoid Current Test** (vs DRV8871/F1 rating)
   - [ ] Wire real CO2 valve solenoid (~12 Ω, 500–800 mA @ 9V)
   - [ ] Measure peak current through DRV8871
   - [ ] Verify < 1.5 A (DRV8871 continuous at 45V is 2.8 A, but 9V rail and F1/PCB heating limit)
   - [ ] Check F1 fuse (1.5 A) doesn't blow on repeated pulses
   - [ ] Log current profile during 50 ms pulse (should be smooth, no spikes)

7. **Supercap + Generic Connector Fit** (enclosure assembly)
   - [ ] Verify supercap leads reach J1 connector w/o kinking
   - [ ] Valve barb connector (rear face) has ~22 mm clearance in shell corner
   - [ ] Battery cells fit under board with 10 mm standoffs (40 mm shell = tight)
   - [ ] No shorts between PCB and enclosure walls

8. **Schedule & Alarm Verification** (firmware logic)
   - [ ] Set ON time to current+5 min, OFF to current+10 min
   - [ ] Verify valve OPENS at ON edge (display colon solid, solenoid clicks)
   - [ ] Verify valve CLOSES at OFF edge
   - [ ] Check that alarms repeat daily (not one-time)

---

## Phase 5: Pilot Run (10 boards)

1. [ ] QA pass criteria (all 10 boards):
   - Display working, time advances
   - RTC responds, alarms fire on schedule
   - One-shot fail-safe + battery lockout functional
   - Fuse @ BOD 2.7 V confirmed
   - No DOAs or rework needed

2. [ ] Field trial (if applicable):
   - Install 1–2 boards in real CO2 traps
   - Log 30–60 day operation data (power cycles, valve pulses, battery drain)
   - Verify no unexpected resets or lockouts

3. [ ] Cost analysis:
   - Compare manufacturing cost (~$9.50–11.50/unit @ 500-qty) against v3 shipped (~$16–19/unit)
   - Verify no assembly yield losses vs v4

---

## Handoff Notes for Next Session

### If Firmware Won't Compile
- **Action:** Install avr-gcc on a Linux machine (or use WSL2 on Windows)
  - macOS is problematic; homebrew dropped avr-gcc support
  - Linux: `apt-get install avr-gcc binutils-avr avr-libc`
  - Generate `.hex` file and attach to fab order (JLCPCB can program at extra cost)

### If First-Article Fails Bench Tests
- **Most likely:** DS3231M not responsive (I2C pull-ups, power, address)
  - Check R2/R3 (10K pull-ups to 3.3V), SDA/SCL continuity to U2 pins 15–16
- **U5/U6 one-shot didn't fire:** check D3 (BAT54), capacitors C1/C2 on U6
- **Solenoid current too high:** F1 blowing → check valve resistance, DRV8871 pins 1/8 (power rails isolated?)
- **Enclosure fit:** 40 mm shell is designed-to-edge; valve must be ≤22 mm length

### Production Readiness
Once all 10 boards pass:
- [ ] Order first production run (suggested 100–500 units, ~$950–5,750 cost)
- [ ] Update SKU in Stripe/HubSpot as in-stock
- [ ] Market as "v5" successor to v3 with improved reliability + 3M cycle EEPROM journal
