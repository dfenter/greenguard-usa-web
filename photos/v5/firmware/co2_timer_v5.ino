// ============================================================
// GreenGuard CO2 Trap Timer — Rev 5.0
// Schedule: ON 5:30 AM / OFF 11:30 PM (user-adjustable, EEPROM)
//
// Hardware (see /photos/v5/NETLIST.md — authoritative):
//   U1 ATtiny84A-SSU        MCU, 8 MHz internal RC, BOD 2.7 V
//   U2 DS3231M+TRL          RTC on USI I2C (PA4=SCL, PA6=SDA),
//                           /INT on PB2 (INT0, shared "/ALERT")
//   U4 DRV8871DDAR          H-bridge, bistable latching solenoid
//                           PB0=IN1(OPEN)  PB1=IN2(CLOSE)
//   U5 TPS3839G30           2.93 V supervisor -> /ALERT via D3
//   U6 SN74LVC1G123         HARDWARE close one-shot on brown-out
//                           (fires with the MCU dead — the MCU's
//                            brown-out handling here is advisory)
//   TM1637 module on J4     PA7=DIO, PA3=CLK (dedicated pins)
//   Buttons SW1(UP)=PA1, SW2(SET)=PA2, active low, RC debounced
//   VM battery sense: PA0/ADC0 via 100K/33K (13.0 mV/LSB)
//
// Fuses (see firmware/README.md): WDTON programmed (WDT always
// on, firmware sets 2 s), BOD 2.7 V, EESAVE programmed, 8 MHz
// internal RC. Compile with ATTinyCore: ATtiny84(a), 8 MHz int.
//
// Key firmware properties:
//  * WDT is ALWAYS ON (fuse). Prescaler is set to 2 s in .init3.
//    Deep sleep therefore lasts at most ~2 s before a watchdog
//    RESET — this is the designed duty cycle: boot is quiet and
//    idempotent (valve pulsed ONLY on state mismatch), so the
//    device "sleeps" as a chain of power-down + WDT-reset hops.
//    Buttons (PCINT) and /ALERT (INT0) wake it sooner.
//  * Commanded valve state persists in EEPROM with wear-leveling
//    (32-slot rotating journal → >3M state changes endurance).
//  * USI TWI master has bus timeouts, 9-clock bus recovery, and
//    3-attempt NACK retry; persistent failure sets g_rtcFault
//    and the schedule fails SAFE (valve closed).
//  * /ALERT is shared: DS3231M alarm vs supervisor brown-out is
//    disambiguated by reading the RTC status register (A1F/A2F).
//    No flag (or dead bus) while /ALERT is low = brown-out →
//    immediate CLOSE pulse. (U6 has already done it in hardware.)
//  * ADC monitors VM: below VM_CLOSE_MV the valve force-closes
//    and re-opening is locked out until VM > VM_REOPEN_MV.
//  * Display: full brightness on activity, dims after 10 s,
//    blanks after 30 s; any button wakes it.
//  * UX: hold SET 2 s → settings wizard (clock → ON time →
//    OFF time → DST). UP increments; holding UP fast-advances.
// ============================================================

#include <avr/io.h>
#include <avr/interrupt.h>
#include <avr/sleep.h>
#include <avr/wdt.h>
#include <avr/eeprom.h>
#include <util/delay.h>

#include "pins_v5.h"

// ── Tunables ─────────────────────────────────────────────────
#define SOL_PULSE_MS        50      // latching-valve strobe
#define RTC_ADDR            0x68

#define DISPLAY_DIM_MS      10000UL
#define DISPLAY_OFF_MS      30000UL
#define MENU_TIMEOUT_MS     30000UL
#define BATT_VIEW_MS        2000UL
#define ADC_PERIOD_MS       5000UL

#define BRIGHT_FULL         7       // TM1637 level 0..7
#define BRIGHT_DIM          1

#define VM_CLOSE_MV         7000U   // force close + lockout below this
#define VM_REOPEN_MV        8000U   // lockout clears above this (hysteresis)
#define VM_WARN_MV          7600U   // "Lo" nag on display below this

// Defaults (used when EEPROM settings are blank/corrupt)
#define DEF_ON_H    5
#define DEF_ON_M   30
#define DEF_OFF_H  23
#define DEF_OFF_M  30

// ── EEPROM map (EESAVE programmed → survives reflash) ────────
// 0x00..0x06  settings: magic, onH, onM, offH, offM, dst, xor-ck
// 0x10..0x4F  valve-state journal: 32 slots × [seq, 0x50|state]
#define EE_SET_BASE   ((uint8_t*)0x00)
#define EE_SET_MAGIC  0xA5
#define EE_VS_BASE    ((uint8_t*)0x10)
#define EE_VS_SLOTS   32
#define VS_VAL_TAG    0x50          // valid values: 0x50=closed, 0x51=open

// ── Reset-cause capture + WDT prescaler, before main() ───────
// WDTON is burned, so the WDT is running at the 16 ms default
// from the instant of reset. Set the 2 s prescaler as early as
// possible (.init3 runs before .data/.bss copy, hence .noinit).
uint8_t g_resetFlags __attribute__((section(".noinit")));

void early_wdt_init(void) __attribute__((naked, used, section(".init3")));
void early_wdt_init(void) {
    g_resetFlags = MCUSR;
    MCUSR = 0;                       // WDRF must be cleared before WDE can change
    wdt_reset();
    WDTCSR |= _BV(WDCE) | _BV(WDE);  // timed sequence
    WDTCSR  = _BV(WDE) | _BV(WDP2) | _BV(WDP1) | _BV(WDP0);   // 2.0 s
}

// ── Global state ─────────────────────────────────────────────
volatile uint8_t g_alertFlag = 0;    // set by INT0 ISR

