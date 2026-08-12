# CO2 Timer v5 — authoritative netlist

## 2026-08-11 rev summary

This revision is the netlist truth for the regenerated schematic, PCB, BOM, and
pad oracle.

- Corrected U3 MCP1703A SOT-23A pinout: pin 1 GND, pin 2 VOUT = `+3V3`, pin 3 VIN = `VM`.
- Historical migration note: the old TPS3839/74LVC1G123 one-shot concept was replaced with U5 TPS3700DDCR on `VM`, plus U6/U7 SN74LVC1G3157DCKR takeover muxes.
- Added `VM_DIV`, `/VM_OK`, `DRV_IN1_MCU`, and `DRV_IN2_MCU`; removed `/SUPV`, `ONESHOT_Q`, `OS_CEXT`, and `OS_RC`.
- U5 uses 180K/10K 1% divider (`R13`/`R16`) for the specified 7.50V trip, 100K/10K `/VM_OK` pulls (`R17`/`R18`), and `C9` VM decoupling.
- U6/U7 select MCU drive when `/VM_OK=1` and deterministic failsafe levels when `/VM_OK=0`; `C18` is mux VCC decoupling.
- Historical migration note: the old supervisor/timing parts, R13-Rext, R16-1K, and old C8/C13 decoupler rows were removed. The new C9/C18 references are retained.
- Replaced C1 470uF with C1 and C19, each 1000uF/25V D10 x 20mm, P5.00mm.
- Replaced SC1 1F/D14.5 with CDA `CHP5R5L104R-TW`, 0.1F/5.5V, 10 x 5 x 12mm, P7.50mm vertical radial land; D2 and R5 trickle path are retained.
- Corrected D2/D3 from SOT-23AK to SOD-323 lands; D3 is the `/VM_OK` to `/ALERT` advisory isolation diode.
- Corrected F18 U4 pin 7 to PGND/GND in the BOM/netlist documentation.
- Verified J5 PJ-002A nominal land and SW1/SW2 PTS645 pin grouping against manufacturer drawings; J5 now uses the local `co2v5` footprint so the missing-library warning is cleared.

The four values `F1`, `R6`, `R13`, and `R16` are single-point constants in
`hardware_constants.py`. They are provisional pending valve MPN/coil-current
confirmation by the parallel valve-selection lane.

## Power entry and rails

| Ref | Pin/pad | Connection |
|---|---:|---|
| J1 | 1 | `VBAT1_IN` |
| J1 | 2 | `GND` |
| J6 | 1 | `VBAT2_IN` |
| J6 | 2 | `GND` |
| J5 PJ-002A | 1 tip/center | `VIN_DC` |
| J5 PJ-002A | 2 sleeve | `GND` |
| J5 PJ-002A | 3 switched NC contact | `GND` |
| D1 | A/K | `VBAT1_IN` / `VIN_OR` |
| D5 | A/K | `VBAT2_IN` / `VIN_OR` |
| D4 | A/K | `VIN_DC` / `VIN_OR` |
| F1 | 1/2 | `VIN_OR` / `VM` |
| TVS1 | A/K | `GND` / `VIN_DC` |
| TVS2 | A/K | `GND` / `VM` |
| C1 | +/- | `VM` / `GND` |
| C19 | +/- | `VM` / `GND` |

J5 requires a regulated 9–12V adapter with no more than 13V open-circuit
voltage. F1 is currently `PPTC 1.1A MF-R110`, pending valve confirmation.
C1 and C19 are parallel VM reservoir/sag-support capacitors; they are not
claimed as an unassisted 50ms valve-close energy source.

U3 is MCP1703A-3302E/CB, SOT-23A:

- pin 1 = `GND`
- pin 2 = `+3V3` (VOUT)
- pin 3 = `VM` (VIN)

C2 is `VM` to GND at the LDO input and C3 is `+3V3` to GND at the output;
C12 is an additional `+3V3` bulk capacitor.

## MCU, RTC, and backup

U1 ATtiny84A-SSU:

| Pin | Net |
|---:|---|
| 1 | `+3V3` |
| 2 | `DRV_IN1_MCU` |
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

U2 DS3231M+TRL: pin 2 `+3V3`, pin 13 GND, pin 14 `VBAT_RTC`, pin 15
`SDA`, pin 16 `SCL`, pin 3 `/ALERT`; pins 1 and 4 are NC. Datasheet NC
pads 5–12 are tied to GND as represented in the schematic.

RTC backup is:

`+3V3 -> R5 220R -> VBAT_CHG -> D2 BAT54 (A=VBAT_CHG, K=VBAT_RTC) -> SC1+`.

