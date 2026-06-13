// ============================================================
// GreenGuard CO2 Trap Timer — Rev 3.0
// Schedule: ON at 5:30 AM / OFF at 11:30 PM (user-adjustable)
//
// Hardware: ATtiny84A-20PU + DS3231M RTC + TM1637 4-digit display
//           + DRV8833PWP H-bridge (bistable latching solenoid)
//           Enclosure: Hammond 1554CGY 120x65x40mm
//
// Compile:  ATTinyCore 1.5.x
//           Board: ATtiny84(a), Clock: 8 MHz (internal), BOD: 2.7V
//
// NOTE: J3 ISP header is wired to PB0/PB1/PB2, NOT the ATtiny84A's
//       actual ISP pins (PA4/PA5/PA6). Program chips in a ZIF socket
//       before installation. See firmware/flash.sh.
//
// NOTE: TM1637 CLK/DIO share bus with DS3231M SCL/SDA on PA4/PA3.
//       Both are driven via bit-bang (no Wire library) so they can
//       be managed without hardware USI conflicts.
// ============================================================

#include <avr/sleep.h>
#include <avr/interrupt.h>
#include <util/delay.h>

// ── Pin definitions (ATTinyCore default: PA0=D0..PA7=D7, PB0=D8..D11) ──
#define PIN_IN1      0   // PA0 → DRV8833 AIN1
#define PIN_IN2      1   // PA1 → DRV8833 AIN2
#define PIN_INT      2   // PA2 → DS3231M /INT alarm (PCINT2, active low)
#define PIN_DIO      3   // PA3 → DS3231M SDA + TM1637 DIO (shared)
#define PIN_CLK      4   // PA4 → DS3231M SCL + TM1637 CLK (shared)
                         // PA5 (D5) unused
#define PIN_BTN_UP   6   // PA6 → UP button (active low, pulled up by R2)
#define PIN_BTN_SET  7   // PA7 → SET button (active low, pulled up by R3)

// ── Schedule (24-hour) ─────────────────────────────────────────────────
#define ON_HOUR    5
#define ON_MIN    30
#define OFF_HOUR  23
#define OFF_MIN   30

// ── Solenoid pulse (bistable latching valve — current only during switch)
#define SOL_PULSE_MS  50

// ── DS3231M I2C address ───────────────────────────────────────────────
#define RTC_ADDR  0x68

// ── State ────────────────────────────────────────────────────────────
volatile bool alarmFired = false;
bool          valveOpen  = false;

// ─────────────────────────────────────────────────────────────────────
// Bit-bang I2C (open-drain: pull pin LOW to drive 0, release for 1)
// Both DS3231M and TM1637 share these pins — do not overlap calls.
// ─────────────────────────────────────────────────────────────────────
static inline void sda_lo() { pinMode(PIN_DIO, OUTPUT); digitalWrite(PIN_DIO, LOW); }
static inline void sda_hi() { pinMode(PIN_DIO, INPUT); }   // pull-up R5 raises line
static inline void scl_lo() { pinMode(PIN_CLK, OUTPUT); digitalWrite(PIN_CLK, LOW); }
static inline void scl_hi() { pinMode(PIN_CLK, INPUT); }   // pull-up R7 raises line
static inline bool sda_rd() { return digitalRead(PIN_DIO); }
static inline void i2c_dly() { _delay_us(5); }

static void i2c_start() {
    sda_hi(); scl_hi(); i2c_dly();
    sda_lo(); i2c_dly();
    scl_lo(); i2c_dly();
}
static void i2c_stop() {
    sda_lo(); i2c_dly();
    scl_hi(); i2c_dly();
    sda_hi(); i2c_dly();
}
static void i2c_write(uint8_t b) {
    for (int8_t i = 7; i >= 0; i--) {
        if (b & (1 << i)) sda_hi(); else sda_lo();
        i2c_dly(); scl_hi(); i2c_dly(); scl_lo(); i2c_dly();
    }
    sda_hi(); i2c_dly(); scl_hi(); i2c_dly(); scl_lo(); i2c_dly(); // clock ACK
}
static uint8_t i2c_read(bool ack) {
    uint8_t b = 0;
    sda_hi();
    for (int8_t i = 7; i >= 0; i--) {
        scl_hi(); i2c_dly();
        if (sda_rd()) b |= (1 << i);
        scl_lo(); i2c_dly();
    }
    if (ack) sda_lo(); else sda_hi();   // ACK or NACK
    i2c_dly(); scl_hi(); i2c_dly(); scl_lo(); i2c_dly();
    sda_hi();
    return b;
}

