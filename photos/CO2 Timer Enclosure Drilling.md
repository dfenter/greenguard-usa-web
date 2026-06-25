# GreenGuard CO2 Trap Timer — Rev 2.0 Enclosure Drilling Guide

**GreenGuard USA | Timer-001 Rev 2.0 | Zulkit IP65 ABS 100×68×50 mm**

---

## Enclosure

| Parameter | Value |
|---|---|
| Model | Zulkit IP65 ABS (or equivalent) |
| External dimensions | 100 × 68 × 50 mm (L × W × H) |
| Material | ABS, IP65 |
| Lid | Screw-down, top face 100 × 68 mm |
| Color | Gray |

> **IP65 rating notice:** The enclosure is rated IP65 as shipped. After drilling the display window, button holes, and cable gland holes, the finished assembly is **splash-resistant only** unless all penetrations are sealed per the Sealing Plan section below. Do not label assembled units IP65 without sealing the display aperture and button holes.

> **Drilling template:** Use `co2_timer_v2_lid_drill_template.svg` (included in this package) to locate the display window and button holes on the lid. Print at **100% scale** — do not fit-to-page. Verify the 100 × 68 mm outer rectangle measures exactly before drilling. A misaligned display window or button hole cannot be corrected without replacing the enclosure lid.

---

## PCB Fit

| Parameter | Value |
|---|---|
| Standoffs | 4× M3 × 10 mm brass, 3 mm inset from each PCB corner |
| PCB clearance in enclosure | Fits with ~2 mm clearance on long sides |

---

## Lid (Top Face) — 100 mm × 68 mm

The display and buttons face up through the lid.

```
           100mm
┌────────────────────────────────────────────────────────┐
│                                                        │  68mm
│         ┌────────────────────────────┐                 │
│         │   TM1637 Display           │  <- 38×12 mm   │
│         └────────────────────────────┘                 │
│                                                        │
│                  ●           ●                         │
│               SW1(UP)     SW2(SET)                     │
└────────────────────────────────────────────────────────┘
```

| Hole / Cutout | Position (X, Y from top-left) | Size | Purpose |
|---|---|---|---|
| Display window | 18 mm, 10 mm | 38 × 12 mm rectangular | TM1637 4-digit display |
| SW1 — UP button | 33 mm, 40 mm | 6 mm dia | UP button access |
| SW2 — SET button | 55 mm, 40 mm | 6 mm dia | SET button access |

**Display window:** Mill or file to a clean rectangle. TM1637 module face should be flush or recessed 1–2 mm behind the lid face. A thin strip of clear acrylic or self-adhesive transparent label can be applied over the cutout for dust/moisture protection.

---

## Left Side Face — 50 mm × 68 mm

CO2 hose inlet from regulator.

```
┌────────────────────────────────────┐  68mm
│                                    │
│                                    │
│   ◎                                │  <- PG7 cable gland (CO2 IN)
│  [25, 34]                          │
│                                    │
└────────────────────────────────────┘
         50mm
```

| Hole | Position (X, Y from top-left) | Diameter | Purpose |
|---|---|---|---|
| CO2 IN cable gland | 25 mm, 34 mm | 12 mm | PG7 gland — CO2 tubing inlet from regulator |

---

## Right Side Face — 50 mm × 68 mm

CO2 hose outlet to trap.

```
┌────────────────────────────────────┐  68mm
│                                    │
│                                    │
│                               ◎    │  <- PG7 cable gland (CO2 OUT)
│                          [25, 34]  │
│                                    │
└────────────────────────────────────┘
         50mm
```

| Hole | Position (X, Y from top-left) | Diameter | Purpose |
|---|---|---|---|
| CO2 OUT cable gland | 25 mm, 34 mm | 12 mm | PG7 gland — CO2 tubing outlet to trap |

---

## Rear Face — 50 mm × 68 mm

DC barrel jack for 9 V wall adapter input.

```
┌────────────────────────────────────┐  68mm
│                                    │
│                ◎                   │  <- DC barrel jack
│           [34, 25]                 │
│                                    │
└────────────────────────────────────┘
         50mm
```

| Hole | Position (X, Y from top-left) | Diameter | Purpose |
|---|---|---|---|
| DC barrel jack | 34 mm, 25 mm | 12 mm | Panel-mount 5.5 mm / 2.1 mm barrel jack (center-positive); pigtail wired to J1 |

Install the panel-mount barrel jack and route the pigtail wires through the enclosure to J1 screw terminal. Red wire (+) to J1 positive; black wire (−) to J1 negative. Apply a small bead of RTV around the barrel jack flange inside the enclosure to restore splash resistance.

## Front Face and Bottom

No cutouts required.

---

## Standoff Positions

PCB mounting holes are at the following coordinates on the PCB (origin = bottom-left corner of board):

