# GreenGuard CO2 Trap Timer — Rev 2.0

## Schematic & Bill of Materials

### Schedule: ON 5:30 AM / OFF 11:30 PM | TM1637 Display | 2-Button Time Set | No CR2032

-----

## What Changed from Rev 1.0

|Item        |Rev 1.0                    |Rev 2.0                     |
|------------|---------------------------|----------------------------|
|Display     |None (LED blink feedback)  |TM1637 4-digit 7-segment    |
|Time setting|Single button + blink count|2-button UP/SET with display|
|Buttons     |1x tactile                 |2x tactile                  |
|RTC backup  |CR2032 coin cell           |3.3V rail (no coin cell)    |
|Status LEDs |2x (power + valve)         |Removed — display shows time|
|Net BOM cost|~$4.30/board               |~$4.05/board                |

-----

## Schematic — Net List

### Power

```
9V Battery (+) ──> [F1 Polyfuse 1A] ──> [D1 1N4007] ──> VIN_PROTECTED
VIN_PROTECTED  ──> [U3 AMS1117-3.3] ──> VCC (3.3V) ──> MCU, RTC, Display
VIN_PROTECTED  ──> RAW_9V rail ──> Solenoid (+)
GND            ──> Common ground
```

### ATtiny85 (U1) Pin Assignment

```
Pin 1  PB5/RESET  ── [R1 10kΩ] ── VCC
Pin 2  PB3        ── [R2 10kΩ pullup] ── BTN_UP (SW1) ── GND
Pin 3  PB4        ── [R3 10kΩ pullup] ── BTN_SET (SW2) ── GND
Pin 4  GND        ── GND
Pin 5  PB0        ── TM1637 CLK
Pin 6  PB1        ── TM1637 DIO
Pin 7  PB2        ── [R4 100Ω] ── MOSFET Gate (Q1)
                  ── DS3231 INT (via [D2 1N4007] diode isolation)
Pin 8  VCC        ── 3.3V
```

### DS3231 RTC (U2)

```
VCC  ── 3.3V
GND  ── GND
SDA  ── ATtiny85 PB0 (shared with TM1637 CLK via soft I2C)
SCL  ── ATtiny85 PB1 (shared with TM1637 DIO via soft I2C)
INT  ── ATtiny85 PB2 via D2 1N4007 (cathode to PB2, anode to INT)
VBAT ── 3.3V (no coin cell — powered from main rail)
32K  ── NC
```

### TM1637 Display Module

```
VCC ── 3.3V
GND ── GND
CLK ── ATtiny85 PB0
DIO ── ATtiny85 PB1
```

### Solenoid Driver

```
ATtiny85 PB2 ── [R4 100Ω] ── MOSFET Gate (Q1: IRL540N)
                              MOSFET Source ── GND
                              MOSFET Drain  ── Solenoid (-)
                              Solenoid (+)  ── RAW_9V

[D3 1N4007] Cathode ── RAW_9V
            Anode   ── MOSFET Drain  (flyback protection)

[C1 100µF 16V] across RAW_9V and GND near solenoid
```

### Decoupling

```
[C2 100nF] across VCC and GND near U1
[C3 100nF] across VCC and GND near U2
```

-----

## Bill of Materials

### PCB Components

