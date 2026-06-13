# CO2 Trap Timer v3 — Enclosure Drilling Guide

**GreenGuard USA | Timer-001 Rev 3.0 | Hammond 1554CGY**

---

## Enclosure

| Parameter | Value |
|---|---|
| Model | Hammond 1554CGY |
| External dimensions | 120 × 65 × 40 mm (L × W × H) |
| Material | ABS, no IP rating |
| Lid | Snap-fit, long top face (120 × 65 mm) |
| Color | Clear gray (CGY) |

---

## PCB Fit

| Parameter | Value |
|---|---|
| PCB size | 70 × 50 mm |
| PCB clearance L/R | 21 mm each side |
| PCB clearance T/B | 3.5 mm each side |
| Standoffs | 4× M3 × 10 mm brass, at PCB corners (3 mm inset from each corner) |

The PCB mounts horizontally inside the lower half of the enclosure, 70 mm along the 120 mm axis.

---

## Front End Face — 65 mm W × 40 mm H

The display, buttons, and DC jack are on this face (shorter end, user-facing).

```
        65mm
┌───────────────────────────────────┐
│                                   │  40mm
│   ┌─────────────────────────┐     │
│   │   TM1637 Display        │     │  <- Approx 38mm x 12mm cutout
│   └─────────────────────────┘     │
│         ●           ●             │  <- SW1 (UP)  SW2 (SET)
│                             ◉     │  <- J5 DC barrel jack
└───────────────────────────────────┘
```

| Hole / Cutout | Position (X, Y from top-left) | Size | Purpose |
|---|---|---|---|
| Display window | 13mm, 10mm | 38 × 12 mm rectangular | TM1637 4-digit display |
| SW1 (UP) | 18mm, 30mm | 6 mm dia | UP button access |
| SW2 (SET) | 34mm, 30mm | 6 mm dia | SET button access |
| J5 DC jack | 52mm, 20mm | 12 mm dia | 5.5/2.1 mm barrel jack — fit rubber waterproof dust cap after installation |

**Power port cap:** Install a silicone/rubber protective dust cap (5.5 mm barrel, push-fit or tab-pull style) over J5 after PCB installation. Cap protects the port when power adapter is not connected and prevents moisture ingress.

**Note:** Verify all positions against the KiCad PCB layout before drilling. Positions above are approximate based on typical layout. Use a printout of the silkscreen at 1:1 scale as a drilling template.

---

## Left Side Face — 120 mm W × 40 mm H

J1 and J6 screw terminals face this side (angled terminals, opening toward PCB edge).

```
        120mm
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │  40mm
│      [====]                     [====]                          │
│       J1                          J6                           │
│      ~30mm from left             ~90mm from left               │
└─────────────────────────────────────────────────────────────────┘
```

| Hole / Slot | Position (X, Y from top-left) | Size | Purpose |
|---|---|---|---|
| J1 slot | 25mm, 25mm | 12 × 8 mm rectangular slot | Battery/power input screw terminal |
| J6 slot | 85mm, 25mm | 12 × 8 mm rectangular slot | Battery/power input screw terminal |

---

## Right Side Face — 120 mm W × 40 mm H

J2 screw terminal faces this side.

```
        120mm
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │  40mm
│                        [====]                                   │
│                          J2                                     │
│                        ~60mm from left                          │
└─────────────────────────────────────────────────────────────────┘
```

| Hole / Slot | Position (X, Y from top-left) | Size | Purpose |
|---|---|---|---|
| J2 slot | 54mm, 25mm | 12 × 8 mm rectangular slot | Solenoid output screw terminal |

---

## Rear End Face — 65 mm W × 40 mm H

CO2 tubing entry and exit for the solenoid valve. Uses panel-mount barb fittings for 6 mm OD / 4 mm ID tubing (M10 body, 10 mm panel hole).

```
        65mm
┌───────────────────────────────────┐
│                                   │  40mm
│                                   │
│     ◉               ◉             │  <- CO2 IN (left)  CO2 OUT (right)
│   [10mm]          [10mm]          │
│                                   │
└───────────────────────────────────┘
```

| Hole | Position (X, Y from top-left) | Size | Purpose |
|---|---|---|---|
| CO2 IN | 16mm, 20mm | 10 mm dia | Panel-mount barb fitting, solenoid inlet — 6 mm OD tubing |
| CO2 OUT | 49mm, 20mm | 10 mm dia | Panel-mount barb fitting, solenoid outlet — 6 mm OD tubing |

**Barb fitting spec:** M10 × 1 panel-mount straight barb, 4 mm ID barb shank (fits 6 mm OD / 4 mm ID tubing). Tighten locknut to ABS panel — do not overtighten.

**Tubing retention:** Secure tubing onto each barb with a screw-type compression clamp (worm-gear hose clamp or equivalent, sized for 6 mm OD tubing). Do not rely on friction alone — CO2 pressure will push tubing off an unclamped barb. Clamp after tubing is fully seated over the barb shank.

---

## Lid (Top Face) — 120 mm × 65 mm

No cutouts required.

---

## Assembly Sequence

1. Drill / cut all holes before PCB installation.
2. Test-fit PCB on bare standoffs before final assembly.
3. Install panel-mount barb fittings in rear face holes (CO2 IN and CO2 OUT). Thread tubing through before connecting to solenoid.
4. Install M3 × 10 mm brass standoffs in enclosure base at corner positions.
5. Mount PCB on standoffs and secure with M3 screws.
6. Route solenoid wires through J2 slot and connect to J2.
7. Route power wires through J1 or J6 slot and connect.
8. Snap lid closed.

---

## Standoff Positions

Measured from corner of enclosure interior. PCB mounting holes are 3 mm from each PCB corner.

| Standoff | X from left interior wall | Y from front interior wall |
|---|---|---|
| Front-left | 21 mm | 3.5 mm |
| Front-right | 91 mm | 3.5 mm |
| Rear-left | 21 mm | 53.5 mm |
| Rear-right | 91 mm | 53.5 mm |
