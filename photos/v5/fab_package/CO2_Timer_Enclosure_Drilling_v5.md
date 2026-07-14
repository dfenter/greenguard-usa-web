# CO2 Trap Timer v5 — Enclosure Drilling Guide

**GreenGuard USA | Timer-001 Rev 5.0 | Hammond 1554CGY | 2026-07-10**

All cutout coordinates in this document are re-derived from the routed v5 PCB (`co2_timer_v5.kicad_pcb`), not carried over from v3. The v3 guide had a display-window / DC-jack cutout overlap on the front face (window spanned X 13-51, jack hole spanned X 46-58). v5 layout below maintains a minimum 4 mm web between every pair of cutouts (worst case 5.0 mm).

---

## Enclosure

| Parameter | Value |
|---|---|
| Model | Hammond 1554CGY |
| External dimensions | 120 x 65 x 40 mm (L x W x H) |
| Wall thickness | approx. 2.5 mm |
| Material | ABS, no IP rating |
| Lid | Snap-fit, long top face (120 x 65 mm) |
| Color | Clear gray (CGY) |

---

## PCB Fit and Mounting Position

| Parameter | Value |
|---|---|
| PCB size | 70 x 50 mm |
| Mounting | **Forward-mounted:** PCB front edge (x = 0, the J5/SW1/SW2/J4 edge) approx. 1 mm behind the front interior wall |
| Rear clearance | approx. 41 mm (tubing + solenoid wiring slack) |
| Side clearance | approx. 5 mm each side (board centered across the 65 mm width) |
| Standoffs | 4x M3 x 10 mm brass, at PCB corner holes (3 mm inset from each corner) |

> **Change from v3:** the v3 guide showed the PCB centered along the 120 mm axis (21 mm clearance each end) while also requiring the J5 barrel jack to protrude through the front panel — impossible. In v5 the PCB is mounted forward so the PJ-002A barrel reaches the front-face hole. Position the standoffs accordingly (see Standoff Positions).

### Board-to-face coordinate mapping (for reference)

Front face X (from top-left, viewed from outside) = 7.5 + (50 − board Y). Actual v5 board coordinates used:

| Ref | Board (x, y) mm | Face position |
|---|---|---|
| J5 barrel jack | (6.5, 10) | Front face X = 47.5 |
| SW1 (UP) | (5.5, 42) | Front face X = 15.5 |
| SW2 (SET) | (5.5, 23.5) | Front face X = 34.0 |
| J4 display header | (3.5, 28) | Front face X = 29.5 (display module is cabled; window need not be centered on J4) |
| J1 (BAT1) | (14, 3) | **Internal** — wired to BAT1 clip in base tray (no panel cutout) |
| J6 (BAT2) | (54, 3) | **Internal** — wired to BAT2 clip in base tray (no panel cutout) |
| J2 (solenoid) | (38, 47) | **Internal** — wired to the bistable valve in base tray (no panel cutout) |

---

## Front End Face — 65 mm W x 40 mm H

Display window, both buttons, and DC jack are on this face (shorter end, user-facing).

```
        65mm
+-----------------------------------+
|                                   |  40mm
|  +----------------+               |
|  | TM1637 DISPLAY |       (o)     |  <- J5 DC jack, 12mm dia @ (47.5, 20)
|  +----------------+               |     window 32x14 @ X 4-36, Y 8-22
|       o          o                |  <- SW1 UP (15.5,30)  SW2 SET (34,30)
+-----------------------------------+
```

| Hole / Cutout | Position (X, Y from top-left) | Size | Purpose |
|---|---|---|---|
| Display window | top-left corner (4, 8) | 32 x 14 mm rectangular | TM1637 4-digit module (0.36 in digit area is 30 x 14 mm) |
| SW1 (UP) | center (15.5, 30) | 6 mm dia | UP button access |
| SW2 (SET) | center (34.0, 30) | 6 mm dia | SET button access |
| J5 DC jack | center (47.5, 20) | 12 mm dia | 5.5/2.1 mm barrel jack — fit rubber dust cap after installation |

### Cutout web verification (minimum 4 mm required)

| Pair | Web |
|---|---|
| Display window <-> J5 jack hole | 5.5 mm |
| Display window <-> SW1 | 5.0 mm |
| Display window <-> SW2 | 5.0 mm |
| SW2 <-> J5 jack hole | 7.8 mm |
| SW1 <-> SW2 | 12.5 mm |
| J5 jack hole <-> right face edge | 11.5 mm |

**Drilling template:** Use `front_drill_template_v5.svg` (in this package). Print at **100% scale** — do not fit-to-page. Verify the 65 x 40 mm outer rectangle and the 50 mm verification bar measure exactly before drilling. A misaligned display window, button hole, or barrel jack hole cannot be corrected without replacing the enclosure end cap.