// ─────────────────────────────────────────────────────────────────────
// DS3231M register access
// ─────────────────────────────────────────────────────────────────────
static uint8_t bcd2dec(uint8_t b) { return (b >> 4) * 10 + (b & 0x0F); }
static uint8_t dec2bcd(uint8_t d) { return ((d / 10) << 4) | (d % 10); }

static void rtc_write(uint8_t reg, uint8_t val) {
    i2c_start();
    i2c_write((RTC_ADDR << 1));
    i2c_write(reg);
    i2c_write(val);
    i2c_stop();
}
static uint8_t rtc_read(uint8_t reg) {
    i2c_start();
    i2c_write((RTC_ADDR << 1));
    i2c_write(reg);
    i2c_start();                             // repeated start
    i2c_write((RTC_ADDR << 1) | 1);
    uint8_t v = i2c_read(false);             // NACK — last byte
    i2c_stop();
    return v;
}

static uint8_t rtc_hour()   { return bcd2dec(rtc_read(0x02) & 0x3F); }
static uint8_t rtc_minute() { return bcd2dec(rtc_read(0x01)); }
static uint8_t rtc_second() { return bcd2dec(rtc_read(0x00)); }

static void rtc_set_time(uint8_t h, uint8_t m, uint8_t s) {
    rtc_write(0x00, dec2bcd(s));
    rtc_write(0x01, dec2bcd(m));
    rtc_write(0x02, dec2bcd(h));  // 24-hr mode: bit6=0
}

// Alarm 1 fires at H:M:S daily (A1M4=1 ignore date, M3=M2=M1=0)
static void rtc_set_alarm1(uint8_t h, uint8_t m) {
    rtc_write(0x07, 0x00);           // seconds = 0, A1M1=0
    rtc_write(0x08, dec2bcd(m));     // A1M2=0
    rtc_write(0x09, dec2bcd(h));     // A1M3=0
    rtc_write(0x0A, 0x80);           // A1M4=1 (ignore date/day)
}
// Alarm 2 fires at H:M daily (A2M4=1 ignore date, M3=M2=0)
static void rtc_set_alarm2(uint8_t h, uint8_t m) {
    rtc_write(0x0B, dec2bcd(m));     // A2M2=0
    rtc_write(0x0C, dec2bcd(h));     // A2M3=0
    rtc_write(0x0D, 0x80);           // A2M4=1 (ignore date/day)
}

static uint8_t rtc_alarm_flags() { return rtc_read(0x0F) & 0x03; }
static void rtc_clear_flags()    { rtc_write(0x0F, rtc_read(0x0F) & ~0x03); }

// INTCN=1 (alarm interrupt), A1IE=1, A2IE=1
static void rtc_enable_alarms()  { rtc_write(0x0E, 0x07); }

// ─────────────────────────────────────────────────────────────────────
// TM1637 4-digit display
// Same CLK/DIO pins as DS3231M; protocol is I2C-like but LSB-first.
// ─────────────────────────────────────────────────────────────────────
static const uint8_t SEGS[] = {
    0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F  // 0–9
};

static void tm_write(uint8_t b) {
    for (uint8_t i = 0; i < 8; i++) {
        scl_lo(); i2c_dly();
        if (b & 0x01) sda_hi(); else sda_lo();
        b >>= 1;
        scl_hi(); i2c_dly();
    }
    scl_lo(); i2c_dly();    // ACK clock
    sda_hi();
    scl_hi(); i2c_dly();
    scl_lo(); i2c_dly();
}