static bool  g_valveOpen   = false;  // commanded state (mirrors EEPROM)
static bool  g_valveKnown  = false;  // false until journal read or first pulse
static bool  g_rtcFault    = false;  // sticky-ish: cleared by next good access
static bool  g_timeInvalid = false;  // DS3231M OSF was set → clock needs setting
static bool  g_vmLockout   = false;  // low-battery close latch (hysteresis)
static uint16_t g_vmMv     = 9999;   // last VM reading, mV

// Settings (RAM copy of EEPROM)
static uint8_t s_onH  = DEF_ON_H,  s_onM  = DEF_ON_M;
static uint8_t s_offH = DEF_OFF_H, s_offM = DEF_OFF_M;
static uint8_t s_dst  = 0;           // 0/1 — display & schedule offset, RTC keeps standard time

// Valve journal cursor
static uint8_t vs_slot = EE_VS_SLOTS - 1;   // next write → slot 0
static uint8_t vs_seq  = 0;

// Display bookkeeping
static bool     dispOn = false;
static uint8_t  dispLevel = BRIGHT_FULL;
static uint32_t lastActivity = 0;
static uint32_t battViewUntil = 0;

// ═════════════════════════════════════════════════════════════
// USI TWI master (AVR310 style) — PA4=SCL, PA6=SDA
// Two-wire mode: pin drives low when USIDR-MSB/PORT is 0,
// released (external 10K pull-up) when 1.
// ═════════════════════════════════════════════════════════════
#define TWI_TLOW_US   5
#define TWI_THIGH_US  4
#define USISR_CLR     (_BV(USISIF)|_BV(USIOIF)|_BV(USIPF)|_BV(USIDC))
#define USISR_8BIT    (USISR_CLR | 0x00)   // counter 0  → 16 edges
#define USISR_1BIT    (USISR_CLR | 0x0E)   // counter 14 →  2 edges

static void twi_init(void) {
    PORTA |= _BV(BIT_SDA) | _BV(BIT_SCL);   // released high
    DDRA  |= _BV(BIT_SDA) | _BV(BIT_SCL);   // outputs (wired-AND via USI)
    USIDR  = 0xFF;
    USICR  = _BV(USIWM1) | _BV(USICS1) | _BV(USICLK);  // two-wire, sw strobe
    USISR  = USISR_CLR;
}

static bool twi_scl_wait_high(void) {
    for (uint16_t i = 0; i < 1000; i++) {   // ~1 ms bound (RTC never stretches long)
        if (PINA & _BV(BIT_SCL)) return true;
        _delay_us(1);
    }
    return false;
}

// Clock out/in the USI counter; returns false on stuck-bus timeout.
static bool usi_xfer(uint8_t usisr, uint8_t *out) {
    USISR = usisr;
    do {
        _delay_us(TWI_TLOW_US);
        USICR = _BV(USIWM1)|_BV(USICS1)|_BV(USICLK)|_BV(USITC);   // SCL → high
        if (!twi_scl_wait_high()) return false;
        _delay_us(TWI_THIGH_US);
        USICR = _BV(USIWM1)|_BV(USICS1)|_BV(USICLK)|_BV(USITC);   // SCL → low
    } while (!(USISR & _BV(USIOIF)));
    _delay_us(TWI_TLOW_US);
    *out  = USIDR;
    USIDR = 0xFF;                    // release SDA
    DDRA |= _BV(BIT_SDA);            // SDA back to output (wired-AND)
    return true;
}

static bool twi_start(void) {
    PORTA |= _BV(BIT_SCL);           // release SCL
    if (!twi_scl_wait_high()) return false;
    _delay_us(TWI_THIGH_US);
    PORTA &= ~_BV(BIT_SDA);          // SDA low while SCL high = START
    _delay_us(TWI_THIGH_US);
    PORTA &= ~_BV(BIT_SCL);          // hold SCL low
    PORTA |=  _BV(BIT_SDA);          // release SDA
    if (!(USISR & _BV(USISIF))) return false;   // start not detected = bus error
    return true;
}

static void twi_stop(void) {
    PORTA &= ~_BV(BIT_SDA);          // SDA low
    PORTA |=  _BV(BIT_SCL);          // release SCL
    twi_scl_wait_high();
    _delay_us(TWI_THIGH_US);
    PORTA |=  _BV(BIT_SDA);          // SDA rises while SCL high = STOP
    _delay_us(TWI_TLOW_US);
}

// true = byte ACKed
static bool twi_write_byte(uint8_t b) {
    PORTA &= ~_BV(BIT_SCL);
    USIDR  = b;
    uint8_t tmp;
    if (!usi_xfer(USISR_8BIT, &tmp)) return false;
    DDRA &= ~_BV(BIT_SDA);           // SDA input for ACK bit
    if (!usi_xfer(USISR_1BIT, &tmp)) return false;
    return !(tmp & 0x01);            // 0 = ACK
}

static bool twi_read_byte(uint8_t *b, bool ack) {
    DDRA &= ~_BV(BIT_SDA);
    if (!usi_xfer(USISR_8BIT, b)) return false;
    USIDR = ack ? 0x00 : 0xFF;       // ACK (pull low) / NACK (release)
    uint8_t tmp;
    return usi_xfer(USISR_1BIT, &tmp);
}

