// ============================================================
// GreenGuard CO2 Trap Timer — Rev 5.0 pin map
// AUTHORITATIVE SOURCE: /photos/v5/NETLIST.md Section 2.
// ATtiny84A-SSU (SOIC-14). Direct register I/O everywhere;
// Arduino pin numbers are NOT used in this firmware.
//
//  Phys | Port | Net           | Function
//  -----+------+---------------+------------------------------------
//   1   | VCC  | +3V3          |
//   2   | PB0  | DRV_IN1       | DRV8871 IN1 = valve OPEN pulse
//   3   | PB1  | DRV_IN2_MCU   | DRV8871 IN2 = valve CLOSE pulse
//         (via R16 1K into the D6/one-shot diode-OR node)
//   4   | PB3  | /RESET        | ISP only (R1 10K pull-up)
//   5   | PB2  | /ALERT        | INT0: DS3231M /INT (open-drain)
//         shared with TPS3839 supervisor via D3 (BAT54)
//   6   | PA7  | TM_DIO        | TM1637 data   (dedicated, NOT I2C)
//   7   | PA6  | SDA           | USI I2C SDA   (= ISP MOSI, J3.4)
//   8   | PA5  | MISO          | spare — ISP MISO / TP1 only
//   9   | PA4  | SCL           | USI I2C SCL   (= ISP SCK,  J3.3)
//  10   | PA3  | TM_CLK        | TM1637 clock  (dedicated, NOT I2C)
//  11   | PA2  | BTN_SET       | SET button, active-low (PCINT2)
//  12   | PA1  | BTN_UP        | UP button,  active-low (PCINT1)
//  13   | PA0  | VM_SENSE      | ADC0: VM via 100K/33K divider
//  14   | GND  | GND           |
// ============================================================
#ifndef PINS_V5_H
#define PINS_V5_H

#include <avr/io.h>

// ── PORTB ────────────────────────────────────────────────────
#define BIT_DRV_IN1   PB0   // valve OPEN  (idle LOW; R14 100K pull-down)
#define BIT_DRV_IN2   PB1   // valve CLOSE (idle LOW; R15 100K pull-down at OR node)
#define BIT_ALERT     PB2   // /ALERT, active low, external R4 10K pull-up

// ── PORTA ────────────────────────────────────────────────────
#define BIT_VM_SENSE  PA0   // ADC0
#define BIT_BTN_UP    PA1   // active low, external R11 10K pull-up
#define BIT_BTN_SET   PA2   // active low, external R12 10K pull-up
#define BIT_TM_CLK    PA3   // TM1637 CLK (open-drain emulation)
#define BIT_SCL       PA4   // USI USCK/SCL
#define BIT_MISO      PA5   // spare
#define BIT_SDA       PA6   // USI DI/SDA
#define BIT_TM_DIO    PA7   // TM1637 DIO (open-drain emulation)

#define ADC_MUX_VM    0x00  // ADMUX MUX[5:0]=000000 → ADC0/PA0, VCC reference

// ── Battery-sense scaling ────────────────────────────────────
// Divider R7=100K / R8=33K → ratio 33/133 = 0.24812.
// ADC LSB at pin = 3300 mV / 1023 = 3.2258 mV → at VM = 13.0 mV/LSB.
#define VM_MV_PER_LSB 13U

#endif // PINS_V5_H
