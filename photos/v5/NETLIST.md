# CO2 Timer v5 — Definitive Pin Map & Netlist

**GreenGuard USA | Timer-001 Rev 5.0 | Netlist Architect output | 2026-07-09**

Scope: authoritative MCU pin assignment (including the 9-functions/8-pins resolution) and the complete
component-pin -> net mapping for every refdes. Schematic capture and PCB layout must follow this document
exactly. Discrepancies between this document and the synthesized design spec are called out explicitly in
Section 5 (they are deliberate datasheet corrections, not omissions).

---

## 1. Pin-budget resolution (9 functions, 8 free pins)

After reserving PA4=SCL, PA6=SDA (USI I2C, shared with ISP SCK/MOSI), PA5=ISP MISO, and PB3=/RESET,
eight GPIO remain (PA0-PA3, PA7, PB0-PB2) for nine required functions
(IN1, IN2, TM_DIO, TM_CLK, BTN_UP, BTN_SET, RTC_INT, SUPERVISOR_INT, ADC_VM).

**Resolution chosen: merge RTC /INT and supervisor /RESET-out onto ONE shared active-low interrupt net
(`/ALERT`) on PB2/INT0, with diode isolation for the supervisor.**

Rationale (why this is the defensible merge, vs. the alternatives):

1. **Disambiguation is free.** DS3231M alarm events set A1F/A2F in the status register (0x0Fh). ISR reads
   it over I2C: flag set -> RTC alarm; flag clear -> supervisor brown-out. No information is lost.
2. **The supervisor interrupt is not the safety mechanism.** The hard guarantee (valve closes on supply
   collapse) is carried by U5 -> U6 one-shot -> DRV8871 IN2 entirely in hardware, MCU dead or alive. The
   MCU's copy of the supervisor signal is merely advisory (display "LOW BATT", stop scheduling opens), so
   sharing it costs nothing in safety.
3. **Electrical compatibility.** DS3231M /INT is open-drain and connects to `/ALERT` directly. TPS3839 is
   push-pull, so it gets a BAT54 (D3) in series (cathode toward the supervisor) so it can only pull
   `/ALERT` low, never fight the RTC or the 10K pull-up (R4).
4. **PB2 = INT0** gives a true low-level external interrupt, which wakes the ATtiny84A from power-down on
   level (not just edge), correct for both an RTC alarm and a brown-out latching low.
5. Rejected alternatives: sharing a button with the ADC pin complicates the divider and breaks battery
   telemetry while a button is held; dropping to a polled supervisor line still costs the same pin and
   loses wake-from-sleep.

Accepted compromises: (a) ISR must do one I2C status read to classify the interrupt; (b) if an RTC alarm
and a brown-out land in the same instant, brown-out is inferred only after the RTC flag is serviced —
acceptable because U6 has already forced the close pulse in hardware.

### ISP / I2C sharing (PA4/PA6)

SCL and SDA double as ISP SCK/MOSI (sharing is normal: ISP is only active with /RESET held low).
- R2/R3 10K I2C pull-ups remain connected during programming; 10K to 3.3 V is far too weak to interfere
  with any AVR ISP programmer (they drive push-pull).
- The DS3231M sits on the bus during programming and will see SPI edge patterns. A falsely decoded I2C
  write is statistically possible; mitigation: program at <=125 kHz SCK, and firmware policy is that
  time/alarms are always re-initialized after flashing. Documented, accepted.
- The programmer must supply/see 3.3 V on J3.2 (never program at 5 V: DS3231M VCC max and the 3.3 V rail
  parts forbid it).
- PA5/MISO carries no board function (spare); routed only to J3.1 and test point TP1.

---

## 2. U1 MCU pin table — ATtiny84A-SSU (SOIC-14)

Physical pin numbering per Microchip ATtiny24A/44A/84A datasheet, SOIC-14 top view (pin 1 = VCC, pin 14 = GND).

