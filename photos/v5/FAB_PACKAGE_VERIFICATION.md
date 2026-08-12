# FAB Package Verification Report

> **SUPERSEDED:** The verification dated 2026-07-12 below is retained as an
> audit record only. It does not describe the 2026-08-11 v5.1 as-built design
> and must not be used for ordering or bench acceptance.

## Current source status — 2026-08-11 rev 5.1

- NETLIST truth is the 2026-08-11 revision: DRC 0/0 and pad oracle 172/172.
- The current electronics use TPS3700 VM supervision, dual
  SN74LVC1G3157 takeover muxes, and C1+C19 at 1000 uF each.
- The current firmware reference image is ~6.2 KB; use the SHA-256 recorded in
  `firmware/README.md` §3 and `SHA256SUMS`. Fuses remain `0xE2/0xC5/0xFF` and
  the ISP flow is unchanged.
- The owned source documents and mirrored package documents are synchronized in
  this pass. The regenerated board, firmware image, SHA256SUMS, and ZIP remain
  orchestrator outputs and must be refreshed together before shipment.
- The first-article plan is five Bittele builds/tests shipped to GreenGuard,
  followed by our T0-T8 real-valve bench and enclosure dry-fit. The remaining
  95 units are held for written approval.

The superseded report is preserved below without deletion.

---

## Superseded historical record — 2026-07-12

**Date:** July 12, 2026  
**Package:** `GreenGuard_CO2_Timer_v5_FabPackage.zip`  
**Status:** ✓ VERIFIED COMPLETE

---

## Package Integrity

**Archive Size:** 699 KB (26 files)  
**Extraction:** ✓ All files present and readable

---

## Contents Checklist

### Gerber Files (Protel Extended, KiCad Export)
- ✓ `co2_timer_v5-F_Cu.gtl` — front copper layer
- ✓ `co2_timer_v5-B_Cu.gbl` — back copper layer
- ✓ `co2_timer_v5-F_Mask.gts` — front solder mask
- ✓ `co2_timer_v5-B_Mask.gbs` — back solder mask
- ✓ `co2_timer_v5-F_Silkscreen.gto` — front silkscreen (component reference)
- ✓ `co2_timer_v5-B_Silkscreen.gbo` — back silkscreen
- ✓ `co2_timer_v5-F_Paste.gtp` — front stencil (solder paste for SMT)
- ✓ `co2_timer_v5-Edge_Cuts.gm1` — board outline
- ✓ `co2_timer_v5-job.gbrjob` — job configuration (metadata)

### Drill Files (Excellon Format)
- ✓ `co2_timer_v5-PTH.drl` — plated through-hole (vias, header pins, test points)
- ✓ `co2_timer_v5-NPTH.drl` — non-plated through-hole (mounting holes)

### Assembly & Documentation
- ✓ `co2_timer_v5_BOM.csv` — bill of materials (component list with part numbers)
- ✓ `co2_timer_v5_CPL_SMT.csv` — JLCPCB component placement (SMT parts only, through-hole excluded)
- ✓ `assembly_top.pdf` — top-layer reference diagram (part positions)
- ✓ `assembly_bottom.pdf` — bottom-layer reference diagram
- ✓ `co2_timer_v5_schematic.pdf` — schematic PDF (full electrical reference)

### Fabrication Documentation
- ✓ `FABRICATION_SPEC.md` — PCB spec (material, layer count, finish, constraints)
- ✓ `TEST_PROCEDURE.md` — bench validation procedure (8-step workflow)
- ✓ `CO2_Timer_Enclosure_Drilling_v5.md` — mechanical fit and enclosure drilling
- ✓ `front_drill_template_v5.svg` — 1:1 front panel drill guide (printable)
- ✓ `README.md` — package overview and assembly notes

### Firmware
- ✓ `firmware/co2_timer_v5.ino` — main firmware (925 lines)
- ✓ `firmware/pins_v5.h` — pin map header
- ✓ `firmware/README.md` — compile instructions, fuse settings, ISP procedure

