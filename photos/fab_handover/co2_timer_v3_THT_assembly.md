# CO2 Trap Timer v3 — THT Hand-Assembly Instructions

**GreenGuard USA | Timer-001 Rev 3.0**

Use this document alongside `co2_timer_v3_CPL_SMT.csv` for turnkey assembly.
The SMT line places all SMT components. This document covers all THT work.

---

## THT — Turnkey (CM sources and installs)

| Ref | Description | Value / Spec | Notes |
|-----|-------------|--------------|-------|
| D1 | 1N4007 diode | DO-41 | Battery OR-diode (J1 path); cathode band to square pad per silkscreen |
| D2 | 1N4007 diode | DO-41 | Flyback protection; observe polarity |
| D3 | 1N4007 diode | DO-41 | Flyback protection; observe polarity |
| D4 | 1N4007 diode | DO-41 | Barrel jack OR-diode (J5 path); cathode band to square pad |
| D5 | 1N4007 diode | DO-41 | Battery OR-diode (J6 path); cathode band to square pad |
| SW1 | Tactile button | 6×6 mm | UP button; must align with front panel hole |
| SW2 | Tactile button | 6×6 mm | SET button; must align with front panel hole |
| C1 | Electrolytic cap | 100 µF 16V | Bulk decoupling; positive lead to square pad per silkscreen |
| J1 | Screw terminal | 2P 5.08mm angled | Battery input 1 (9V); opening toward PCB edge / left side slot |
| J2 | Screw terminal | 2P 5.08mm angled | Solenoid output; opening toward PCB edge / right side slot |
| J4 | Pin header | 1×4 2.54mm | TM1637 display connector (VCC/GND/DIO/CLK) |
| J5 | DC barrel jack | 5.5/2.1mm PJ-002A | DC 9–12V input; center positive; front panel mount |
| J6 | Screw terminal | 2P 5.08mm angled | Battery input 2 (9V); opening toward PCB edge / left side slot |
| U1_SOCKET | DIP-14 socket | 0.3" row spacing | CM installs socket + seats buyer-supplied pre-programmed ATtiny84A chip at assembly |

---

## DNP — Do Not Install

| Ref | Description | Reason |
|-----|-------------|--------|
| J3 | 2×3 ISP pin header | Non-functional in Rev 3.0 — wired to PB0/PB1/PB2, not ATtiny84A ISP pins PA4/PA5/PA6. Do not install. Footprint reserved for v4 fix. |

> **J3 ISP note:** Do not install J3. In-circuit programming via J3 is non-functional in Rev 3.0 (wrong pins wired). Chips must be programmed in a ZIF socket by the buyer before shipment. Fix deferred to v4.

---

## THT — Consignment (buyer supplies, CM installs only)

| Ref | Description | MPN | Notes |
|-----|-------------|-----|-------|
| U1 | ATtiny84A-20PU MCU | ATTINY84A-PU | Buyer ships pre-programmed chips. CM inserts into U1_SOCKET — does not solder directly. One chip per unit. |

> **U1 programming:** Buyer flashes firmware using a ZIF socket + USBasp programmer before shipment to CM. See `firmware/README.md` and `firmware/co2_timer_v3/flash.sh` for ZIF wiring and avrdude commands. Do not attempt in-circuit programming via J3 — it is non-functional (see J3 note above).

---

## Assembly Notes

- **D1–D5 polarity:** All five 1N4007 diodes must have cathode (banded end) oriented per silkscreen square-pad marking. Reversed diodes will prevent power delivery. Check each before soldering.
- **U4 EP solder:** U4 (DRV8833, TSSOP-16) has an exposed thermal pad on the underside (B.Cu). This pad must be soldered during SMT reflow. Confirm paste was applied and collapse occurred — a cold or missing EP solder will cause U4 to fail under load.
- **C1 polarity:** Positive lead to square pad marked + on silkscreen.
- **J1/J2/J6 orientation:** Angled screw terminal openings face the PCB edge (toward the enclosure slot). Confirm orientation before soldering — reversed terminals will not align with enclosure slots.
- **J5 barrel jack:** Mounts on front face of PCB, protruding toward front panel of enclosure. Align with 12mm front-panel hole before soldering.
- **Standoff note:** After THT assembly, install 4× M3 × 10mm brass standoffs at PCB corner holes before enclosure mounting.