| Phys pin | Port / alt functions            | v5 function                          | Net         | ISP sharing notes |
|---|---|---|---|---|
| 1  | VCC                            | +3.3 V supply                        | `+3V3`      | Decouple C6 100nF at pin |
| 2  | PB0 (XTAL1/PCINT8)             | DRV8871 IN1 = valve **OPEN** drive   | `DRV_IN1`   | R14 100K pull-down keeps driver in sleep during reset/ISP |
| 3  | PB1 (XTAL2/PCINT9)             | DRV8871 IN2 = valve **CLOSE** drive  | `DRV_IN2_MCU` | Via R16 1K into the diode-OR node `DRV_IN2`; R15 100K pull-down at node |
| 4  | PB3 (/RESET/dW/PCINT11)        | /RESET                               | `/RESET`    | R1 10K pull-up to +3V3; J3.5. RSTDISBL never burned |
| 5  | PB2 (INT0/OC0A/PCINT10)        | Shared interrupt: RTC /INT + supervisor | `/ALERT` | R4 10K pull-up; DS3231M pin 3 direct (open-drain); U5 via D3 |
| 6  | PA7 (ADC7/OC0B/PCINT7)         | TM1637 data                          | `TM_DIO`    | Dedicated (not shared with I2C, per spec) |
| 7  | PA6 (MOSI/DI/SDA/OC1A/PCINT6)  | I2C SDA (USI)                        | `SDA`       | = ISP MOSI, J3.4; R2 10K pull-up |
| 8  | PA5 (MISO/DO/OC1B/PCINT5)      | spare (ISP MISO only)                | `MISO`      | J3.1 + TP1; no board load |
| 9  | PA4 (SCK/USCK/SCL/T1/PCINT4)   | I2C SCL (USI)                        | `SCL`       | = ISP SCK, J3.3; R3 10K pull-up |
| 10 | PA3 (ADC3/T0/PCINT3)           | TM1637 clock                         | `TM_CLK`    | — |
| 11 | PA2 (ADC2/AIN1/PCINT2)         | SET button (active-low)              | `BTN_SET`   | PCINT2 wake; RC debounce C11 + R10 |
| 12 | PA1 (ADC1/AIN0/PCINT1)         | UP button (active-low)               | `BTN_UP`    | PCINT1 wake; RC debounce C10 + R9 |
| 13 | PA0 (ADC0/AREF/PCINT0)         | VM battery-sense ADC                 | `VM_SENSE`  | 100K/33K divider; ADC ref = VCC |
| 14 | GND                            | Ground                               | `GND`       | — |

Firmware constants implied: OPEN pulse = IN1 high/IN2 low; CLOSE pulse = IN2 high/IN1 low; idle = both low
(DRV8871 auto-sleep). WDTON fuse burned (~2 s always-on watchdog) per spec.

---

## 3. Complete netlist (every pin of every refdes)

Net name conventions follow v4 (`VM`, `VCC`->`+3V3`, `SDA`, `SCL`, `GND`).

### Power input & OR-ing

| Refdes | Part | Pin | Net |
|---|---|---|---|
| J1 (BAT1 9V, 5.08mm screw term) | 2-pos | 1 (+) | `VBAT1_IN` |
| | | 2 (−) | `GND` |
| J6 (BAT2 9V, 5.08mm screw term) | 2-pos | 1 (+) | `VBAT2_IN` |
| | | 2 (−) | `GND` |
| J5 (DC-005 barrel 5.5/2.1, 9–12V) | 3-pin | 1 (center/tip +) | `VIN_DC` |
| | | 2 (sleeve) | `GND` |
| | | 3 (insertion switch) | `GND` |
| D1 SS34 (DO-214AC) | anode | A | `VBAT1_IN` |
| | cathode | K | `VIN_OR` |
| D5 SS34 | A | | `VBAT2_IN` |
| | K | | `VIN_OR` |
| D4 SS34 | A | | `VIN_DC` |
| | K | | `VIN_OR` |
| F1 PPTC 1.1A hold (1812L110 / MF-R110) | 2-pin | 1 | `VIN_OR` |
| | | 2 | `VM` |
| TVS1 SMAJ15A (unidirectional) | | K | `VIN_DC` |
| | | A | `GND` |
| TVS2 SMAJ15A (unidirectional) | | K | `VM` |
| | | A | `GND` |
| C1 470µF/16V 105°C low-ESR THT radial | | + | `VM` |
| | | − | `GND` |