SC1 is CDA/Zhifengwei `CHP5R5L104R-TW`, Digi-Key `4688-CHP5R5L104R-TW-ND`,
0.1F, 5.5V, 10 x 5 x 12mm, 7.50mm lead pitch, vertical radial. At the
DS3231M approximately 3uA timekeeping draw, 0.1F from 3.0V to 2.3V is about
6.5 hours idealized, exceeding the one-hour battery-swap/brief-outage
requirement. R5 limits initial charging current to about 15mA and has a
reasonable approximately 22-second empty-capacitor time constant for this
smaller capacitor. SC1- is GND.

## Solenoid driver and adopted fail-safe

U4 DRV8871DDAR:

| Pin | Net |
|---:|---|
| 1 | `GND` |
| 2 | `DRV_IN2` |
| 3 | `DRV_IN1` |
| 4 | `ILIM` |
| 5 | `VM` |
| 6 | `SOL_OUT1` |
| 7 | `GND` / PGND |
| 8 | `SOL_OUT2` |
| exposed pad | `GND` |

J2 pin 1 = `SOL_OUT1`, pin 2 = `SOL_OUT2`. R14 and R15 are 100K pulldowns
from `DRV_IN1` and `DRV_IN2` to GND. R6 is currently 43K 1% from `ILIM` to
GND, pending valve MPN/coil-current confirmation.

U5 TPS3700DDCR, SOT-23-6, is powered from `VM`:

| Pin | Function / net |
|---:|---|
| 1 | OUTA = `/VM_OK` |
| 2 | GND |
| 3 | INA+ = `VM_DIV` |
| 4 | INB- = GND |
| 5 | VDD = `VM` |
| 6 | OUTB = NC |

R13 = 180K 1% from `VM` to `VM_DIV`; R16 = 10K 1% from `VM_DIV` to GND.
This implements the specified approximately 7.50V trip. R17 = 100K from
`/VM_OK` to GND and R18 = 10K from `/VM_OK` to `+3V3` provide defined behavior
while the supervisor output is open collector. C9 = 100nF from VM to GND.

U6 and U7 are SN74LVC1G3157DCKR, SC-70-6. The verified DCK pinout is
1=B2, 2=GND, 3=B1, 4=A, 5=VCC, 6=S.

| Ref | 1 B2 | 2 | 3 B1 | 4 A | 5 | 6 S |
|---|---|---|---|---|---|---|
| U6 | `DRV_IN1_MCU` | GND | GND | `DRV_IN1` | `+3V3` | `/VM_OK` |
| U7 | `DRV_IN2_MCU` | GND | `+3V3` | `DRV_IN2` | `+3V3` | `/VM_OK` |

C18 = 100nF from `+3V3` to GND. Healthy `/VM_OK=1` selects B2 and passes
the MCU outputs. When VM falls below the threshold, `/VM_OK=0` selects the
fixed fail-safe B1 levels: U6 forces DRV_IN1 low and U7 forces DRV_IN2 high,
commanding the adopted close state while the valve remains controllable by
the driver. There is no RC timing element and no timing-dependent pulse width.
D3 has A=`/ALERT`, K=`/VM_OK` and is advisory isolation only; R4 still pulls
`/ALERT` up to `+3V3`.

## Sense, display, and controls

- R7 = 100K from `VM` to `VM_SENSE`; R8 = 33K from `VM_SENSE` to GND; C14 = 100nF from `VM_SENSE` to GND; TP3 = `VM`.
- J3 AVR-ISP: 1 MISO, 2 +3V3, 3 SCL, 4 SDA, 5 /RESET, 6 GND; TP1 = MISO.
- J4 display: 1 +3V3, 2 GND, 3 TM_DIO, 4 TM_CLK.
- SW1 PTS645SM43SMTR92LFS: pins 1/2 common = `BTN_UP_SW`, pins 3/4 common = GND; R11 pull-up, R9 series, C10 debounce.
- SW2 PTS645SM43SMTR92LFS: pins 1/2 common = `BTN_SET_SW`, pins 3/4 common = GND; R12 pull-up, R10 series, C11 debounce.
- The C&K SMT drawing specifies the 6 x 6mm body, 4.5mm pad-row spacing and 1.8 x 1.4mm lands used by the local custom footprint.

## PCB placement report

The generated 70 x 50mm two-layer board keeps the front edge at x=0. J5,
SW1, SW2, and J4 are on that front-facing edge; J1/J6 are internal-side
connectors at x=14/54; J2 is internal at x=38. The tall parts are kept away
from the display region:

- C1: center (57.0, 42.0) mm, D10 x 20mm vertical can.
- C19: center (64.0, 31.5) mm, D10 x 20mm vertical can.
- SC1: center (56.5, 34.5) mm, 10 x 5 x 12mm vertical radial.

The 22mm maximum can height and 12mm SC1 height remain below the 28mm
component-height allowance above the 10mm standoffs.

## Reference inventory

U1–U7; J1–J6; D1–D5 plus TVS1/TVS2; C1–C7, C9–C12, C14, C18, C19; SC1;
R1–R18; SW1/SW2; TP1–TP3. The obsolete timing parts and nets are intentionally
absent.
