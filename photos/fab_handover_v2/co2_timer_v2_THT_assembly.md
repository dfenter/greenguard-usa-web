# CO2 Trap Timer v2 — THT Hand-Assembly List

**GreenGuard USA | Timer-001 Rev 2.0**

These components are THT and must be hand-soldered after SMT reflow.
The SMT assembly house will **not** place these parts.

---

## THT — Turnkey (CM sources and installs)

| Ref | Description | Value / Package | MPN | Notes |
|-----|-------------|-----------------|-----|-------|
| D1 | Reverse-polarity diode | 1N4007 DO-41 | 1N4007-E3/54 | Cathode toward VIN_PROTECTED — observe band orientation |
| D2 | RTC INT isolation diode | 1N4007 DO-41 | 1N4007-E3/54 | Cathode to PB2 / anode to DS3231 INT |
| D3 | Flyback diode | 1N4007 DO-41 | 1N4007-E3/54 | Across solenoid driver; observe polarity per silkscreen |
| Q1 | N-channel MOSFET | IRL540NPBF TO-220 | IRL540NPBF | Vertical; flat face per silkscreen orientation |
| SW1 | Tactile button — UP | 6x6mm THT | PTS645SM43SMTR92LFS | Must align with 6 mm lid hole; verify height before soldering |
| SW2 | Tactile button — SET | 6x6mm THT | PTS645SM43SMTR92LFS | Must align with 6 mm lid hole; verify height before soldering |
| C1 | Bulk electrolytic cap | 100µF 16V radial | ECA-1CM101 | Observe polarity (long lead = +); near solenoid driver |
| J1 | Screw terminal — battery | 2P 5.08mm angled | 1729128 | Wire entry faces board edge |
| J2 | Screw terminal — solenoid | 2P 5.08mm angled | 1729128 | Wire entry faces board edge |
| J3 | ICSP programming header | 2x3 2.54mm | TSW-103-07-G-D | Pin 1 mark matches silkscreen; used for in-circuit firmware flashing |
| J4 | Display module connector | 1x4 2.54mm | TSW-104-07-G-S | VCC / GND / CLK / DIO — mates with TM1637 module 4-pin header |
| U1_SOCKET | DIP-8 IC socket | 8-pin 0.3" | 4808-3000-CP | **Install socket, not U1 directly.** Buyer inserts pre-programmed ATtiny85 chip after delivery. |

---

## THT — Consignment (buyer ships to CM pre-programmed)

| Ref | Description | Value / Package | MPN | Notes |
|-----|-------------|-----------------|-----|-------|
| U1 | ATtiny85-20PU MCU | DIP-8 | ATTINY85-20PU | **Do NOT solder directly.** Buyer ships chips pre-programmed via J3 ICSP or ZIF socket programmer. CM inserts chip into U1_SOCKET after delivery inspection. |

---

## Assembly Notes

- **Button height:** Before soldering SW1/SW2, temporarily close the enclosure lid and confirm button cap protrudes ~1 mm through the 6 mm lid hole. Adjust standoff trim or cap selection if needed.
- **J4 orientation:** Pin 1 (VCC) is closest to the top board edge. TM1637 module plugs in directly — no wiring harness required.
- **U1_SOCKET:** Install with notch matching PCB silkscreen. Do not solder U1 into the socket; leave socket empty for buyer to insert after programming.
- **C1 polarity:** Positive lead goes to the RAW_9V rail. Observe silkscreen "+" marking.