**Power port cap:** Install a silicone/rubber protective dust cap (5.5 mm barrel, push-fit or tab-pull style) over J5 after PCB installation.

---

## Left Side Face — 120 mm W x 40 mm H

**No external cutouts.** Both 9 V batteries are enclosed inside the base tray (see Internal Component Layout). J1 (BAT1) and J6 (BAT2) are wired internally to base-tray battery clips — there is no wire penetration of this wall. The left face is a plain, sealed surface.

> **Change from the interim v5 draft:** an earlier drilling draft cut J1/J6 wire slots in this wall for *external* battery packs. That is superseded — the two 9 V cells now sit inside the enclosure. Do not cut this face.

---

## Right Side Face — 120 mm W x 40 mm H

**No external cutouts.** The bistable solenoid valve is enclosed inside the base tray (see Internal Component Layout). J2 (SOL+/SOL-) is wired internally to the valve coil — there is no wire penetration of this wall. The right face is a plain, sealed surface.

> **Change from the interim v5 draft:** an earlier drilling draft cut a J2 wire slot in this wall for an *external* solenoid. That is superseded — the valve is now internal, driven directly by the on-board DRV8871. Do not cut this face.

---

## Rear End Face — 65 mm W x 40 mm H

CO2 tubing entry and exit for the solenoid valve. Panel-mount barb fittings for 6 mm OD / 4 mm ID tubing (M10 body, 10 mm panel hole).

| Hole | Position (X, Y from top-left) | Size | Purpose |
|---|---|---|---|
| CO2 IN | center (16, 20) | 10 mm dia | Panel-mount barb fitting, solenoid inlet |
| CO2 OUT | center (49, 20) | 10 mm dia | Panel-mount barb fitting, solenoid outlet |

Web between barb holes: 23 mm.

**Barb fitting spec:** M10 x 1 panel-mount straight barb, 4 mm ID shank (6 mm OD / 4 mm ID tubing). Tighten locknut to ABS panel — do not overtighten.

**Tubing retention:** Secure tubing on each barb with a worm-gear hose clamp sized for 6 mm OD tubing. CO2 pressure will push tubing off an unclamped barb.

---

## Lid (Top Face) — 120 mm x 65 mm

No cutouts required. The lid is the **service access panel** — lift it to replace the two 9 V cells. Silkscreen/label branding only.

---

## Internal Component Layout

Everything active is enclosed. Only the CO₂ tubing (rear wall) and the front controls break the shell. The four penetrations total: display window + 2 buttons + DC jack (front end face) and 2 CO₂ barbs (rear end face).

**Interior envelope (approx.):** 115 x 60 x 35 mm usable (120 x 65 x 40 mm shell, ~2.5 mm walls).

| Component | Size (approx.) | Location in base tray | Notes |
|---|---|---|---|
| Controller PCB | 70 x 50 mm | Forward, front edge ~1 mm behind front wall, on 4x M3 x 10 mm standoffs | Barrel jack + buttons + display header reach the front end face |
| BAT1 (9 V) | 48.5 x 26.5 x 17.5 mm | Rear-left floor, in a battery clip/holder | Wired to J1; low-profile SMD area of the PCB may overhang it |
| BAT2 (9 V) | 48.5 x 26.5 x 17.5 mm | Rear-left floor, stacked beside/behind BAT1, in a clip | Wired to J6 |
| Bistable valve | ~22 dia x 45 mm (compact latching) | Rear-right floor, on a bracket or foam-tape pad | Wired to J2; inlet/outlet tubing to the two rear barbs |
| CO₂ tubing (2x) | 6 mm OD / 4 mm ID | Short internal runs, barb → valve | Silicone or PU; secure with small zip ties |

**Fit / packaging notes (40 mm height is the binding dimension):**
- Mount the PCB on **10 mm standoffs** with the 9 V cells tucked under the board's low-profile center (SMD side, ~2 mm tall parts) — keep the tall THT parts (screw terminals ~15 mm, C1 D10 can, SC1 D14 can, barrel jack) clear of the battery footprints.
- The two 9 V cells + valve share the base-tray floor; they are laid flat (17.5 mm) so the lid still seats. Do not stand a 9 V on end (48.5 mm > 40 mm shell height).
- Use a **compact bistable/latching valve** (e.g. a 6 mm push-in or 1/8 in latching solenoid, ~22 mm body). A full 1/4 in NPT industrial valve will NOT fit — confirm the chosen valve body against the 35 mm interior height before ordering.
- **First-article check:** dry-fit PCB + both cells + valve + tubing in one bare 1554CGY before committing to the production enclosure. This is the one open mechanical risk.

### Solenoid Valve Specification (CO₂ compatibility)

CO₂ itself is dry, inert, and non-corrosive at this service, so gas compatibility is easy — but the valve MUST be selected against the criteria below. Two of them (direct-acting and gas-rated) matter more than the CO₂ compatibility itself, because the trap runs at very low pressure.

