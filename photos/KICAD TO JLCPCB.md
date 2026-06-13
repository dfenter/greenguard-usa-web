# KiCad → JLCPCB Workflow

## GreenGuard CO2 Trap Timer — PCB Fabrication Instructions

### For execution by Claude Code

-----

## Prerequisites

```bash
# Verify KiCad 8 is installed
kicad --version

# Install KiCad CLI if not present (Ubuntu/Debian)
sudo apt-get install kicad

# macOS via Homebrew
brew install --cask kicad

# Confirm project files exist
ls -la co2_timer.kicad_pcb
ls -la co2_timer.kicad_sch
ls -la JLCPCB_BOM.csv
```

-----

## Step 1 — Validate PCB File

```bash
# Create working directory
mkdir -p co2_timer_project/gerbers

# Copy project files into working directory
cp co2_timer.kicad_pcb co2_timer_project/
cp co2_timer.kicad_sch co2_timer_project/
cp JLCPCB_BOM.csv co2_timer_project/

cd co2_timer_project

# Run KiCad DRC via CLI
kicad-cli pcb drc \
  --output drc_report.txt \
  --exit-code-violations \
  co2_timer.kicad_pcb

# Check DRC output
cat drc_report.txt
# Must show 0 errors before proceeding
```

-----

## Step 2 — Export Gerber Files

```bash
# Export all Gerber layers required by JLCPCB
kicad-cli pcb export gerbers \
  --output gerbers/ \
  --layers F.Cu,B.Cu,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts \
  --no-protel-ext \
  --subtract-soldermask \
  co2_timer.kicad_pcb

# Verify all 7 Gerber files were created
ls -la gerbers/
# Expected files:
# co2_timer-F_Cu.gbr
# co2_timer-B_Cu.gbr
# co2_timer-F_SilkS.gbr
# co2_timer-B_SilkS.gbr
# co2_timer-F_Mask.gbr
# co2_timer-B_Mask.gbr
# co2_timer-Edge_Cuts.gbr
```

-----

## Step 3 — Export Drill Files

```bash
# Export Excellon drill files (required by JLCPCB)
kicad-cli pcb export drill \
  --output gerbers/ \
  --format excellon \
  --drill-origin absolute \
  --excellon-separate-th \
  co2_timer.kicad_pcb

# Verify drill files created
ls -la gerbers/*.drl
# Expected:
# co2_timer-PTH.drl   (plated through holes)
# co2_timer-NPTH.drl  (non-plated, mounting holes)
```

-----

## Step 4 — Export Component Placement File (CPL)

```bash
# Export pick-and-place / component placement file for JLCPCB SMT assembly
kicad-cli pcb export pos \
  --output gerbers/co2_timer-CPL.csv \
  --format csv \
  --units mm \
  --side front \
  co2_timer.kicad_pcb

# Verify CPL file
cat gerbers/co2_timer-CPL.csv
```

-----

## Step 5 — Reformat CPL for JLCPCB

```bash
# JLCPCB requires specific column headers in the CPL file
# Rename columns: Ref -> Designator, PosX -> Mid X, PosY -> Mid Y, Rot -> Rotation, Side -> Layer

python3 << 'PYEOF'
import csv
import sys

input_file = "gerbers/co2_timer-CPL.csv"
output_file = "gerbers/co2_timer-CPL-JLCPCB.csv"

with open(input_file, 'r') as fin, open(output_file, 'w', newline='') as fout:
    reader = csv.DictReader(fin)
    fieldnames = ['Designator', 'Mid X', 'Mid Y', 'Layer', 'Rotation']
    writer = csv.DictWriter(fout, fieldnames=fieldnames)
    writer.writeheader()
    for row in reader:
        writer.writerow({
            'Designator': row.get('Ref', row.get('Reference', '')),
            'Mid X': row.get('PosX', row.get('Pos X', '')),
            'Mid Y': row.get('PosY', row.get('Pos Y', '')),
            'Layer': row.get('Side', row.get('Layer', 'top')),
            'Rotation': row.get('Rot', row.get('Rotation', '0'))
        })

print(f"CPL reformatted → {output_file}")
PYEOF
```