static void tm_show(uint8_t h, uint8_t m, bool colon) {
    uint8_t d[4] = {
        SEGS[h / 10],
        SEGS[h % 10] | (colon ? 0x80 : 0x00),  // bit 7 = colon
        SEGS[m / 10],
        SEGS[m % 10]
    };
    i2c_start(); tm_write(0x40); i2c_stop();   // cmd: auto-increment mode
    i2c_start(); tm_write(0xC0);               // cmd: address 0
    for (uint8_t i = 0; i < 4; i++) tm_write(d[i]);
    i2c_stop();
    i2c_start(); tm_write(0x8F); i2c_stop();   // display on, brightness max
}

static void tm_off() {
    i2c_start(); tm_write(0x40); i2c_stop();
    i2c_start(); tm_write(0xC0);
    for (uint8_t i = 0; i < 4; i++) tm_write(0x00);
    i2c_stop();
    i2c_start(); tm_write(0x80); i2c_stop();   // display off
}

// ─────────────────────────────────────────────────────────────────────
// DRV8833 H-bridge — bistable latching solenoid
// Open/close with a 50ms pulse; idle state = both inputs LOW (coil off)
// ─────────────────────────────────────────────────────────────────────
static void valve_open() {
    digitalWrite(PIN_IN1, HIGH);
    delay(SOL_PULSE_MS);
    digitalWrite(PIN_IN1, LOW);
    valveOpen = true;
}
static void valve_close() {
    digitalWrite(PIN_IN2, HIGH);
    delay(SOL_PULSE_MS);
    digitalWrite(PIN_IN2, LOW);
    valveOpen = false;
}

// ─────────────────────────────────────────────────────────────────────
// Button helpers — mirror v2 API
// ─────────────────────────────────────────────────────────────────────
static bool btnPressed(uint8_t pin) {
    if (digitalRead(pin) == LOW) {
        delay(40);
        return (digitalRead(pin) == LOW);
    }
    return false;
}
static bool btnHeld(uint8_t pin, uint16_t ms) {
    if (digitalRead(pin) == LOW) {
        delay(ms);
        return (digitalRead(pin) == LOW);
    }
    return false;
}

// ─────────────────────────────────────────────────────────────────────
// Sleep — power-down until DS3231M /INT or button press
// ─────────────────────────────────────────────────────────────────────
ISR(PCINT0_vect) { alarmFired = true; }

static void enterSleep() {
    tm_off();
    GIMSK  |=  (1 << PCIE0);
    PCMSK0 |=  (1 << PCINT2) | (1 << PCINT6) | (1 << PCINT7); // INT, BTN_UP, BTN_SET
    set_sleep_mode(SLEEP_MODE_PWR_DOWN);
    sleep_enable();
    sei();
    sleep_cpu();
    sleep_disable();
    GIMSK  &= ~(1 << PCIE0);
    PCMSK0 &= ~((1 << PCINT2) | (1 << PCINT6) | (1 << PCINT7));
}