// 9-clock bus recovery: releases a slave that is holding SDA low
// mid-byte, then issues a STOP and re-inits the USI.
static void twi_bus_recover(void) {
    USICR = 0;                                        // USI off, plain GPIO
    DDRA  &= ~_BV(BIT_SDA);                           // release SDA
    PORTA &= ~(_BV(BIT_SCL) | _BV(BIT_SDA));          // PORT low → DDR toggles drive
    for (uint8_t i = 0; i < 9; i++) {
        DDRA |=  _BV(BIT_SCL);  _delay_us(TWI_TLOW_US);   // SCL low
        DDRA &= ~_BV(BIT_SCL);  _delay_us(TWI_TLOW_US);   // SCL released
        if (PINA & _BV(BIT_SDA)) break;
    }
    // STOP: SDA low → release while SCL released
    DDRA |=  _BV(BIT_SDA);  _delay_us(TWI_TLOW_US);
    DDRA &= ~_BV(BIT_SDA);  _delay_us(TWI_TLOW_US);
    twi_init();
}

// ═════════════════════════════════════════════════════════════
// DS3231M — register access with retry + fault flag
// ═════════════════════════════════════════════════════════════
static uint8_t bcd2dec(uint8_t b) { return (uint8_t)((b >> 4) * 10 + (b & 0x0F)); }
static uint8_t dec2bcd(uint8_t d) { return (uint8_t)(((d / 10) << 4) | (d % 10)); }

static bool rtc_try_write(uint8_t reg, const uint8_t *d, uint8_t n) {
    if (!twi_start())                        goto fail;
    if (!twi_write_byte(RTC_ADDR << 1))      goto fail;
    if (!twi_write_byte(reg))                goto fail;
    for (uint8_t i = 0; i < n; i++)
        if (!twi_write_byte(d[i]))           goto fail;
    twi_stop();
    return true;
fail:
    twi_stop();
    return false;
}

static bool rtc_try_read(uint8_t reg, uint8_t *d, uint8_t n) {
    if (!twi_start())                          goto fail;
    if (!twi_write_byte(RTC_ADDR << 1))        goto fail;
    if (!twi_write_byte(reg))                  goto fail;
    if (!twi_start())                          goto fail;   // repeated start
    if (!twi_write_byte((RTC_ADDR << 1) | 1))  goto fail;
    for (uint8_t i = 0; i < n; i++)
        if (!twi_read_byte(&d[i], i < (uint8_t)(n - 1))) goto fail;
    twi_stop();
    return true;
fail:
    twi_stop();
    return false;
}

// NACK/timeout policy: retry 3× with bus recovery between attempts,
// then flag the fault. Any later success clears the flag.
static bool rtc_write(uint8_t reg, const uint8_t *d, uint8_t n) {
    for (uint8_t a = 0; a < 3; a++) {
        wdt_reset();
        if (rtc_try_write(reg, d, n)) { g_rtcFault = false; return true; }
        twi_bus_recover();
    }
    g_rtcFault = true;
    return false;
}

static bool rtc_read(uint8_t reg, uint8_t *d, uint8_t n) {
    for (uint8_t a = 0; a < 3; a++) {
        wdt_reset();
        if (rtc_try_read(reg, d, n)) { g_rtcFault = false; return true; }
        twi_bus_recover();
    }
    g_rtcFault = true;
    return false;
}

static bool rtc_write1(uint8_t reg, uint8_t v) { return rtc_write(reg, &v, 1); }

// Time in STANDARD time (as kept by the RTC)
static bool rtc_get_time_std(uint8_t *h, uint8_t *m) {
    uint8_t b[3];
    if (!rtc_read(0x00, b, 3)) return false;
    *m = bcd2dec(b[1]);
    *h = bcd2dec(b[2] & 0x3F);       // 24-h mode
    return true;
}

// Local (wall-clock) time = standard + DST
static bool rtc_get_time_local(uint8_t *h, uint8_t *m) {
    if (!rtc_get_time_std(h, m)) return false;
    *h = (uint8_t)((*h + s_dst) % 24);
    return true;
}

static bool rtc_set_time_local(uint8_t h, uint8_t m) {
    uint8_t sh = (uint8_t)((h + 24 - s_dst) % 24);   // store standard time
    uint8_t b[3] = { 0, dec2bcd(m), dec2bcd(sh) };   // sec=0, 24-h mode
    if (!rtc_write(0x00, b, 3)) return false;
    // Clear OSF: time is now trustworthy
    uint8_t st;
    if (rtc_read(0x0F, &st, 1)) rtc_write1(0x0F, st & 0x7F);
    g_timeInvalid = false;
    return true;
}

// Program both daily alarms (in standard time) + enable /INT.
// Alarm1 (has seconds) = ON edge; Alarm2 = OFF edge.
static bool rtc_program_alarms(void) {
    uint8_t onH  = (uint8_t)((s_onH  + 24 - s_dst) % 24);
    uint8_t offH = (uint8_t)((s_offH + 24 - s_dst) % 24);
    uint8_t a1[4] = { 0x00, dec2bcd(s_onM),  dec2bcd(onH),  0x80 };  // A1M4=1: daily
    uint8_t a2[3] = {       dec2bcd(s_offM), dec2bcd(offH), 0x80 };  // A2M4=1: daily
    bool ok = true;
    ok &= rtc_write(0x07, a1, 4);
    ok &= rtc_write(0x0B, a2, 3);
    ok &= rtc_write1(0x0E, 0x07);    // INTCN=1, A2IE=1, A1IE=1
    // Clear pending alarm flags, PRESERVE OSF (bit7)
    uint8_t st;
    if (rtc_read(0x0F, &st, 1)) ok &= rtc_write1(0x0F, st & 0x7C);
    else ok = false;
    return ok;
}

