#!/bin/bash
# GreenGuard CO2 Trap Timer v2 — ATtiny85 Flash Script
# Programmer: USBasp (preferred) or Adafruit USBtinyISP
# Connect programmer to J3 (2x3 ICSP header) on assembled PCB,
# or use ZIF socket for bare chip programming.
#
# Requirements:
#   avrdude — brew install avrdude  (macOS)
#              sudo apt install avrdude  (Linux)
#
# Run once per blank chip, then once per firmware flash:
#   chmod +x flash.sh && ./flash.sh

set -e

DEVICE="t85"
PROGRAMMER="usbasp"
INO="co2_timer_v2.ino"
HEX="co2_timer_v2.hex"

echo "=== GreenGuard CO2 Timer v2 — ATtiny85 Flash ==="

# Check for avrdude
if ! command -v avrdude &>/dev/null; then
  echo "ERROR: avrdude not found. Install with: brew install avrdude"
  exit 1
fi

# Check for HEX or prompt to compile
if [ ! -f "$HEX" ]; then
  echo ""
  echo "No pre-compiled HEX found. Compile the firmware first:"
  echo "  1. Open co2_timer_v2.ino in Arduino IDE"
  echo "  2. Install ATtinyCore: Board Manager URL http://drazzy.com/package_drazzy.com_index.json"
  echo "  3. Board: ATtiny85 | Clock: 8 MHz (internal) | Programmer: USBasp"
  echo "  4. Sketch → Export Compiled Binary"
  echo "  5. Rename the output .hex to co2_timer_v2.hex and copy here"
  echo ""
  echo "Or export HEX via arduino-cli:"
  echo "  arduino-cli compile --fqbn attiny:avr:ATtinyX5:cpu=attiny85,clock=internal8 co2_timer_v2.ino"
  exit 1
fi

# Step 1: Set fuses — 8 MHz internal oscillator (run once per blank chip)
echo ""
echo "Step 1: Setting fuses (8 MHz internal oscillator)..."
echo "  lfuse=0xE2  hfuse=0xDF  efuse=0xFF"
avrdude -c $PROGRAMMER -p $DEVICE \
  -U lfuse:w:0xE2:m \
  -U hfuse:w:0xDF:m \
  -U efuse:w:0xFF:m

# Step 2: Flash firmware
echo ""
echo "Step 2: Flashing $HEX..."
avrdude -c $PROGRAMMER -p $DEVICE -U flash:w:$HEX:i

echo ""
echo "Done. Insert programmed ATtiny85 into the DIP-8 socket (U1_SOCKET) on the PCB."
echo "Do not solder U1 directly — the socket allows field firmware updates."