| Requirement | Value | Why |
|---|---|---|
| Actuation | **Direct-acting** (NOT pilot / diaphragm operated) | Regulator output is only ~1–2 psi (~1 lb CO₂/day). Pilot/diaphragm valves need a minimum differential (often ≥5 psi) to seat and open — they leak or stall at our pressure. Direct-acting valves work from 0 psi. |
| Latching | **Bistable / latching** (2-position magnetic latch) | Holds open/closed with ZERO holding current. The DRV8871 gives a 50 ms directed pulse each way; a non-latching valve would drain both 9 V cells in hours. |
| Media rating | **Air / inert gas** (not water/irrigation only) | Cheap "latching solenoid valves" are irrigation valves — water-rated diaphragm types that fail on low-pressure gas. |
| Function | 2-way, **normally-closed** preferred | Fail-safe: de-energized state stops CO₂. The one-shot force-close pulse drives it closed on power loss. |
| Seals | **FKM (Viton)** or EPDM (NBR acceptable) | All fully compatible with dry CO₂ at ≤2 psi. (Elastomer swell / explosive decompression only matters with high-pressure or supercritical CO₂ — not applicable here.) |
| Body | Brass or engineered plastic (PPS / POM / PPA) | All CO₂-compatible. |
| Pressure range | 0 to ≥5 psi (0–0.35 bar) working; ≤2 psi typical | Must seal at ~0 psi. |
| Ports | 6 mm push-in or 1/8 in, matched to the internal tubing (6 mm OD / 4 mm ID) | — |
| Coil | 9–12 V pulse, R_coil 30–60 Ω, ~150–300 mA peak | Matches DRV8871 drive + F1/ILIM (see TEST_PROCEDURE §6). |
| Body size | ≤ ~22 mm across, fits the 35 mm interior height | See fit notes above. A 1/4 in NPT industrial valve will NOT fit. |

**Representative parts (verify current availability + exact body size before order):** Sirai/Parker latching series, Takasago CTV/TC latching, The Lee Company IEP latching, or an equivalent compact **2-way direct-acting bistable latching solenoid valve, FKM seals, air/gas rated**. Confirm the datasheet states *direct-acting*, *latching*, and *gas/air* — reject any valve whose datasheet only lists water or a minimum operating pressure > 0.

> **Do not substitute a generic 12 V "latching solenoid valve"** without checking these three lines. Most low-cost latching valves are water/irrigation diaphragm valves and will not seal on 1–2 psi CO₂.

```
        REAR END (CO2 barbs)
  +----------------------------------+
  | [BAT1 9V ]        [ VALVE ]      |
  | [BAT2 9V ]        (to barbs)     |   base tray, top-down
  |   +--------------------------+   |
  |   |   CONTROLLER PCB 70x50   |   |   PCB forward-mounted
  |   |  disp  btns   jack -->   |   |
  +---+--------------------------+---+
        FRONT END (display/buttons/jack)
```

---

## Standoff Positions

PCB mounting holes (origin = board front-left corner, from the v5 KiCad layout):

| Standoff | PCB X | PCB Y |
|---|---|---|
| Front-left | 3 mm | 3 mm |
| Front-right | 3 mm | 47 mm |
| Rear-left | 67 mm | 3 mm |
| Rear-right | 67 mm | 47 mm |

**Hole pitch: 64 mm (along enclosure length) x 44 mm (across width).** Exact dimensions from the KiCad PCB.

**Recommended method:** Use the bare PCB as a drilling template. Butt the PCB front edge against the front interior wall (jack barrel entering the 12 mm hole), center it across the width, tape it down, and mark the four mounting holes with a center punch. Drill 2.5 mm pilot holes, deburr, and install M3 x 10 mm brass standoffs.

---

## Assembly Sequence

1. Drill / cut all holes before PCB installation (front face first, using the SVG template).
2. Test-fit the PCB on bare standoffs; confirm the J5 barrel seats in the front hole and both button stems align with their holes.
3. Install panel-mount barb fittings in the rear face holes.
4. Install M3 x 10 mm standoffs; mount PCB and secure with M3 screws.
5. Mount the bistable valve on its bracket/pad in the rear-right floor; connect its two wires to J2 (SOL+ / SOL- per silkscreen). Cut and fit the internal CO₂ tubing: rear barb (IN) → valve inlet, valve outlet → rear barb (OUT); secure each tube with a small zip tie.
6. Fit both 9 V battery clips/holders in the rear-left floor; connect BAT1 → J1 and BAT2 → J6 (+ / - per silkscreen). Insert both 9 V cells.
7. Connect the TM1637 display module cable to J4 and mount the module behind the display window.
8. Fit the lid (all components internal) and secure the 4 corner screws.