| Standoff | PCB X | PCB Y |
|---|---|---|
| Front-left | 3 mm | 3 mm |
| Front-right | 62 mm | 3 mm |
| Rear-left | 3 mm | 42 mm |
| Rear-right | 62 mm | 42 mm |

**Hole pitch: 59 mm (horizontal) × 39 mm (vertical).** These are exact dimensions from the KiCad PCB — use them, not approximations.

**Recommended drilling method:** Use the bare PCB as a drilling template. Center the PCB in the enclosure base at your desired position, tape it down, and mark the four mounting holes through the PCB holes with a center punch. Do not use interior wall measurements — small errors compound into misaligned standoffs. Drill 2.5 mm pilot holes (M3 standoff thread), deburr, and install 10 mm brass standoffs.

---

## 1:1 Lid Drill Template

A printable 1:1 SVG template for the lid face is provided as **`co2_timer_v2_lid_drill_template.svg`** in this package.

**To use:**
1. Open `co2_timer_v2_lid_drill_template.svg` in a browser or vector viewer.
2. Print at **100% scale** (no scaling, no fit-to-page). Verify the 100 mm × 68 mm outer rectangle measures exactly 100 mm × 68 mm on the printed sheet before cutting.
3. Cut out the paper template on the outer rectangle line.
4. Tape the template to the lid face, aligning edges.
5. Center-punch through each hole and the display window corners.
6. Drill and mill the marked features.

---

## Assembly Sequence

1. Drill/mill all lid holes and side cable gland holes before installing any components.
2. Install M3 × 10 mm brass standoffs in enclosure base at the four corner positions.
3. Thread CO2 tubing through both PG7 glands before connecting barb fittings to solenoid.
4. Install PG7 glands in left and right side holes; tighten hand-tight only (IP65 sealing — do not overtighten ABS).
5. Mount PCB on standoffs and secure with M3 screws.
6. Position solenoid valve inside enclosure; connect barb fittings on both ports.
7. Route solenoid leads to J2 screw terminal.
8. Route 9V battery snap lead to J1 screw terminal.
9. Velcro 9V battery to inside base of enclosure.
10. Align TM1637 display module behind display window and secure with hot glue or foam tape.
11. Confirm SW1/SW2 button caps protrude through lid holes before closing.
12. Seat gland seals and close lid.

---

## CO2 Tubing Notes

The PG7 cable gland accepts 4–8 mm OD cable/tubing. Standard 6 mm OD CO2 tubing fits directly.
Thread the tubing through the gland body before attaching barb fittings to the solenoid — the barb fitting OD is too large to pull back through the gland after attachment. Tighten the gland cap to grip the tubing and complete the IP65 seal.

---

## Sealing Plan — Display Window and Button Holes

The enclosure is not IP65 after drilling without additional sealing. The following options restore water resistance for outdoor deployment.

### Display window (38×12 mm rectangular cutout)

| Option | Method | Notes |
|--------|--------|-------|
| Clear acrylic insert | Cut 42×16 mm piece of 1.5 mm clear acrylic; bond to inside of lid face with clear silicone sealant | Cleanest appearance; display readable through acrylic |
| Self-adhesive clear label | Apply a 40×14 mm transparent polyester label over the outside of the cutout | Low-cost prototype option; not durable long-term |
| Potted display | Apply a thin bead of clear RTV silicone around the perimeter of the TM1637 module face after positioning it against the lid | Functional but not removable |

Recommended for production: acrylic insert bonded with Loctite 587 Blue RTV or equivalent clear silicone. Allow 24 h cure before deployment.

### Button holes (2× 6 mm dia)

| Option | Method | Notes |
|--------|--------|-------|
| IP65 push buttons | Replace SW1/SW2 with panel-mount IP65-rated momentary pushbuttons (e.g., E-Switch PB series 6 mm or similar); mount through lid holes | Best splash resistance; requires different PCB footprint — validate fit before ordering |
| Silicone boot caps | Fit 6 mm silicone rubber dust caps / waterproof caps over button stems after assembly | Low-cost retrofit; caps may impede tactile feel |
| RTV seal | Apply a thin bead of silicone sealant around each button cap where it meets the lid | Functional but blocks button removal |

Recommended for prototype: silicone boot caps (widely available, fits 6 mm hole, no PCB change needed).
Recommended for production: IP65 panel-mount buttons with matching 6 mm hole pattern.

### Summary: IP65 restoration checklist

- [ ] Display window sealed with acrylic insert + RTV, or equivalent
- [ ] Both button holes sealed with boot caps or IP65 buttons
- [ ] Both PG7 cable glands tightened; gland seals seated
- [ ] Rear barrel jack flange sealed with RTV around inside perimeter (if adapter option fitted)
- [ ] Enclosure lid seated flush; all screws tight
- [ ] Enclosure lid gasket intact and not pinched

After completing all items above, the assembly may be considered splash-resistant (equivalent to IP54 or better depending on seal quality). IP65 re-certification would require a pressure test — not practical for field-built prototypes.
