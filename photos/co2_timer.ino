/*
 * GreenGuard CO2 Trap Timer
 * Hardware: ATtiny85 + DS3231 RTC + IRL540N MOSFET + 12V NC solenoid valve
 *
 * Schedule: ON at 5:30 AM, OFF at 11:30 PM (local time, set in DS3231)
 *
 * Pin map (ATtiny85):
 *   PB0 (pin 5) — SDA  (I2C to DS3231 + ICSP MOSI)
 *   PB1 (pin 6) — SOLENOID gate via R6/Q1 (HIGH = valve open = CO2 flowing)
 *   PB2 (pin 7) — SCL  (I2C clock + DS3231 INT/SQW alarm interrupt, INT0)
 *   PB3 (pin 2) — LED_PWR  (green power LED, always on)
 *   PB4 (pin 3) — LED_VALVE (blue valve LED, on when solenoid open)
 *   PB5 (pin 1) — RESET (SYNC button grounds this to reset MCU)
 *
 * Required libraries (install via Arduino IDE Library Manager):
 *   - TinyWireM  (USI I2C for ATtiny85)
 *
 * Board support:
 *   - Install ATTinyCore by Spence Konde via Boards Manager
 *   - Board: "ATtiny25/45/85"
 *   - Chip: ATtiny85
 *   - Clock: "8 MHz (internal)"
 *   - millis()/micros(): "Enabled"
 *   - Programmer: USBtinyISP (or Arduino as ISP)
 *
 * To set RTC time: set SET_RTC_TIME 1 below, compile and flash once,
 * then immediately set SET_RTC_TIME back to 0 and reflash.
 * The DS3231 keeps time on the CR2032 battery when main power is off.
 */

#include <TinyWireM.h>
#include <avr/sleep.h>
#include <avr/interrupt.h>

// ── Schedule ─────────────────────────────────────────────────────────────────
#define ON_HOUR    5
#define ON_MIN    30
#define OFF_HOUR  23
#define OFF_MIN   30

// ── Set to 1 ONCE to program the DS3231 with the current compile time ────────
#define SET_RTC_TIME  0

// ── Pin assignments ───────────────────────────────────────────────────────────
#define PIN_SOLENOID  PB1
#define PIN_LED_PWR   PB3
#define PIN_LED_VALVE PB4

// ── DS3231 I2C address ────────────────────────────────────────────────────────
#define DS3231_ADDR  0x68

// ── BCD helpers ───────────────────────────────────────────────────────────────
static uint8_t bcd2dec(uint8_t b) { return (b >> 4) * 10 + (b & 0x0F); }
static uint8_t dec2bcd(uint8_t d) { return ((d / 10) << 4) | (d % 10); }

// ── DS3231 register access ────────────────────────────────────────────────────
static uint8_t rtcRead(uint8_t reg) {
    TinyWireM.beginTransmission(DS3231_ADDR);
    TinyWireM.send(reg);
    TinyWireM.endTransmission();
    TinyWireM.requestFrom(DS3231_ADDR, 1);
    return TinyWireM.receive();
}

static void rtcWrite(uint8_t reg, uint8_t val) {
    TinyWireM.beginTransmission(DS3231_ADDR);
    TinyWireM.send(reg);
    TinyWireM.send(val);
    TinyWireM.endTransmission();
}

static void getTime(uint8_t &h, uint8_t &m) {
    m = bcd2dec(rtcRead(0x01) & 0x7F);
    h = bcd2dec(rtcRead(0x02) & 0x3F);
}

// ── Schedule logic ────────────────────────────────────────────────────────────
static bool shouldBeOn(uint8_t h, uint8_t m) {
    uint16_t now  = (uint16_t)h * 60 + m;
    uint16_t on_t = (uint16_t)ON_HOUR  * 60 + ON_MIN;
    uint16_t off_t= (uint16_t)OFF_HOUR * 60 + OFF_MIN;
    return (now >= on_t && now < off_t);
}

// ── Set DS3231 Alarm 1 to fire at specific hour:minute:00 ─────────────────────
static void setAlarm(uint8_t hour, uint8_t min) {
    // Match seconds=00, minutes, hours; ignore day/date (A1M4=1)
    rtcWrite(0x07, dec2bcd(0));       // seconds = 00, A1M1=0
    rtcWrite(0x08, dec2bcd(min));     // minutes, A1M2=0
    rtcWrite(0x09, dec2bcd(hour));    // hours,   A1M3=0
    rtcWrite(0x0A, 0x80);             // day don't care, A1M4=1

    // Control: INTCN=1, A1IE=1, A2IE=0
    rtcWrite(0x0E, 0x05);

    // Clear alarm flags
    rtcWrite(0x0F, rtcRead(0x0F) & ~0x03);
}