// ═════════════════════════════════════════════════════════════
// TM1637 display — PA7=DIO, PA3=CLK, dedicated pins.
// Open-drain emulation (PORT preset 0, DDR toggles). Assumes a
// TM1637 module with on-board pull-ups on J4 (standard modules).
// LSB-first protocol, start/stop framing as in v3.
// ═════════════════════════════════════════════════════════════
static inline void tmc_hi(void) { DDRA &= ~_BV(BIT_TM_CLK); }
static inline void tmc_lo(void) { DDRA |=  _BV(BIT_TM_CLK); }
static inline void tmd_hi(void) { DDRA &= ~_BV(BIT_TM_DIO); }
static inline void tmd_lo(void) { DDRA |=  _BV(BIT_TM_DIO); }
static inline void tm_dly(void) { _delay_us(5); }

static void tm_start(void) { tmd_hi(); tmc_hi(); tm_dly(); tmd_lo(); tm_dly(); tmc_lo(); tm_dly(); }
static void tm_stop(void)  { tmd_lo(); tm_dly(); tmc_hi(); tm_dly(); tmd_hi(); tm_dly(); }

static void tm_write(uint8_t b) {
    for (uint8_t i = 0; i < 8; i++) {
        tmc_lo(); tm_dly();
        if (b & 0x01) tmd_hi(); else tmd_lo();
        b >>= 1;
        tmc_hi(); tm_dly();
    }
    tmc_lo(); tm_dly();              // ACK clock (ignored)
    tmd_hi();
    tmc_hi(); tm_dly();
    tmc_lo(); tm_dly();
}

// 7-seg font
#define SEG_BLANK 0x00
#define SEG_DASH  0x40
#define SEG_b 0x7C
#define SEG_C 0x39
#define SEG_d 0x5E
#define SEG_E 0x79
#define SEG_F 0x71
#define SEG_L 0x38
#define SEG_n 0x54
#define SEG_o 0x5C
#define SEG_r 0x50
#define SEG_S 0x6D
#define SEG_t 0x78
static const uint8_t SEG_DIGIT[10] = {
    0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F
};

static void tm_frame(const uint8_t seg[4], bool on, uint8_t level) {
    tm_start(); tm_write(0x40); tm_stop();                 // auto-increment
    tm_start(); tm_write(0xC0);
    for (uint8_t i = 0; i < 4; i++) tm_write(seg[i]);
    tm_stop();
    tm_start(); tm_write(on ? (uint8_t)(0x88 | (level & 7)) : 0x80); tm_stop();
}

static void tm_blank(void) {
    const uint8_t z[4] = {0, 0, 0, 0};
    tm_frame(z, false, 0);
}

// digit-2 bit7 = colon on standard 4-digit clock modules
static void showHM(uint8_t h, uint8_t m, bool colon, uint8_t blinkMask) {
    uint8_t s[4] = {
        (uint8_t)((blinkMask & 1) ? SEG_BLANK : SEG_DIGIT[h / 10]),
        (uint8_t)((blinkMask & 1) ? SEG_BLANK : SEG_DIGIT[h % 10]),
        (uint8_t)((blinkMask & 2) ? SEG_BLANK : SEG_DIGIT[m / 10]),
        (uint8_t)((blinkMask & 2) ? SEG_BLANK : SEG_DIGIT[m % 10]),
    };
    if (colon) s[1] |= 0x80;
    tm_frame(s, true, dispLevel);
}

static void showTag(uint8_t a, uint8_t b, uint8_t c, uint8_t d) {
    uint8_t s[4] = { a, b, c, d };
    tm_frame(s, true, dispLevel);
}

// ═════════════════════════════════════════════════════════════
// EEPROM: settings block + wear-leveled valve-state journal
// ═════════════════════════════════════════════════════════════
static void settingsLoad(void) {
    uint8_t b[7];
    eeprom_read_block(b, EE_SET_BASE, 7);
    uint8_t ck = (uint8_t)(b[0] ^ b[1] ^ b[2] ^ b[3] ^ b[4] ^ b[5]);
    if (b[0] == EE_SET_MAGIC && ck == b[6] &&
        b[1] < 24 && b[2] < 60 && b[3] < 24 && b[4] < 60 && b[5] < 2) {
        s_onH = b[1]; s_onM = b[2]; s_offH = b[3]; s_offM = b[4]; s_dst = b[5];
    } // else keep compiled defaults
}

static void settingsSave(void) {
    uint8_t b[7] = { EE_SET_MAGIC, s_onH, s_onM, s_offH, s_offM, s_dst, 0 };
    b[6] = (uint8_t)(b[0] ^ b[1] ^ b[2] ^ b[3] ^ b[4] ^ b[5]);
    eeprom_update_block(b, EE_SET_BASE, 7);
}

// Journal: each write advances one slot with seq+1, so wear is spread
// across 32 cells (~3.2M state changes at 100k/cell). The newest slot
// is the valid one whose successor does not continue the sequence.
static bool vsIsValid(uint8_t val) { return (val & 0xFE) == VS_VAL_TAG; }

static bool vsLoad(bool *open) {
    bool found = false;
    for (uint8_t i = 0; i < EE_VS_SLOTS; i++) {
        uint8_t seq = eeprom_read_byte(EE_VS_BASE + 2 * i);
        uint8_t val = eeprom_read_byte(EE_VS_BASE + 2 * i + 1);
        if (!vsIsValid(val)) continue;
        uint8_t j    = (uint8_t)((i + 1) % EE_VS_SLOTS);
        uint8_t seqN = eeprom_read_byte(EE_VS_BASE + 2 * j);
        uint8_t valN = eeprom_read_byte(EE_VS_BASE + 2 * j + 1);
        if (!vsIsValid(valN) || seqN != (uint8_t)(seq + 1)) {
            vs_slot = i; vs_seq = seq;
            *open = (val & 0x01);
            found = true;              // keep scanning: last break point wins
        }
    }
    return found;
}