F1 sits AFTER the OR junction: all three sources fused (fixes v3 battery-1-only fusing). C1 is
post-fuse on `VM` as the solenoid pulse reservoir.

### U3 — MCP1703A-3302E/CB (SOT-23-3), LDO VM -> 3.3 V

| Pin | Name | Net |
|---|---|---|
| 1 | GND | `GND` |
| 2 | VIN | `VM` |
| 3 | VOUT | `+3V3` |

| Refdes | Value | Pin 1 | Pin 2 |
|---|---|---|---|
| C2 | 1µF X7R 25V 0805 (LDO input, at pin) | `VM` | `GND` |
| C3 | 1µF X7R 16V 0805 (LDO output, at pin) | `+3V3` | `GND` |
| C12 | 10µF X7R 16V 0805 (3.3V bulk) | `+3V3` | `GND` |

### U1 — ATtiny84A-SSU (SOIC-14)

| Pin | Net |
|---|---|
| 1 | `+3V3` |
| 2 | `DRV_IN1` |
| 3 | `DRV_IN2_MCU` |
| 4 | `/RESET` |
| 5 | `/ALERT` |
| 6 | `TM_DIO` |
| 7 | `SDA` |
| 8 | `MISO` |
| 9 | `SCL` |
| 10 | `TM_CLK` |
| 11 | `BTN_SET` |
| 12 | `BTN_UP` |
| 13 | `VM_SENSE` |
| 14 | `GND` |

| Refdes | Value | Pin 1 | Pin 2 |
|---|---|---|---|
| C6 | 100nF X7R 0603 (U1 VCC decouple) | `+3V3` | `GND` |
| R1 | 10K 0603 (/RESET pull-up) | `/RESET` | `+3V3` |

### U2 — DS3231M+TRL (SO-16) — **wired per Maxim datasheet pin table (this was the v3/v4 defect)**

| Pin | Datasheet name | Net |
|---|---|---|
| 1 | 32KHZ (open-drain out) | n/c (no net; unused, leave floating) |
| 2 | VCC | `+3V3` |
| 3 | /INT//SQW (open-drain) | `/ALERT` |
| 4 | /RST | n/c (internal 50K pull-up; pushbutton reset unused) |
| 5 | N.C. | `GND` (datasheet: N.C. pins must be connected to ground) |
| 6 | N.C. | `GND` |
| 7 | N.C. | `GND` |
| 8 | N.C. | `GND` |
| 9 | N.C. | `GND` |
| 10 | N.C. | `GND` |
| 11 | N.C. | `GND` |
| 12 | N.C. | `GND` |
| 13 | GND | `GND` |
| 14 | VBAT | `VBAT_RTC` |
| 15 | SDA | `SDA` |
| 16 | SCL | `SCL` |

NOTE: the synthesized spec's inline listing (13=SDA, 14=SCL, 15=/INT, 16=VCC, 8=VBAT, 4=GND) is
**incorrect** and is exactly the class of error that produced the v3/v4 defect. The table above follows the
Maxim DS3231/DS3231M SO-16 datasheet: 1=32KHZ, 2=VCC, 3=/INT//SQW, 4=/RST, 5–12=N.C., 13=GND, 14=VBAT,
15=SDA, 16=SCL. Verifier: confirm against DS3231M datasheet Rev (19-5312) pin description table.

| Refdes | Value | Pin 1 / A | Pin 2 / K |
|---|---|---|---|
| C7 | 100nF X7R 0603 (U2 VCC decouple) | `+3V3` | `GND` |
| R2 | 10K 0603 (SDA pull-up) | `SDA` | `+3V3` |
| R3 | 10K 0603 (SCL pull-up) | `SCL` | `+3V3` |
| R4 | 10K 0603 (/ALERT pull-up) | `/ALERT` | `+3V3` |
| R5 | 220R 0603 (supercap trickle) | `+3V3` | `VBAT_CHG` |
| D2 BAT54 (SOT-23) | anode | `VBAT_CHG` | — |
| | cathode | `VBAT_RTC` | — |
| SC1 supercap 1F/5.5V (Eaton PB-5R0V105-R) | + | `VBAT_RTC` | — |
| | − | `GND` | — |

