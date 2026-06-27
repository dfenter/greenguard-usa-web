#!/bin/bash
# GreenGuard CO2 Trap Timer v2 — ATtiny85 flash script
# Requires: avrdude, USBasp programmer
#
# IN-CIRCUIT PROGRAMMING: J3 on the v2 PCB is wired correctly to ATtiny85
# ISP pins (PB0=MOSI, PB1=MISO, PB2=SCK, PB5=RESET). Plug USBasp into J3
# with board powered from 9V battery, or power from USBasp VCC pin.
#
# J3 pinout (standard 2x3 ICSP):
#   Pin 1: MISO   Pin 2: VCC
#   Pin 3: SCK    Pin 4: MOSI
#   Pin 5: RESET  Pin 6: GND
#
# ZIF SOCKET ALTERNATIVE — ATtiny85 DIP-8:
#   USBasp MOSI  → ATtiny85 pin 5  (PB0)
#   USBasp MISO  → ATtiny85 pin 6  (PB1)
#   USBasp SCK   → ATtiny85 pin 7  (PB2)
#   USBasp RESET → ATtiny85 pin 1  (PB5/RESET)
#   USBasp VCC   → ATtiny85 pin 8  (VCC)
#   USBasp GND   → ATtiny85 pin 4  (GND)
#
# Usage:
#   ./flash.sh                   # flash latest build from Arduino IDE export
#   ./flash.sh path/to/file.hex  # flash a specific hex file

set -e

HEX="${1:-co2_timer_v2/co2_timer_v2.ino.hex}"

if [ ! -f "$HEX" ]; then
    echo "ERROR: hex file not found: $HEX"
    echo "Export from Arduino IDE: Sketch > Export Compiled Binary"
    exit 1
fi

# Fuse settings for ATtiny85:
#   LFUSE 0xE2 — 8 MHz internal RC oscillator, CKDIV8 unprogrammed (no /8 divide)
#   HFUSE 0xDD — SPI ISP enabled, RESET pin active, BOD at 2.7V
#   EFUSE 0xFF — self-programming disabled (default)
LFUSE=0xE2
HFUSE=0xDD
EFUSE=0xFF

echo "=== GreenGuard CO2 Timer v2 — ATtiny85 Flash ==="
echo "Hex:   $HEX"
echo "Fuses: LFUSE=$LFUSE  HFUSE=$HFUSE  EFUSE=$EFUSE"
echo ""

avrdude -c usbasp -p t85 \
    -U flash:w:"$HEX":i \
    -U lfuse:w:$LFUSE:m \
    -U hfuse:w:$HFUSE:m \
    -U efuse:w:$EFUSE:m

echo ""
echo "Done. Chip programmed and ready for installation."
