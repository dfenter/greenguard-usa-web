# CO2 Trap Timer v5.1 — Enclosure Drilling and Dry-Fit Guide

**GreenGuard USA | Timer-001 Rev 5.1 | 2026-08-11**

## Enclosure decision

The Hammond 1554CGY enclosure is retained. Resolve the ordering MPN to
**Hammond 1554C2GY**, the 2-series polycarbonate IP68 part.

| Parameter | Current requirement |
|---|---|
| Nominal external dimensions | 120 x 65 x 40 mm |
| Material | Polycarbonate |
| Ingress rating | IP68 |
| Nominal wall thickness | 3.0 mm |
| Lid | Gasketed service lid |
| Board | 70 x 50 mm, forward-mounted |

Keep the existing v5 panel coordinates below. The first article must still be
dry-fit; the drawing is not a substitute for measuring the actual enclosure and
valve.

## PCB position and reference coordinates

Mount the PCB forward with its front edge approximately 1 mm behind the front
interior wall. Use four M3 x 10 mm standoffs at the as-built board holes. Use
the bare PCB as the drilling template and preserve the existing coordinate
mapping:

| Ref | Board coordinate (x, y) mm | Front-face position |
|---|---:|---:|
| J5 barrel jack | (6.5, 10) | X = 47.5 mm |
| SW1 / UP | (5.5, 42) | X = 15.5 mm |
| SW2 / SET | (5.5, 23.5) | X = 34.0 mm |
| J4 display header | (3.5, 28) | X = 29.5 mm |
| J1 / BAT1 | (14, 3) | Internal |
| J6 / BAT2 | (54, 3) | Internal |
| J2 / solenoid | (38, 47) | Internal |

Standoff positions, measured from the board front-left corner, remain (3,3),
(3,47), (67,3), and (67,47) mm. Do not move the PCB to compensate for a
different enclosure.

## Front end face — 65 mm W x 40 mm H

Keep the existing front panel coordinates:

| Cutout | Position (X, Y from top-left) | Size |
|---|---:|---:|
| Display window | top-left (4, 8) | 32 x 14 mm rectangle |
| SW1 / UP | center (15.5, 30) | 6 mm diameter |
| SW2 / SET | center (34.0, 30) | 6 mm diameter |
| J5 DC jack | center (47.5, 20) | 12 mm diameter |

Print the existing `front_drill_template_v5.svg` at 100% scale. Verify the
65 x 40 mm face outline and the 50 mm scale bar before drilling. Install the
J5 dust cap after assembly.

## Rear end face — 65 mm W x 40 mm H

Keep the existing two CO2 panel penetrations:

| Hole | Center (X, Y from top-left) | Size |
|---|---:|---:|
| CO2 IN | (16, 20) | 10 mm diameter |
| CO2 OUT | (49, 20) | 10 mm diameter |

Install two 6 mm barb fittings. Size and secure the tubing to the qualified
barbs during the dry-fit; exact tubing cut length is `TBD — first-article
dry-fit`.

## Side faces and lid

- Left side: no external cutouts. BAT1 and BAT2 remain inside the base tray.
- Right side: no external cutouts. The valve remains inside and J2 wiring is
  internal.
- Lid: no new cutouts. It is the service access for the two 9 V cells.

## Internal layout and mandatory dry-fit

The PCB, two 9 V batteries with snaps, qualified micro valve, two barbs, and
tubing are all internal. The micro valve envelope is approximately **40 mm
with barbs** and is intended to fit in the rear-corner slot. The valve body,
barbs, wiring bend radius, battery snaps, and lid clearance must be checked in
one bare Hammond 1554C2GY before committing the remaining 95 units.

Dry-fit sequence:

1. Install the PCB on the four standoffs and confirm front alignment.
2. Place both 9 V cells and snaps in the base tray without stressing J1/J6
   wiring.
3. Place the valve in the rear-corner slot and connect the two 6 mm barbs.
4. Route tubing with no kink or pull on the valve ports; secure each tube.
5. Fit the lid and record photographs of every clearance interface.

## Solenoid valve specification

The valve is a class specification, not a selected MPN:

| Requirement | Current specification |
|---|---|
| Valve type | 2-way direct-acting bistable latching solenoid |
| Coil drive | 6VDC single-coil, polarity-reversing |
| Orifice | 1.0-1.5 mm |
| Pressure behavior | Zero minimum differential |
| Coil resistance | 17-30 ohm class; measured production value TBD — qualified sample lot |
| Incoming qualification | 24-72 h CO2 bubble leak-down at 1-2 psi |
| Production MPN | TBD — qualified sample lot; Ningbo Gogo ETD / D1101X class is the reference class only |
| Mechanical interface | Two 6 mm barb fittings; exact hardware lot TBD |

Qualification must establish the actual coil resistance, latch behavior at the
7.60 V hardware release condition, and closure by position or CO2 flow. Do not
replace this class requirement with a pilot-operated irrigation valve.

The drive class is a 6 V coil from VM=7.5-12 V for 30-50 ms. The DRV8871 and
R6=43K provide approximately 1.49 A ILIM, deliberately oversized for margin.
The electrical dummy must match the qualified valve measured coil resistance
within +/-20%.

## Power-entry label

J5 is center-positive and requires a **REGULATED 9-12 VDC ADAPTER; <=13 V
OPEN-CIRCUIT VOLTAGE**. Put this line on the user-facing product/assembly
label. An unregulated adapter is a reject condition.