static void vsStore(bool open) {
    vs_slot = (uint8_t)((vs_slot + 1) % EE_VS_SLOTS);
    vs_seq++;
    eeprom_update_byte(EE_VS_BASE + 2 * vs_slot,     vs_seq);
    eeprom_update_byte(EE_VS_BASE + 2 * vs_slot + 1, (uint8_t)(VS_VAL_TAG | (open ? 1 : 0)));
}

// ═════════════════════════════════════════════════════════════
// Valve (DRV8871, bistable latching solenoid)
// OPEN  = IN1 pulse (PB0); CLOSE = IN2 pulse (PB1);
// idle = both low → DRV8871 auto-sleeps.
// ═════════════════════════════════════════════════════════════
static void solPulse(uint8_t bit) {
    wdt_reset();
    PORTB |= _BV(bit);
    _delay_ms(SOL_PULSE_MS);
    PORTB &= ~_BV(bit);
    wdt_reset();
}

// Single pulse only when state actually changes (or is unknown/forced).
static void valveSet(bool open, bool force) {
    if (!force && g_valveKnown && open == g_valveOpen) return;
    solPulse(open ? BIT_DRV_IN1 : BIT_DRV_IN2);
    g_valveOpen  = open;
    g_valveKnown = true;
    vsStore(open);
}

// ═════════════════════════════════════════════════════════════
// ADC — VM battery monitoring
// Source impedance ≈25K > ADC's 10K recommendation; C14 100nF is
// the charge reservoir. Discard the first conversion, keep the 2nd.
// ═════════════════════════════════════════════════════════════
static uint16_t adcReadVmMv(void) {
    ADMUX  = ADC_MUX_VM;                              // VCC ref, ADC0
    ADCSRA = _BV(ADEN) | _BV(ADPS2) | _BV(ADPS1);     // /64 → 125 kHz @ 8 MHz
    uint16_t v = 0;
    for (uint8_t i = 0; i < 2; i++) {                 // 1st discarded
        ADCSRA |= _BV(ADSC);
        while (ADCSRA & _BV(ADSC)) { }
        v = ADC;
    }
    ADCSRA = 0;                                       // ADC off (power)
    return (uint16_t)(v * VM_MV_PER_LSB);
}

// Early-close threshold with hysteresis. Two confirming reads so a
// solenoid/display transient can't false-trip the lockout.
// NOTE: pulses only if the valve is (or may be) open — the journal is
// loaded before the first call, so a low battery does NOT cause a
// close-pulse on every 2 s WDT hop once the valve is known closed.
static void checkBattery(void) {
    g_vmMv = adcReadVmMv();
    if (!g_vmLockout && g_vmMv < VM_CLOSE_MV) {
        _delay_ms(10);
        uint16_t v2 = adcReadVmMv();
        if (v2 < VM_CLOSE_MV) {
            g_vmMv = v2;
            g_vmLockout = true;
            valveSet(false, !g_valveKnown);   // close while VM can still drive the coil
        }
    } else if (g_vmLockout && g_vmMv > VM_REOPEN_MV) {
        g_vmLockout = false;         // schedule may reopen on next evaluation
    }
}

// ═════════════════════════════════════════════════════════════
// Schedule
// ═════════════════════════════════════════════════════════════
static bool inWindow(uint8_t h, uint8_t m) {
    uint16_t now = (uint16_t)h * 60 + m;
    uint16_t on  = (uint16_t)s_onH  * 60 + s_onM;
    uint16_t off = (uint16_t)s_offH * 60 + s_offM;
    if (on == off) return false;                     // degenerate: always off
    if (on < off)  return (now >= on && now < off);
    return (now >= on || now < off);                 // overnight window
}

static void evaluateSchedule(void) {
    uint8_t h, m;
    bool desired = false;                            // fail SAFE = closed
    if (!g_vmLockout && rtc_get_time_local(&h, &m) && !g_timeInvalid)
        desired = inWindow(h, m);
    valveSet(desired, false);
}

// Boot journal load — must run before the first checkBattery()
// so a low battery cannot pulse an already-closed valve every hop.
static void valveLoadJournal(void) {
    bool eeOpen = false;
    g_valveKnown = vsLoad(&eeOpen);
    if (g_valveKnown) g_valveOpen = eeOpen;
}

// Boot reconciliation: journal + RTC → correct the valve with at
// most ONE pulse, and only when the persisted state mismatches the
// schedule-correct state (or is unknown).
static void reconcile(void) {
    uint8_t h, m;
    bool haveTime = rtc_get_time_local(&h, &m) && !g_timeInvalid;
    bool desired  = (haveTime && !g_vmLockout) ? inWindow(h, m) : false;
    // force=!known: unknown → single pulse to a known state;
    // known → pulse only on mismatch (no pulse on the 2 s WDT hops)
    valveSet(desired, !g_valveKnown);
}

// ═════════════════════════════════════════════════════════════
// /ALERT (INT0, PB2): DS3231M alarm OR supervisor brown-out.
// Level-triggered; the ISR masks INT0 to stop the storm, main
// classifies and re-enables once the line is high again.
// ═════════════════════════════════════════════════════════════
ISR(EXT_INT0_vect) {
    GIMSK &= ~_BV(INT0);
    g_alertFlag = 1;
}

ISR(PCINT0_vect) { /* wake from power-down only (buttons) */ }

