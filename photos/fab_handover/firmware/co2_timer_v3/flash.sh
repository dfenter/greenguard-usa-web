#!/bin/bash
# GreenGuard CO2 Trap Timer v3 — ATtiny84A flash script
# Requires: avrdude, USBasp programmer, 14-pin ZIF socket
#
# IMPORTANT: J3 on the PCB is wired to PB0/PB1/PB2, NOT the ATtiny84A's
# actual ISP pins (PA4/PA5/PA6). You MUST program chips in a ZIF socket
# BEFORE installing them on the board.
#
# ZIF socket wiring for ATtiny84A DIP-14:
#   USBasp MOSI  → ATtiny84A pin 7  (PA6)
#   USBasp MISO  → ATtiny84A pin 8  (PA5)
#   USBasp SCK   → ATtiny84A pin 9  (PA4)
#   USBasp RESET → ATtiny84A pin 4  (PB3)
#   USBasp VCC   → ATtiny84A pin 1  (VCC)
#   USBasp GND   → ATtiny84A pin 14 (GND)
#
# Usage:
#   ./flash.sh                   # flash latest build from Arduino IDE export
#   ./flash.sh path/to/file.hex  # flash a specific hex file

set -e

HEX="${1:-co2_timer_v3/co2_timer_v3.ino.hex}"

if [ ! -f "$HEX" ]; then
    echo "ERROR: hex file not found: $HEX"
    echo "Export from Arduino IDE: Sketch > Export Compiled Binary"
    exit 1
fi

# Fuse settings for ATtiny84A:
#   LFUSE 0xE2 — 8 MHz internal RC oscillator, no clock divide (CKDIV8 unprogrammed)
#   HFUSE 0xDD — SPI ISP enabled, RESET pin active, BOD at 2.7V
#   EFUSE 0xFF — self-programming disabled (default)
LFUSE=0xE2
HFUSE=0xDD
EFUSE=0xFF

echo "=== GreenGuard CO2 Timer v3 — ATtiny84A Flash ==="
echo "Hex:   $HEX"
echo "Fuses: LFUSE=$LFUSE  HFUSE=$HFUSE  EFUSE=$EFUSE"
echo ""

avrdude -c usbasp -p t84 \
    -U flash:w:"$HEX":i \
    -U lfuse:w:$LFUSE:m \
    -U hfuse:w:$HFUSE:m \
    -U efuse:w:$EFUSE:m

echo ""
echo "Done. Chip programmed and ready for installation."