---

## Quality Checks

### Gerber Export
- **Format:** Protel extended (.gtl/.gbl/.gts/.gbs/.gto/.gbo/.gtp/.gm1)
- **Units:** Inches (0.001" precision)
- **Layers:** 2-layer board (front + back copper)
- **Board Size:** 70 × 50 mm
- **Expected Thickness:** 1.6 mm (standard)

### Drill Files
- **Format:** Excellon (ASCII format, compatible with all fab houses)
- **Coordinate System:** 2.3 (X.X format, inches)
- **PTH File:** Contains vias, header pins (J1, J2, J3, J4, J5, J6)
- **NPTH File:** Mounting holes for Hammond 1554CGY enclosure

### BOM Accuracy
- **Components:** 42 line items (resistors, capacitors, ICs, connectors, diodes)
- **Coverage:** All SMT + through-hole components listed
- **Part Numbers:** JLCPCB part numbers provided where available
- **Cost:** Total ~$9.50–11.50/unit at 500-unit volume

### JLCPCB CPL (Component Placement List)
- **Format:** CSV (Ref, Val, Package, PosX, PosY, Rot, Layer)
- **Coverage:** SMT parts only (C1–C11, R1–R20, U1–U6, D1–D5, F1, Q1)
- **Through-Hole Excluded:** J1–J6, SW1, SW2, TM1637 module (hand-assembly)
- **Rotation Units:** Degrees (0/90/180/270)
- **Verification:** Matches assembly PDFs + layout visual spot-check

### Schematic PDF
- **Size:** 174 KB (full-page A3 or tiled)
- **Readability:** Text clear, reference designators visible
- **Electrical Correctness:** Matches NETLIST.md (authoritative source)
- **Symbol Library:** Custom symbols (co2v5.kicad_sym) embedded

### Documentation
- **FABRICATION_SPEC.md:** Specifies PCB finish (HASL or ENIG), material (FR-4), copper weight, trace width
- **TEST_PROCEDURE.md:** 8-step bench validation protocol (power-up, RTC, one-shot, 470µF sag, solenoid current, fuse check, supercap fit, schedule)
- **Enclosure Drilling:** Specifies hole positions for front panel (display, buttons, DC jack), rear panel (CO2 barbs), side mounting
- **Front Drill Template:** Scalable SVG (1:1 at 100% zoom) for printing and manual drilling

---

## Fab House Readiness (JLCPCB Format)

✓ **Ready for upload to JLCPCB or equivalent.**

**Recommended Upload Steps:**
1. Unzip package
2. Upload gerber/ folder as "Gerber File"
3. JLCPCB will auto-detect board dimensions (70×50 mm, 2-layer)
4. Review preview:
   - Board outline correct
   - Copper patterns match expected layout
   - No short/open warnings
5. Order boards only (do NOT request assembly for this order — hand-solder later)
6. At fabrication step, optionally upload `co2_timer_v5_CPL_SMT.csv` if using JLCPCB assembly service (SMT parts only)

**Expected Delivery:** 5–7 business days

---

## Missing/Optional Items

### NOT Included (Source in Separate Step)
- Compiled firmware hex file (`.hex` for ISP programming)
  - **Status:** Firmware source present; compile on Linux via avr-gcc or request pre-compilation from JLCPCB
- 3D enclosure model (STEP or STL)
  - **Status:** Not shipped in fab package (source available in Trap Design/greenguard_co2_timer_v5.scad)
- Production test fixtures or jigs
  - **Status:** Not applicable for first-article; bench test via TEST_PROCEDURE.md sufficient

### Optional (Not Included but Helpful)
- ODB++ archive (open-source design exchange format)
  - **Status:** Can be regenerated from KiCad if needed for 2nd sourcing
- IPC-2581 format (CAM data standard)
  - **Status:** Not commonly used by hobby/startup fabs; gerber + CSV sufficient

---

## Cross-Validation vs. Source Files

| File | Source (photos/v5/) | Package | Status |
|------|------------------|---------|--------|
| `co2_timer_v5.kicad_pcb` | 285 KB (Jul 10) | gerbers/ derived | ✓ Match |
| `co2_timer_v5.kicad_sch` | 168 KB (Jul 9) | schematic.pdf | ✓ Match |
| `NETLIST.md` | 20 KB (Jul 9) | Referenced in README | ✓ Authoritative |
| `co2_timer_v5_BOM.csv` | 12 KB (Jul 10) | Included | ✓ Current |
| Firmware | .ino + .h | Included in firmware/ | ✓ Current |
| Fuses | firmware/README.md | Included in firmware/README | ✓ Match |

---

## Known Limitations

1. **Through-Hole Manual Assembly Required**
   - J1, J2, J3, J4, J5, J6 (connectors, headers)
   - SW1, SW2 (tactile buttons)
   - TM1637 display module (4-pin, soldered with angled leads for display window fit)
   - **Time Estimate:** 30–45 minutes per board (if experienced with SMT rework)

2. **No Firmware Hex Included**
   - Linux avr-gcc compilation needed (or JLCPCB pre-program option at extra cost)
   - ISP header J3 required (3.3V pogo adapter recommended to avoid mechanical stress on SMT pads)

3. **Supercap Not Pre-Fitted**
   - C3 (1F supercap on VBAT) must be soldered by hand or selected for assembly
   - Verify lead routing does not interfere with battery stack or valve connector

4. **Display Module Footprint (J4)**
   - TM1637 module is common (~$2 aliexpress) but has variable pin header clearance
   - Test fit before final assembly (40 mm shell is tight)

---

## Size & Fit Summary

| Dimension | Specification | Status |
|-----------|----------------|--------|
| PCB Footprint | 70 × 50 mm | ✓ Fits Hammond 1554CGY |
| PCB Height | 1.6 mm (standard 2-layer) | ✓ Expected |
| Standoff Height | 10 mm (nylon M3) | ✓ Specified in enclosure doc |
| Shell Height | 40 mm interior | ⚠ Tight (critical measurement in first-article) |
| Valve Length | ~22 mm (rear corner) | ⚠ Verify fit before production |
| Battery Stack | 2× 9V flat + space for contacts | ⚠ Verify clearance in first-article |

**Action:** First-article bench test (Phase 4 in FIRST_ARTICLE_CHECKLIST.md) includes dry-fit mechanical validation.

---

## Submission Readiness

**For JLCPCB/PCBWay/Oshpark:**
- ✓ Gerber files complete
- ✓ Drill files (PTH + NPTH)
- ✓ BOM in CSV format
- ✓ CPL file for assembly quote (optional)
- ✓ Board size < 100×100 mm (economy tier eligible)

**Estimated Fab Cost:**
- 10 boards, 70×50 mm, 2-layer, HASL: **~$15–25 total** (~$1.50–2.50/board)
- 100 boards: **~$50–80** (~$0.50–0.80/board)
- 500 boards: **~$200–300** (~$0.40–0.60/board)
- (Component cost $9.50–11.50/u separate)

**Total Estimated Cost per Unit:**
- 10-board pilot: **~$11–14/unit** (high overhead)
- 100-unit run: **~$10–12/unit**
- 500-unit production: **~$10–11.50/unit** (target)

---

## Sign-Off

**Package Verification:** ✓ All 26 files present, formats correct, content verified  
**Fab House Ready:** ✓ Can be submitted to JLCPCB immediately  
**Firmware Compilation:** ⏳ Pending (avr-gcc or JLCPCB pre-program)  
**First-Article:** ✓ Checklist prepared, bench validation documented  

**Status: MANUFACTURING-READY**

Next action: [See FIRST_ARTICLE_CHECKLIST.md Phase 1 & 2]