Backup path: +3V3 -> R5 220R -> D2 BAT54 -> SC1/VBAT. Charged VBAT ≈ 3.0 V (within DS3231M VBAT
2.3–5.5 V). D2 blocks back-feed of the dead 3.3 V rail from the supercap.

### U4 — DRV8871DDAR (HSOP-8 PowerPAD) — **corrected pin table; DRV8871 has NO nFAULT pin**

| Pin | Datasheet name | Net |
|---|---|---|
| 1 | GND | `GND` |
| 2 | IN2 (CLOSE direction) | `DRV_IN2` |
| 3 | IN1 (OPEN direction) | `DRV_IN1` |
| 4 | ILIM | `ILIM` |
| 5 | VM | `VM` |
| 6 | OUT1 | `SOL_OUT1` |
| 7 | PGND (high-current ground path) | `GND` |
| 8 | OUT2 | `SOL_OUT2` |
| PAD | thermal pad | `GND` (stitch to B.Cu pour with thermal vias) |

NOTE: the spec's listing (4=VREF, 6=OUT2, 7=OUT1, 8=nFAULT) is wrong for DRV8871: pin 4 is named ILIM,
OUT1=6, OUT2=8, and **there is no nFAULT** (that is DRV8876/DRV8874).
CORRECTION (schematic engineer, 2026-07-09, VERIFIED against TI DRV8871 datasheet Pin Functions table):
pin 7 is **PGND** ("High-current ground path. Connect to board ground."), NOT N.C. as an earlier draft of
this document stated. It MUST be tied to `GND` (schematic and layout do so); leaving it floating would
open the H-bridge's high-current return.

| Refdes | Value | Pin 1 | Pin 2 |
|---|---|---|---|
| R6 | 43K 1% 0603 (ILIM set: I_TRIP = 64/R[kΩ] ≈ 1.49 A) | `ILIM` | `GND` |
| C4 | 10µF X7R 25V 1206 (VM local bulk, at pin 5) | `VM` | `GND` |
| C5 | 100nF X7R 25V 0603 (VM local HF, at pin 5) | `VM` | `GND` |
| R14 | 100K 0603 (IN1 pull-down: driver asleep during reset/ISP) | `DRV_IN1` | `GND` |
| R15 | 100K 0603 (IN2 node pull-down) | `DRV_IN2` | `GND` |
| R16 | 1K 0603 (MCU series into IN2 OR node) | `DRV_IN2_MCU` | `DRV_IN2` |
| J2 (solenoid, 5.08mm screw term) | 2-pos | 1 = `SOL_OUT1` | 2 = `SOL_OUT2` |

### U5 — TPS3839K33DBZR (SOT-23-3) supervisor, 2.93 V threshold on the 3.3 V rail

| Pin | Datasheet name | Net |
|---|---|---|
| 1 | GND | `GND` |
| 2 | /RESET (push-pull, active-low out) | `/SUPV` |
| 3 | VDD (monitored) | `+3V3` |

NOTE (verifier correction): TPS3839 DBZ pin order per TI datasheet SBVS193D is 1=GND, 2=/RESET, 3=VDD.
An earlier draft had /RESET on pin 1 and GND on pin 2 (swapped); that would have grounded the reset
output and driven `/SUPV` from the GND pin.

| Refdes | Value | Pin / A | Pin / K |
|---|---|---|---|
| C13 | 100nF X7R 0603 (U5 VDD) | `+3V3` | `GND` |
| D3 BAT54 (supervisor -> /ALERT isolation) | anode = `/ALERT` | cathode = `/SUPV` |

D3 lets the push-pull U5 only PULL `/ALERT` low (never drive it high against the open-drain RTC).

### U6 — SN74LVC1G123DCUR (VSSOP-8) one-shot, ~50 ms close pulse on brown-out