|Ref          |Description      |Value               |Package   |LCSC # |Qty|Unit $|Ext $     |
|-------------|-----------------|--------------------|----------|-------|---|------|----------|
|U1           |Microcontroller  |ATtiny85-20PU       |DIP-8     |C89852 |1  |$1.20 |$1.20     |
|U2           |RTC              |DS3231SN            |SO-16     |C9868  |1  |$1.50 |$1.50     |
|U3           |LDO Regulator    |AMS1117-3.3         |SOT-223   |C6186  |1  |$0.15 |$0.15     |
|Q1           |N-Ch MOSFET      |IRL540NPBF          |TO-220    |C60330 |1  |$0.45 |$0.45     |
|D1           |Reverse polarity |1N4007              |DO-41     |C727110|1  |$0.05 |$0.05     |
|D2           |RTC INT isolation|1N4007              |DO-41     |C727110|1  |$0.05 |$0.05     |
|D3           |Flyback          |1N4007              |DO-41     |C727110|1  |$0.05 |$0.05     |
|SW1          |UP Button        |6x6mm Tactile       |THT       |C318884|1  |$0.05 |$0.05     |
|SW2          |SET Button       |6x6mm Tactile       |THT       |C318884|1  |$0.05 |$0.05     |
|F1           |Polyfuse         |1A / 2A trip        |1812 SMD  |C369150|1  |$0.20 |$0.20     |
|R1           |RESET pullup     |10kΩ                |0805      |C17414 |1  |$0.01 |$0.01     |
|R2           |BTN_UP pullup    |10kΩ                |0805      |C17414 |1  |$0.01 |$0.01     |
|R3           |BTN_SET pullup   |10kΩ                |0805      |C17414 |1  |$0.01 |$0.01     |
|R4           |MOSFET gate      |100Ω                |0805      |C17408 |1  |$0.01 |$0.01     |
|R5           |I2C SDA pullup   |4.7kΩ               |0805      |C17673 |1  |$0.01 |$0.01     |
|R6           |INT pullup       |10kΩ                |0805      |C17414 |1  |$0.01 |$0.01     |
|C1           |Bulk cap         |100µF 16V           |THT radial|C62923 |1  |$0.10 |$0.10     |
|C2           |Decoupling       |100nF               |0805      |C49678 |1  |$0.01 |$0.01     |
|C3           |Decoupling       |100nF               |0805      |C49678 |1  |$0.01 |$0.01     |
|J1           |Battery input    |2P 5.08mm screw term|THT       |C8465  |1  |$0.15 |$0.15     |
|J2           |Solenoid output  |2P 5.08mm screw term|THT       |C8465  |1  |$0.15 |$0.15     |
|J3           |ICSP header      |2x3 2.54mm          |THT       |C124378|1  |$0.10 |$0.10     |
|**PCB TOTAL**|                 |                    |          |       |   |      |**~$4.05**|

### Off-Board / Mechanical Components

|Item                         |Spec                          |Source         |Unit $     |
|-----------------------------|------------------------------|---------------|-----------|
|TM1637 display module        |4-digit 7-seg, red, 0.36”     |Amazon / LCSC  |$1.50      |
|Solenoid valve               |US Solid 1/4” NPT NC 12V Viton|Amazon         |$10.99     |
|IP65 ABS enclosure           |100x68x50mm                   |Amazon (Zulkit)|$7.99      |
|1/4” NPT to 6mm barb fittings|Brass x2                      |Amazon         |$3.50      |
|PG7 cable glands x2          |IP65                          |Amazon         |$2.00      |
|9V battery snap connector    |PCB mount                     |Amazon         |$1.00      |
|M3 brass standoffs 10mm x4   |PCB mount                     |Amazon         |$2.00      |
|Hook-up wire 22AWG           |Solenoid leads                |Shop stock     |$1.00      |
|**MECHANICAL TOTAL**         |                              |               |**~$29.98**|

### Total Unit Cost by Volume

|Volume          |PCB+Assembly|Mechanical|Labor|Total   |
|----------------|------------|----------|-----|--------|
|10 units (proto)|$10.60      |$29.98    |—    |**~$41**|
|100 units       |$6.00       |$18.00    |$5.00|**~$29**|
|500 units       |$4.50       |$12.00    |$3.50|**~$20**|

Retail target: **$79.99** — 66% gross margin at 100 units.

-----

## Time-Setting Instructions (for manual / label)

```
TO SET TIME:
1. Hold SET button 3 seconds → display flashes
2. Press UP to set hour (00–23)
3. Press SET to confirm hour
4. Press UP to set minutes
5. Hold SET 2 seconds to save

Display shows current time at all times.
CO2 ON: 05:30  |  CO2 OFF: 23:30
```