static void serviceAlert(void) {
    g_alertFlag = 0;
    uint8_t st;
    if (rtc_read(0x0F, &st, 1) && (st & 0x03)) {
        // RTC alarm: clear A1F/A2F (preserve OSF), act on schedule
        rtc_write1(0x0F, st & 0x7C);
        evaluateSchedule();
    } else if (!(PINB & _BV(BIT_ALERT))) {
        // /ALERT low with no alarm flag (or dead bus) = supervisor
        // brown-out. U6 already forced the close in hardware; this is
        // the firmware's immediate confirmation pulse + lockout.
        // Pulse ONCE per lockout entry: a sustained brown-out must not
        // re-pulse the coil / rewrite the EEPROM journal every loop.
        if (!g_vmLockout) valveSet(false, !g_valveKnown);
        g_vmLockout = true;
    }
    // Re-enable INT0 only when the line has released
    if (PINB & _BV(BIT_ALERT)) {
        GIFR   = _BV(INTF0);
        GIMSK |= _BV(INT0);
    }
}

// ═════════════════════════════════════════════════════════════
// Buttons — hardware RC debounce + 25 ms software confirm.
// Events are edge-based; held time enables long-press behaviors.
// ═════════════════════════════════════════════════════════════
typedef struct {
    uint8_t  stable;      // debounced level, 1 = pressed
    uint8_t  lastRaw;
    uint32_t tRaw;
    uint32_t tPress;
    uint8_t  evPress;
    uint8_t  evRelease;
    uint16_t relHoldMs;   // held duration at last release
} Btn;

// Explicit prototypes: the Arduino builder hoists auto-generated prototypes
// above this typedef, where Btn is not yet visible.
static void btnPoll1(Btn *b, uint8_t raw);
static uint16_t btnHeldMs(const Btn *b);

static Btn btnUp, btnSet;

static inline uint8_t rawUp(void)  { return (PINA & _BV(BIT_BTN_UP))  ? 0 : 1; }
static inline uint8_t rawSet(void) { return (PINA & _BV(BIT_BTN_SET)) ? 0 : 1; }

static void btnPoll1(Btn *b, uint8_t raw) {
    uint32_t now = millis();
    if (raw != b->lastRaw) { b->lastRaw = raw; b->tRaw = now; }
    else if ((now - b->tRaw) >= 25 && raw != b->stable) {
        b->stable = raw;
        if (raw) { b->tPress = now; b->evPress = 1; }
        else     { b->relHoldMs = (uint16_t)(now - b->tPress); b->evRelease = 1; }
    }
}
static void btnPoll(void) { btnPoll1(&btnUp, rawUp()); btnPoll1(&btnSet, rawSet()); }
static uint16_t btnHeldMs(const Btn *b) { return b->stable ? (uint16_t)(millis() - b->tPress) : 0; }

// ═════════════════════════════════════════════════════════════
// Settings wizard (hold SET 2 s):
//   [CL]  set clock  → [on] ON time → [oFF] OFF time → [dSt] DST
// UP increments (hold = fast-advance), SET advances field/item.
// 30 s inactivity anywhere = cancel, nothing saved.
// ═════════════════════════════════════════════════════════════
#define EDIT_SAVED    1
#define EDIT_TIMEOUT  0

// Edit HH:MM in place. Field 0 = hours (blink HH), field 1 = minutes.
// Returns EDIT_SAVED when SET is pressed past the minutes field.
static uint8_t editHM(uint8_t *hp, uint8_t *mp, bool *touched) {
    uint8_t  field = 0;
    uint32_t lastAct = millis(), nextRep = millis() + 600, lastDraw = 0;
    // wait for any lingering SET press to clear
    btnUp.evPress = btnUp.evRelease = btnSet.evPress = btnSet.evRelease = 0;

    for (;;) {
        wdt_reset();
        btnPoll();
        uint32_t now = millis();

        if (now - lastAct > MENU_TIMEOUT_MS) return EDIT_TIMEOUT;

        if (btnUp.evPress) {
            btnUp.evPress = 0;
            if (field == 0) *hp = (uint8_t)((*hp + 1) % 24);
            else            *mp = (uint8_t)((*mp + 1) % 60);
            *touched = true; lastAct = now; nextRep = now + 600;   // fast-advance after 600 ms
        }
        if (btnUp.stable && now >= nextRep) {
            if (field == 0) *hp = (uint8_t)((*hp + 1) % 24);
            else            *mp = (uint8_t)((*mp + 1) % 60);
            *touched = true; lastAct = now; nextRep = now + 120;   // 8 steps/s
        }
        if (btnSet.evPress) {
            btnSet.evPress = 0; lastAct = now;
            if (field == 0) field = 1;
            else return EDIT_SAVED;
        }
        btnUp.evRelease = btnSet.evRelease = 0;

        if (now - lastDraw >= 100) {
            lastDraw = now;
            uint8_t blink = ((now / 350) & 1) ? (uint8_t)(1 << field) : 0;
            showHM(*hp, *mp, true, blink);
        }
    }
}

// Edit the DST 0/1 flag. Same controls; UP toggles.
static uint8_t editFlag(uint8_t *fp, bool *touched) {
    uint32_t lastAct = millis(), lastDraw = 0;
    btnUp.evPress = btnSet.evPress = 0;
    for (;;) {
        wdt_reset();
        btnPoll();
        uint32_t now = millis();
        if (now - lastAct > MENU_TIMEOUT_MS) return EDIT_TIMEOUT;
        if (btnUp.evPress)  { btnUp.evPress = 0; *fp ^= 1; *touched = true; lastAct = now; }
        if (btnSet.evPress) { btnSet.evPress = 0; return EDIT_SAVED; }
        btnUp.evRelease = btnSet.evRelease = 0;
        if (now - lastDraw >= 100) {
            lastDraw = now;
            uint8_t blink = ((now / 350) & 1);
            showTag(SEG_d, SEG_S, SEG_t, blink ? SEG_BLANK : SEG_DIGIT[*fp & 1]);
        }
    }
}

static void tagPause(uint8_t a, uint8_t b, uint8_t c, uint8_t d) {
    showTag(a, b, c, d);
    for (uint8_t i = 0; i < 7; i++) { wdt_reset(); _delay_ms(100); }
}