// ─────────────────────────────────────────────────────────────────────
// Time-set mode — same UX as v2
// SET button advances field (hour → minute → save)
// UP button increments current field
// Auto-exits after 30 s of inactivity
// ─────────────────────────────────────────────────────────────────────
static void enterTimeSet() {
    uint8_t h = rtc_hour(), m = rtc_minute();

    // 3× flash to confirm entry
    for (uint8_t i = 0; i < 3; i++) {
        tm_off(); delay(200);
        tm_show(h, m, true); delay(200);
    }

    // ── Step 1: set hour ───────────────────────────────────────────
    unsigned long lastAct = millis();
    while (millis() - lastAct < 30000UL) {
        bool blink = ((millis() / 400) % 2);
        uint8_t d[4] = {
            blink ? 0x00 : SEGS[h / 10],
            blink ? 0x00 : (SEGS[h % 10] | 0x80),
            SEGS[m / 10], SEGS[m % 10]
        };
        i2c_start(); tm_write(0x40); i2c_stop();
        i2c_start(); tm_write(0xC0);
        for (uint8_t i = 0; i < 4; i++) tm_write(d[i]);
        i2c_stop();
        i2c_start(); tm_write(0x8F); i2c_stop();

        if (btnPressed(PIN_BTN_UP)) {
            h = (h + 1) % 24; lastAct = millis(); delay(150);
        }
        if (btnPressed(PIN_BTN_SET)) {
            // Brief flash then advance to minute field
            tm_off(); delay(150); tm_show(h, m, true); delay(300);
            lastAct = millis();
            break;
        }
    }

    // ── Step 2: set minute ─────────────────────────────────────────
    lastAct = millis();
    while (millis() - lastAct < 30000UL) {
        bool blink = ((millis() / 400) % 2);
        uint8_t d[4] = {
            SEGS[h / 10], SEGS[h % 10] | 0x80,
            blink ? 0x00 : SEGS[m / 10],
            blink ? 0x00 : SEGS[m % 10]
        };
        i2c_start(); tm_write(0x40); i2c_stop();
        i2c_start(); tm_write(0xC0);
        for (uint8_t i = 0; i < 4; i++) tm_write(d[i]);
        i2c_stop();
        i2c_start(); tm_write(0x8F); i2c_stop();

        if (btnPressed(PIN_BTN_UP)) {
            m = (m + 1) % 60; lastAct = millis(); delay(150);
        }
        if (btnHeld(PIN_BTN_SET, 2000)) {    // hold SET 2 s to save
            rtc_set_time(h, m, 0);
            // 5× fast flash to confirm save
            for (uint8_t i = 0; i < 5; i++) {
                tm_off(); delay(100); tm_show(h, m, true); delay(100);
            }
            return;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────
// Schedule evaluation — called on startup and after each alarm wake
// ─────────────────────────────────────────────────────────────────────
static void evaluateSchedule() {
    uint16_t nowMins = (uint16_t)rtc_hour() * 60 + rtc_minute();
    uint16_t onMins  = (uint16_t)ON_HOUR  * 60 + ON_MIN;   // 330
    uint16_t offMins = (uint16_t)OFF_HOUR * 60 + OFF_MIN;  // 1410

    if (nowMins >= onMins && nowMins < offMins) {
        if (!valveOpen) valve_open();
    } else {
        if (valveOpen) valve_close();
    }
}

// ─────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────
void setup() {
    pinMode(PIN_IN1,    OUTPUT); digitalWrite(PIN_IN1, LOW);
    pinMode(PIN_IN2,    OUTPUT); digitalWrite(PIN_IN2, LOW);
    pinMode(PIN_INT,    INPUT);  // pulled up by R6
    pinMode(PIN_BTN_UP, INPUT);  // pulled up by R2
    pinMode(PIN_BTN_SET,INPUT);  // pulled up by R3
    sda_hi(); scl_hi();          // bus lines idle high

    delay(200);                  // let bus and RTC settle

    rtc_clear_flags();
    rtc_set_alarm1(ON_HOUR,  ON_MIN);
    rtc_set_alarm2(OFF_HOUR, OFF_MIN);
    rtc_enable_alarms();

    // Startup splash: show ---- for 1 s
    i2c_start(); tm_write(0x40); i2c_stop();
    i2c_start(); tm_write(0xC0);
    for (uint8_t i = 0; i < 4; i++) tm_write(0x40);  // segment g only
    i2c_stop();
    i2c_start(); tm_write(0x8F); i2c_stop();
    delay(1000);

    // If SET held on boot → enter time-set immediately
    if (digitalRead(PIN_BTN_SET) == LOW) enterTimeSet();

    evaluateSchedule();
}

// ─────────────────────────────────────────────────────────────────────
// Main loop
// ─────────────────────────────────────────────────────────────────────
void loop() {
    static uint32_t lastDisp = 0;
    static bool     colon    = false;

    // ── Handle alarm fires ─────────────────────────────────────────
    if (alarmFired || digitalRead(PIN_INT) == LOW) {
        alarmFired = false;
        uint8_t flags = rtc_alarm_flags();
        rtc_clear_flags();
        if (flags) evaluateSchedule();
    }

    // ── Update display every 500 ms (colon blink) ─────────────────
    if (valveOpen && (millis() - lastDisp >= 500)) {
        lastDisp = millis();
        colon = !colon;
        tm_show(rtc_hour(), rtc_minute(), colon);
    }

    // ── Button: hold SET 3 s → time-set mode ──────────────────────
    if (btnHeld(PIN_BTN_SET, 3000)) {
        enterTimeSet();
        evaluateSchedule();
    }

    // ── Sleep when valve is closed (outside active hours) ─────────
    if (!valveOpen) {
        enterSleep();
    }
}