| Pin | Datasheet name | Net |
|---|---|---|
| 1 | /A (falling-edge trigger) | `/SUPV` |
| 2 | B (rising-edge trigger) | `+3V3` (tied inactive-enabling) |
| 3 | /CLR | `+3V3` |
| 4 | GND | `GND` |
| 5 | Q | `ONESHOT_Q` |
| 6 | Cext | `OS_CEXT` |
| 7 | Rext/Cext | `OS_RC` |
| 8 | VCC | `+3V3` |

NOTE (verifier correction): SN74LVC1G123 DCU (VSSOP-8) pin order per TI datasheet SCES586E Table 4-1
is 5=Q, 6=Cext, 7=Rext/Cext. An earlier draft had 5=Cext, 6=Rext/Cext, 7=Q (rotated), which would have
put the timing network on the output pin and taken the CLOSE-pulse drive from a capacitor pin.

| Refdes | Value | Pin 1 / A | Pin 2 / K |
|---|---|---|---|
| C9 | 470nF X7R 0603 (Cext; t_w ≈ K·R·C ≈ 47 ms) | `OS_CEXT` | `OS_RC` |
| R13 | 100K 1% 0603 (Rext) | `OS_RC` | `+3V3` |
| C8 | 100nF X7R 0603 (U6 VCC) | `+3V3` | `GND` |
| D6 BAT54 (one-shot -> IN2 diode-OR) | anode = `ONESHOT_Q` | cathode = `DRV_IN2` |

Operation: rail sag below 2.93 V -> `/SUPV` falls -> U6 fires Q high ~47 ms -> D6 drives `DRV_IN2` high
(overriding a dead/low MCU through R16; node ≈ 3.0 V >> DRV8871 VIH) -> DRV8871 pulses the solenoid CLOSED
from C1's reservoir. Works with the MCU dead, held in reset, or mid-flash.

### Battery-sense divider

| Refdes | Value | Pin 1 | Pin 2 |
|---|---|---|---|
| R7 | 100K 1% 0603 | `VM` | `VM_SENSE` |
| R8 | 33K 1% 0603 | `VM_SENSE` | `GND` |
| C14 | 100nF X7R 0603 (ADC settling; source Z ≈ 25K > 10K ADC rec.) | `VM_SENSE` | `GND` |

Full scale: 13.3 V VM = 3.3 V at ADC (ratio 0.2481). 12 V adapter reads ≈ 2.98 V.

### Display header

| Refdes | Pin | Net |
|---|---|---|
| J4 (1x4, 2.54 mm, TM1637 module) | 1 | `+3V3` |
| | 2 | `GND` |
| | 3 | `TM_DIO` |
| | 4 | `TM_CLK` |

### Buttons (active-low, RC debounce + ESD series R at MCU side)

| Refdes | Value | Pin 1 | Pin 2 |
|---|---|---|---|
| SW1 (UP, SMD tact) | pins 1&2 | `BTN_UP_SW` | pins 3&4 = `GND` |
| R11 | 10K 0603 (pull-up) | `BTN_UP_SW` | `+3V3` |
| R9 | 100R 0603 (series) | `BTN_UP_SW` | `BTN_UP` |
| C10 | 100nF X7R 0603 (at MCU side) | `BTN_UP` | `GND` |
| SW2 (SET, SMD tact) | pins 1&2 | `BTN_SET_SW` | pins 3&4 = `GND` |
| R12 | 10K 0603 (pull-up) | `BTN_SET_SW` | `+3V3` |
| R10 | 100R 0603 (series) | `BTN_SET_SW` | `BTN_SET` |
| C11 | 100nF X7R 0603 (at MCU side) | `BTN_SET` | `GND` |

### ISP header (DNP in production) — identical wiring to v4

| Refdes | Pin | Signal | Net |
|---|---|---|---|
| J3 (2x3, 2.54 mm, AVR-ISP6) | 1 | MISO | `MISO` |
| | 2 | VCC | `+3V3` |
| | 3 | SCK | `SCL` |
| | 4 | MOSI | `SDA` |
| | 5 | /RESET | `/RESET` |
| | 6 | GND | `GND` |