static void runMenu(void) {
    dispLevel = BRIGHT_FULL;

    // If SET is still held (power-up entry path), wait for release so
    // the lingering press cannot spuriously advance the first field.
    while (rawSet()) { wdt_reset(); btnPoll(); _delay_ms(10); }
    btnSet.evPress = btnSet.evRelease = 0;

    // Working copies — committed only if the wizard completes
    uint8_t h = 12, m = 0;
    bool haveClock = rtc_get_time_local(&h, &m);
    uint8_t onH = s_onH, onM = s_onM, offH = s_offH, offM = s_offM, dst = s_dst;
    bool clockTouched = false, schedTouched = false, dstTouched = false;

    tagPause(SEG_C, SEG_L, SEG_BLANK, SEG_BLANK);                 // [CL  ] clock
    if (editHM(&h, &m, &clockTouched) == EDIT_TIMEOUT) return;

    tagPause(SEG_BLANK, SEG_o, SEG_n, SEG_BLANK);                 // [ on ] ON time
    if (editHM(&onH, &onM, &schedTouched) == EDIT_TIMEOUT) return;

    tagPause(SEG_BLANK, SEG_o, SEG_F, SEG_F);                     // [ oFF] OFF time
    if (editHM(&offH, &offM, &schedTouched) == EDIT_TIMEOUT) return;

    tagPause(SEG_d, SEG_S, SEG_t, SEG_BLANK);                     // [dSt ] DST toggle
    if (editFlag(&dst, &dstTouched) == EDIT_TIMEOUT) return;

    // ── Commit ────────────────────────────────────────────────
    // DST first: rtc_set_time_local() and rtc_program_alarms() convert
    // local → standard using s_dst, so the value the user just saw on
    // the display is what sticks. If only DST changed (clock untouched),
    // the RTC's standard time is left alone and the offset simply flips.
    (void)dstTouched; (void)haveClock;
    s_dst = dst;
    s_onH = onH; s_onM = onM; s_offH = offH; s_offM = offM;

    if (clockTouched || g_timeInvalid) rtc_set_time_local(h, m);
    settingsSave();
    rtc_program_alarms();

    // 3× flash confirm
    for (uint8_t i = 0; i < 3; i++) {
        wdt_reset();
        tm_blank();        _delay_ms(120);
        showHM(h, m, true, 0); _delay_ms(160);
    }
    evaluateSchedule();
    lastActivity = millis();
}

// ═════════════════════════════════════════════════════════════
// Display refresh (normal mode)
// Colon: blinking = valve OPEN, solid = valve CLOSED.
// "Lo" nag interleaved when battery is low; "Err" when the RTC
// is unreachable or its oscillator-stop flag is set.
// ═════════════════════════════════════════════════════════════
static void displayRefresh(void) {
    uint32_t now = millis();

    if (now < battViewUntil) {                       // UP short-press: battery view
        uint8_t volts  = (uint8_t)(g_vmMv / 1000);
        uint8_t tenths = (uint8_t)((g_vmMv % 1000) / 100);
        uint8_t s[4] = { SEG_b, SEG_BLANK, SEG_DIGIT[volts % 10], SEG_DIGIT[tenths] };
        s[1] |= 0x80;                                // colon = decimal point stand-in
        if (volts >= 10) s[1] |= SEG_DIGIT[1];
        tm_frame(s, true, dispLevel);
        return;
    }

    if (g_rtcFault || g_timeInvalid) {
        showTag(SEG_E, SEG_r, SEG_r, SEG_BLANK);
        return;
    }

    if ((g_vmLockout || g_vmMv < VM_WARN_MV) && ((now / 1000) & 0x04)) {
        showTag(SEG_L, SEG_o, SEG_BLANK, SEG_BLANK); // 4 s time / 4 s "Lo"
        return;
    }

    uint8_t h, m;
    if (!rtc_get_time_local(&h, &m)) { showTag(SEG_E, SEG_r, SEG_r, SEG_BLANK); return; }
    bool colon = g_valveOpen ? ((now / 500) & 1) : true;
    showHM(h, m, colon, 0);
}

// ═════════════════════════════════════════════════════════════
// Sleep. Power-down; wake sources: buttons (PCINT1/2), /ALERT
// (INT0 low level). The always-on WDT will RESET the part after
// ≤2 s of sleep — by design. Boot is quiet + idempotent, so the
// idle pattern is: sleep ~2 s → WDT reset → reconcile (no pulse)
// → sleep. Average duty ≈1–2 %.
// ═════════════════════════════════════════════════════════════
static void enterSleep(void) {
    if (dispOn) { tm_blank(); dispOn = false; }
    cli();
    PCMSK0 |= _BV(PCINT1) | _BV(PCINT2);   // buttons
    GIFR    = _BV(PCIF0);
    GIMSK  |= _BV(PCIE0);                  // INT0 stays as managed by serviceAlert
    set_sleep_mode(SLEEP_MODE_PWR_DOWN);
    sleep_enable();
    wdt_reset();                           // grant the full 2 s window
    sei();
    sleep_cpu();                           // ← WDT reset likely lands here
    sleep_disable();
    GIMSK  &= ~_BV(PCIE0);
    PCMSK0 &= ~(_BV(PCINT1) | _BV(PCINT2));
    wdt_reset();
    if (rawUp() || rawSet()) {             // a button woke us
        lastActivity = millis();
        dispOn = true;
        dispLevel = BRIGHT_FULL;
        battViewUntil = 0;
    }
}

