# CO2 Trap Timer v3 — Fabrication Handover Package

**GreenGuard USA | Timer-001 Rev 3.0 | 2026-06-09**

---

## Package Contents

| File | Description |
|---|---|
| `co2_timer_v3_gerbers.zip` | All Gerber + drill files — upload directly to fab portal |
| `co2_timer_v3_BOM.csv` | Full BOM with MPN, manufacturer, Digi-Key #, LCSC #, and SMT/THT callout |
| `co2_timer_v3_CPL.csv` | Pick-and-place file (component centroids, rotation, side) |
| `co2_timer_v3_assembly_top.pdf` | Top-side assembly drawing (F.Fab + silkscreen + courtyard) |
| `co2_timer_v3_assembly_bottom.pdf` | Bottom-side assembly drawing (B.Fab + silkscreen + courtyard) |
| `FABRICATION_SPEC.md` | Full fab spec: stackup, finish, IPC class, special notes |

---

## Quick Reference

- **Quantity:** 10 boards, fully assembled
- **Assembly:** Turnkey — shop to source all parts and assemble SMT + THT
- **Board:** 70 × 50 mm, 2-layer FR-4 1.6 mm, HASL lead-free
- **SMT:** Top side only — U2, U3, U4, F1, R1–R7, C2–C4
- **THT turnkey:** D1–D5, SW1, SW2, C1, J1–J6
- **THT consignment:** U1 — buyer ships pre-programmed ATtiny84A chips separately
- **Enclosure:** Hammond 1554CGY (120 × 65 × 40 mm ABS)
- **DRC:** 0 unconnected, 0 physical violations — KiCad 10.0.3

---

## What to Send the Shop

**Quote request: 10 boards, turnkey, fully assembled (SMT + THT).**

Send the shop all files in this folder. The BOM includes MPN + Digi-Key # for every component — shop to source all parts. No consignment.

---

## Buyer Actions Before Assembly

1. **Pre-program U1:** Flash firmware .hex to bare ATtiny84A-PU chips in a ZIF socket using USBasp + avrdude. Ship programmed chips to CM with the order.
2. **Specify DIP socket:** Request CM install a 14-pin DIP socket for U1 (recommended for field replacement).
3. **Enclosure cutouts:** Front panel — display window (approx 38 × 16 mm), 2× button holes (6 mm dia), DC jack hole (12 mm dia). Side panels — 2× barb fitting holes (12 mm dia, centered on each side face).
4. **Standoffs:** 4× M3 × 10 mm brass standoffs at PCB corners before mounting in enclosure.

---

## Schematic

No schematic PDF is included in this package. The `.kicad_sch` source file was not available for export. For component-level reference, see `co2_timer_v3_BOM.csv` and `FABRICATION_SPEC.md`.

---

## Key Part Numbers at a Glance

| Ref | Part | MPN | Digi-Key |
|---|---|---|---|
| U1 | ATtiny84A MCU | ATTINY84A-PU | ATTINY84A-PU-ND |
| U2 | DS3231M RTC | DS3231M+TRL | DS3231M+TRLCT-ND |
| U3 | MCP1703A LDO 3.3V | MCP1703AT-3302E/CB | MCP1703AT-3302E/CBCT-ND |
| U4 | DRV8833 H-bridge | DRV8833PWP | 296-28875-5-ND |
| J5 | DC barrel jack | PJ-002A | CP-002A-ND |