### Test points (layout convenience, zero cost)

| Refdes | Net |
|---|---|
| TP1 | `MISO` |
| TP2 | `/SUPV` |
| TP3 | `VM` |

---

## 4. Net summary (cross-check list)

`GND`, `+3V3`, `VM`, `VIN_OR`, `VBAT1_IN`, `VBAT2_IN`, `VIN_DC`, `VBAT_CHG`, `VBAT_RTC`,
`SDA`, `SCL`, `MISO`, `/RESET`, `/ALERT`, `/SUPV`, `ONESHOT_Q`, `OS_RC`, `OS_CEXT`,
`DRV_IN1`, `DRV_IN2_MCU`, `DRV_IN2`, `ILIM`, `SOL_OUT1`, `SOL_OUT2`, `VM_SENSE`,
`TM_DIO`, `TM_CLK`, `BTN_UP_SW`, `BTN_UP`, `BTN_SET_SW`, `BTN_SET` — 31 nets.

Refdes inventory: U1–U6, J1–J6, SW1, SW2, D1–D6 (D1/D4/D5=SS34, D2/D3/D6=BAT54), TVS1, TVS2, F1,
C1–C14, SC1, R1–R16, TP1–TP3.

---

## 5. Assumptions a verifier MUST check against datasheets

1. **DS3231M SO-16 pinout** as wired here (1=32KHZ, 2=VCC, 3=/INT//SQW, 4=/RST, 5–12=N.C., 13=GND,
   14=VBAT, 15=SDA, 16=SCL). I have deliberately overridden the synthesized spec's inline listing, which
   contradicts the Maxim datasheet. Highest-priority check — this exact pin table caused the v3/v4 defect.
2. **DS3231M N.C. pins 5–12 to GND**: DS3231 datasheet states N.C. pins must be connected to ground.
   Confirm this note also applies to the DS3231M variant (it does per the shared pin description; verify).