// ═════════════════════════════════════════════════════════════
// Setup / loop
// ═════════════════════════════════════════════════════════════
void setup() {
    // WDT: already at 2 s via .init3. g_resetFlags holds MCUSR.
    bool quietBoot = (g_resetFlags & _BV(WDRF)) &&
                     !(g_resetFlags & (_BV(EXTRF) | _BV(PORF) | _BV(BORF)));

    // ── Pins ──────────────────────────────────────────────────
    // PORTB: driver inputs low outputs; /ALERT input (external pull-up)
    PORTB &= ~(_BV(BIT_DRV_IN1) | _BV(BIT_DRV_IN2) | _BV(BIT_ALERT));
    DDRB  |=  (_BV(BIT_DRV_IN1) | _BV(BIT_DRV_IN2));
    DDRB  &= ~_BV(BIT_ALERT);
    // PORTA: buttons w/ pull-ups (belt over the external 10Ks), spare
    // MISO pulled, TM1637 lines released-low, ADC pin floating digital-off
    DDRA  &= ~(_BV(BIT_BTN_UP) | _BV(BIT_BTN_SET) | _BV(BIT_MISO) |
               _BV(BIT_TM_CLK) | _BV(BIT_TM_DIO) | _BV(BIT_VM_SENSE));
    PORTA |=  (_BV(BIT_BTN_UP) | _BV(BIT_BTN_SET) | _BV(BIT_MISO));
    PORTA &= ~(_BV(BIT_TM_CLK) | _BV(BIT_TM_DIO) | _BV(BIT_VM_SENSE));
    DIDR0 |= _BV(ADC0D);                   // PA0 is analog only

    twi_init();
    settingsLoad();
    valveLoadJournal();                    // BEFORE checkBattery (see note there)

    // ── Battery: lockout state is derived fresh each boot ─────
    checkBattery();

    // ── RTC: OSF check, alarm (re)programming ─────────────────
    uint8_t st;
    if (rtc_read(0x0F, &st, 1)) g_timeInvalid = (st & 0x80) != 0;
    rtc_program_alarms();                  // idempotent; also clears stale A1F/A2F

    // ── Correct the valve (single pulse only on mismatch) ─────
    reconcile();

    // ── /ALERT interrupt: INT0 low level (wakes from power-down) ─
    MCUCR &= ~(_BV(ISC01) | _BV(ISC00));   // low level
    if (PINB & _BV(BIT_ALERT)) { GIFR = _BV(INTF0); GIMSK |= _BV(INT0); }
    else g_alertFlag = 1;                  // already asserted: service in loop

    if (quietBoot) {
        // WDT-reset hop while idle: no splash, display stays dark,
        // loop will re-enter sleep immediately.
        dispOn = false;
        lastActivity = millis() - DISPLAY_OFF_MS - 1;
    } else {
        // Power-on / external reset: splash then live display
        showTag(SEG_DASH, SEG_DASH, SEG_DASH, SEG_DASH);
        for (uint8_t i = 0; i < 6; i++) { wdt_reset(); _delay_ms(100); }
        dispOn = true;
        dispLevel = BRIGHT_FULL;
        lastActivity = millis();
        if (rawSet()) runMenu();           // SET held at power-up → wizard
    }
}

void loop() {
    wdt_reset();
    btnPoll();
    uint32_t now = millis();

    // ── /ALERT service + re-arm ───────────────────────────────
    if (g_alertFlag) serviceAlert();
    if (!(GIMSK & _BV(INT0))) {
        if (PINB & _BV(BIT_ALERT)) { GIFR = _BV(INTF0); GIMSK |= _BV(INT0); }
        else if (!g_alertFlag && !g_vmLockout)
            g_alertFlag = 1;   // still low, unserviced (a persistent
                               // supervisor-low after lockout must NOT
                               // spin the loop / block sleep)
    }

    // ── Periodic battery check while awake ────────────────────
    static uint32_t lastAdc = 0;
    if (now - lastAdc >= ADC_PERIOD_MS) {
        lastAdc = now;
        bool wasLocked = g_vmLockout;
        checkBattery();
        if (wasLocked && !g_vmLockout) evaluateSchedule();   // recovered → resync
    }

    // ── Buttons ───────────────────────────────────────────────
    if (btnUp.evPress || btnSet.evPress) {
        lastActivity = now;
        if (!dispOn) {                     // first press just wakes the display
            dispOn = true; dispLevel = BRIGHT_FULL;
            btnUp.evPress = btnSet.evPress = 0;
        }
    }
    if (btnUp.evPress)   { btnUp.evPress = 0; battViewUntil = now + BATT_VIEW_MS; }
    if (btnUp.evRelease) { btnUp.evRelease = 0; lastActivity = now; }
    if (btnSet.evPress)  { btnSet.evPress = 0; }
    if (btnSet.evRelease){ btnSet.evRelease = 0; lastActivity = now; }
    if (dispOn && btnHeldMs(&btnSet) >= 2000) {
        // consume the hold, then run the wizard
        while (rawSet()) { wdt_reset(); btnPoll(); _delay_ms(10); }
        btnSet.evPress = btnSet.evRelease = 0;
        runMenu();
    }

    // ── Display auto-dim / blank / refresh ────────────────────
    uint32_t idle = now - lastActivity;
    if (dispOn) {
        dispLevel = (idle > DISPLAY_DIM_MS) ? BRIGHT_DIM : BRIGHT_FULL;
        static uint32_t lastDraw = 0;
        if (now - lastDraw >= 250) { lastDraw = now; displayRefresh(); }
    }

    // ── Sleep when idle (blank after 30 s; wake on button) ────
    if (idle > DISPLAY_OFF_MS && !btnUp.stable && !btnSet.stable && !g_alertFlag) {
        enterSleep();
        // Wakes here on PCINT/INT0, or never (WDT reset → setup()).
    }
}