// ── Solenoid + LED control ────────────────────────────────────────────────────
static void setValve(bool on) {
    digitalWrite(PIN_SOLENOID, on ? HIGH : LOW);
    digitalWrite(PIN_LED_VALVE, on ? HIGH : LOW);
}

// ── Alarm interrupt ───────────────────────────────────────────────────────────
volatile bool alarmFired = false;

ISR(INT0_vect) {
    alarmFired = true;
}

// ── Optional: set DS3231 to compile time ──────────────────────────────────────
#if SET_RTC_TIME
static uint8_t parseMonth(const char *s) {
    const char *months = "JanFebMarAprMayJunJulAugSepOctNovDec";
    for (uint8_t i = 0; i < 12; i++) {
        if (strncmp(s, months + i * 3, 3) == 0) return i + 1;
    }
    return 1;
}

static void setCompileTime() {
    // __DATE__ = "Mon DD YYYY", __TIME__ = "HH:MM:SS"
    const char *d = __DATE__;
    const char *t = __TIME__;
    uint8_t month = parseMonth(d);
    uint8_t day   = (d[4] == ' ' ? 0 : d[4] - '0') * 10 + (d[5] - '0');
    uint8_t year  = (d[9] - '0') * 10 + (d[10] - '0');
    uint8_t hour  = (t[0] - '0') * 10 + (t[1] - '0');
    uint8_t min   = (t[3] - '0') * 10 + (t[4] - '0');
    uint8_t sec   = (t[6] - '0') * 10 + (t[7] - '0');

    TinyWireM.beginTransmission(DS3231_ADDR);
    TinyWireM.send(0x00);
    TinyWireM.send(dec2bcd(sec));
    TinyWireM.send(dec2bcd(min));
    TinyWireM.send(dec2bcd(hour));
    TinyWireM.send(0x01);             // day of week (unused)
    TinyWireM.send(dec2bcd(day));
    TinyWireM.send(dec2bcd(month));
    TinyWireM.send(dec2bcd(year));
    TinyWireM.endTransmission();

    // Clear oscillator stop flag
    rtcWrite(0x0F, rtcRead(0x0F) & ~0x80);
}
#endif

// ── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
    pinMode(PIN_SOLENOID,  OUTPUT);
    pinMode(PIN_LED_PWR,   OUTPUT);
    pinMode(PIN_LED_VALVE, OUTPUT);

    digitalWrite(PIN_LED_PWR, HIGH);   // power LED always on
    setValve(false);                   // solenoid off until schedule checked

    TinyWireM.begin();

#if SET_RTC_TIME
    setCompileTime();
#endif

    // If DS3231 oscillator was stopped (dead battery / first power), clear flag
    uint8_t status = rtcRead(0x0F);
    if (status & 0x80) {
        rtcWrite(0x0F, status & ~0x80);
    }

    // Read current time and apply schedule immediately
    uint8_t h, m;
    getTime(h, m);
    bool on = shouldBeOn(h, m);
    setValve(on);

    // Arm alarm for next transition
    if (on) {
        setAlarm(OFF_HOUR, OFF_MIN);
    } else {
        setAlarm(ON_HOUR, ON_MIN);
    }

    // INT0 on PB2: falling edge (DS3231 INT/SQW is open-drain, active low)
    MCUCR = (MCUCR & ~((1 << ISC00))) | (1 << ISC01);
    GIMSK |= (1 << INT0);

    // Release PB2 as input so DS3231 can drive it low
    DDRB  &= ~(1 << PB2);
    PORTB &= ~(1 << PB2);   // no internal pullup — R7 on PCB provides pullup

    sei();
}

// ── Main loop: sleep → wake on alarm → update valve → re-arm → sleep ─────────
void loop() {
    set_sleep_mode(SLEEP_MODE_PWR_DOWN);
    sleep_enable();
    sleep_cpu();     // MCU sleeps here, ~1µA draw
    sleep_disable();

    if (!alarmFired) return;
    alarmFired = false;

    // Re-init I2C (USI pins were released as inputs during sleep)
    TinyWireM.begin();

    // Clear DS3231 alarm 1 flag
    rtcWrite(0x0F, rtcRead(0x0F) & ~0x01);

    // Apply new schedule state
    uint8_t h, m;
    getTime(h, m);
    bool on = shouldBeOn(h, m);
    setValve(on);

    // Arm next alarm
    if (on) {
        setAlarm(OFF_HOUR, OFF_MIN);
    } else {
        setAlarm(ON_HOUR, ON_MIN);
    }

    // Release PB2 back to input for next interrupt
    DDRB  &= ~(1 << PB2);
    PORTB &= ~(1 << PB2);
}