3. **DRV8871DDA pinout**: 1=GND, 2=IN2, 3=IN1, 4=ILIM, 5=VM, 6=OUT1, 7=PGND, 8=OUT2, PAD=GND; **no
   nFAULT exists on DRV8871** (spec's pin 8=nFAULT is wrong; nFAULT is on DRV8876/74). VERIFIED
   2026-07-09 against TI datasheet Pin Functions table: pin 7 = PGND "High-current ground path, connect
   to board ground" (earlier draft said N.C. — corrected; schematic ties pin 7 to GND).
4. **DRV8871 ILIM formula** I_TRIP(A) = 64 V / R_ILIM(kΩ); 43 kΩ -> ≈1.49 A. Verify formula constant and
   permissible R_ILIM range; adjust R6 if the datasheet constant differs.
5. **DRV8871 VIH ≈ 1.5 V max spec** so the diode-OR node (≈3.0 V through BAT54 against a low MCU pin via
   R16=1K) registers logic high. Also verify DRV8871 min VM (6.5 V) vs. sagging battery: a close pulse must
   still complete while VM > 6.5 V — firmware should trigger low-battery close well above that (the ADC
   divider + supervisor thresholds cover this; confirm ordering of thresholds).
6. **SN74LVC1G123 (DCU/VSSOP-8) pinout** as listed (1=/A, 2=B, 3=/CLR, 4=GND, 5=Q, 6=Cext, 7=Rext/Cext,
   8=VCC — VERIFIED against TI SCES586E Table 4-1, 2026-07-09) and timing equation t_w ≈ K·Rext·Cext with K≈1 for Cext ≥ ~1 nF (R13=100K, C9=470nF -> ~47 ms).
   Verify both pin map and K; also verify no spurious trigger at power-up with B and /CLR hard-tied to VCC
   (A is already low at power-on so no falling edge occurs; confirm '123 power-up behavior note).
7. **TPS3839 DBZ pinout** (1=GND, 2=/RESET, 3=VDD — VERIFIED against TI SBVS193D Section 6, 2026-07-09),
   push-pull active-low output (confirmed push-pull per datasheet pin functions), threshold variant K33 =
   2.93 V typ. If MCP809 (reset-output, push-pull) is substituted, re-verify its SOT-23 pin order — it
   differs from TPS3839 (MCP809: 1=/RST? check). Any substitute MUST keep D3/U6.A wiring polarity valid.
8. **MCP1703A-3302E/CB SOT-23-3 pinout** (1=GND, 2=VIN, 3=VOUT), VIN abs max 16 V (12 V adapter + OR-diode
   OK; SMAJ15A clamp ~24 V exceeds 16 V during a transient — verify MCP1703A survives the clamped transient
   duration, or note TVS standoff choice SMAJ13A as alternative at J5 only).
9. **ATtiny84A-SSU SOIC-14 pin order** (1=VCC, 2=PB0, 3=PB1, 4=PB3//RESET, 5=PB2, 6=PA7, 7=PA6, 8=PA5,
   9=PA4, 10=PA3, 11=PA2, 12=PA1, 13=PA0, 14=GND) and that USI SDA=PA6/SCL(USCK)=PA4.
10. **DS3231M VBAT range 2.3–5.5 V** vs. supercap charge ≈ 3.3 − V_F(BAT54, ~0.25 V at trickle current)
    ≈ 3.05 V; verify BAT54 leakage does not overcharge SC1 above 5.5 V (it cannot, source is 3.3 V) and
    that R5=220R limits inrush into a discharged 1 F cap (≈15 mA) within the LDO's 250 mA budget.
11. **ADC source impedance**: 100K||33K ≈ 25 kΩ exceeds the ATtiny's recommended ≤10 kΩ; C14 100nF makes
    it a charge reservoir. Firmware must use long sample time / discard first conversion. If verifier
    objects, drop divider to 33K/10K (raises drain from ~90 µA to ~280 µA).
12. **SMAJ15A on VM vs. 12 V supplies**: standoff 15 V is above any 12 V adapter; verify chosen adapter's
    unloaded output (cheap unregulated 12 V can idle near 15–17 V — if so, switch J5 spec to regulated
    only, or move TVS1 to SMAJ18A and re-verify MCP1703 margin).
13. **PPTC F1 1.1 A hold** vs. worst-case load: solenoid pulse ≈1.5 A for tens of ms rides through on C1
    (470 µF) + PPTC thermal time constant; verify trip time at 2× rating ≫ pulse width.
14. **Shared /ALERT**: verify DS3231M /INT is open-drain (it is, per datasheet) and TPS3839 output can sink
    through D3 with margin below U1 VIL at 3.3 V (V_OL + V_F(BAT54) ≈ 0.2+0.3 = 0.5 V < 0.3·VCC ≈ 0.99 V).
15. **ISP at 3.3 V only** and RTC-on-bus during flash (Section 1 mitigation) is an accepted risk; firmware
    re-initializes RTC time/alarms post-flash.
16. **DRV8871 auto-sleep** with both inputs low (R14/R15 pull-downs) — verify sleep entry time and that
    quiescent VM draw meets battery-life budget.
17. **J5 pin numbering** for the generic DC-005 footprint (1=tip, 2=sleeve, 3=switch) — verify against the
    actual LCSC part's footprint before layout; switch pin tied to GND assumes sleeve-switch style.

---

## 6. Enclosure-driven placement constraints (for the layout engineer, from the drilling doc)

Per `/Users/lucille/greenguard-usa-web/photos/fab_handover/CO2 Timer Enclosure Drilling.md`:
board 70×50 mm, mounting holes at (3,3)(67,3)(3,47)(67,47) 3.2 mm dia; **front (user) edge**: J5 barrel +
SW1/SW2 + J4 display header face front; **left long edge**: J1 and J6 screw terminals (openings outward);
**right long edge**: J2 solenoid terminal (opening outward). Solenoid (`VM`, `SOL_OUT1/2`, `VIN_*`) tracks
≥1 mm; B.Cu full GND pour, stitching vias, PowerPAD thermal vias under U4.