-----

## Step 6 — Package for JLCPCB Upload

```bash
# Zip all Gerber + drill files for JLCPCB upload
cd gerbers
zip ../co2_timer_gerbers_JLCPCB.zip \
  co2_timer-F_Cu.gbr \
  co2_timer-B_Cu.gbr \
  co2_timer-F_SilkS.gbr \
  co2_timer-B_SilkS.gbr \
  co2_timer-F_Mask.gbr \
  co2_timer-B_Mask.gbr \
  co2_timer-Edge_Cuts.gbr \
  co2_timer-PTH.drl \
  co2_timer-NPTH.drl

cd ..

# Verify zip
ls -lh co2_timer_gerbers_JLCPCB.zip
echo "Gerber package ready for upload"

# List all files needed for JLCPCB order
echo ""
echo "=== FILES READY FOR JLCPCB ==="
echo "1. UPLOAD TO GERBER: co2_timer_gerbers_JLCPCB.zip"
echo "2. UPLOAD TO BOM:    JLCPCB_BOM.csv"
echo "3. UPLOAD TO CPL:    gerbers/co2_timer-CPL-JLCPCB.csv"
```

-----

## Step 7 — JLCPCB Order Settings

```
URL: https://jlcpcb.com/quote

PCB Settings:
  Base Material:        FR-4
  Layers:               2
  Dimensions:           60 x 40 mm
  PCB Qty:              10
  PCB Thickness:        1.6mm
  PCB Color:            Black
  Silkscreen:           White
  Surface Finish:       HASL (with lead) — cheapest
  Copper Weight:        1oz
  Via Covering:         Tented
  Board Outline:        Yes

SMT Assembly Settings:
  PCBA Qty:             10
  Assembly Side:        Top Side
  Tooling Holes:        Added by JLCPCB
  Confirm Parts:        Yes (review substitutions before confirming)

Upload Files:
  Gerber ZIP:           co2_timer_gerbers_JLCPCB.zip
  BOM:                  JLCPCB_BOM.csv
  CPL:                  co2_timer-CPL-JLCPCB.csv

Expected Cost:          $90–120 USD shipped
Lead Time:              7–12 business days to Austin TX
```

-----

## Step 8 — Post-Order Checklist

```
□ JLCPCB order confirmation email received
□ Parts sourcing confirmed (check for any OOS components)
□ Order solenoid valves (U.S. Solid 1/4" NPT NC 12V Viton) x10 — Amazon
□ Order Zulkit IP65 enclosures 100x68x50mm x10 — Amazon
□ Order 1/4" NPT to 6mm barb fittings x20 (2 per unit) — Amazon
□ Order PG7 cable glands x20 (2 per unit) — Amazon
□ Order 9V battery snaps x10 — Amazon
□ Order CR2032 batteries x10 — Local
□ Order M3 brass standoffs 10mm x40 (4 per unit) — Amazon
□ Prepare ICSP programmer (USBtinyISP or Arduino as ISP) to flash ATtiny85
□ Flash co2_timer.ino to ATtiny85 chips before board assembly
```

-----

## Notes for Claude Code

- KiCad CLI (`kicad-cli`) is available in KiCad 7.0+ — confirm version before running
- If DRC reports unrouted nets, the PCB traces need manual routing in KiCad GUI before export
- All LCSC part numbers in BOM are pre-verified — JLCPCB sources directly from LCSC
- ATtiny85 (U1) must be programmed BEFORE soldering to board — use ICSP header J3
- Through-hole components (U1, Q1, D1, D2, LEDs, SW1, C1, BT1, J1, J2, J3) are NOT assembled by JLCPCB SMT — hand solder after boards arrive