// ============================================================
// GreenGuard CO2 Trap Timer — Rev 2.0
// Schedule: ON at 5:30 AM / OFF at 11:30 PM (hardcoded)
// Hardware: ATtiny85 + DS3231 RTC + TM1637 4-digit display
// Buttons:  UP (PB3) + SET (PB4)
// Power:    9V battery, no CR2032 (DS3231 VBAT tied to 3.3V)
// ============================================================

#include <Wire.h>
#include <DS3231.h>
#include <TM1637Display.h>
#include <avr/sleep.h>
#include <avr/interrupt.h>

// ── Pin Definitions (ATtiny85) ─────────────────────────────
#define CLK_PIN       0   // PB0 — TM1637 clock
#define DIO_PIN       1   // PB1 — TM1637 data
#define SOLENOID_PIN  2   // PB2 — MOSFET gate
#define BTN_UP        3   // PB3 — UP button (increment hour or minute)
#define BTN_SET       4   // PB4 — SET button (confirm / advance field)
#define RTC_INT_PIN   2   // DS3231 INT shares PB2 via diode isolation
                          // Note: INT fires when solenoid is off — acceptable

// ── Schedule ───────────────────────────────────────────────
#define ON_HOUR    5
#define ON_MIN    30
#define OFF_HOUR  23
#define OFF_MIN   30

// ── Globals ────────────────────────────────────────────────
DS3231 rtc;
TM1637Display display(CLK_PIN, DIO_PIN);

bool valveOpen     = false;
bool settingTime   = false;
int  setHour       = 0;
int  setMinute     = 0;

// ── Button debounce ────────────────────────────────────────
bool btnPressed(int pin) {
  if (digitalRead(pin) == LOW) {
    delay(40);
    return digitalRead(pin) == LOW;
  }
  return false;
}

bool btnHeld(int pin, int ms) {
  if (digitalRead(pin) == LOW) {
    delay(ms);
    return digitalRead(pin) == LOW;
  }
  return false;
}

// ── Setup ──────────────────────────────────────────────────
void setup() {
  pinMode(SOLENOID_PIN, OUTPUT);
  pinMode(BTN_UP,       INPUT_PULLUP);
  pinMode(BTN_SET,      INPUT_PULLUP);

  Wire.begin();
  rtc.begin();

  display.setBrightness(4); // 0-7, mid brightness

  // Startup: show ---- for 1 second
  display.setSegments((const uint8_t[]){0x40,0x40,0x40,0x40});
  delay(1000);

  // If SET held on boot → enter time-set mode immediately
  if (digitalRead(BTN_SET) == LOW) {
    enterTimeSet();
  }

  evaluateSchedule();
}

// ── Main Loop ──────────────────────────────────────────────
void loop() {
  // Show current time on display
  DateTime now = rtc.now();
  int h = now.hour();
  int m = now.minute();
  display.showNumberDecEx(h * 100 + m, 0b01000000, true); // colon on

  // Check if SET held 3 seconds → enter time-set mode
  if (btnHeld(BTN_SET, 3000)) {
    enterTimeSet();
    evaluateSchedule();
  }

  // Sleep until DS3231 alarm (wakes every 30 min at schedule boundaries)
  // Between alarms, wake every ~60s to refresh display
  enterSleep();

  // Re-evaluate schedule on wake
  evaluateSchedule();
}

// ── Time Set Mode ──────────────────────────────────────────
// Display shows HH.MM with decimal point separating hour/minute fields
// SET button advances field (hour → minute → save)
// UP button increments current field
void enterTimeSet() {
  DateTime now = rtc.now();
  setHour   = now.hour();
  setMinute = now.minute();

  // Flash display to indicate entry into set mode
  for (int i = 0; i < 3; i++) {
    display.clear();
    delay(200);
    display.showNumberDecEx(setHour * 100 + setMinute, 0b01000000, true);
    delay(200);
  }

  // ── Step 1: Set Hour ─────────────────────────────────────
  bool hourConfirmed = false;
  while (!hourConfirmed) {
    // Show hour blinking in left two digits
    display.showNumberDecEx(setHour * 100 + setMinute, 0b01000000, true);

    if (btnPressed(BTN_UP)) {
      setHour = (setHour + 1) % 24;
      display.showNumberDecEx(setHour * 100 + setMinute, 0b01000000, true);
      delay(150); // debounce pause
    }

    if (btnPressed(BTN_SET)) {
      // Brief flash to confirm hour selected, advance to minute
      display.clear();
      delay(200);
      display.showNumberDecEx(setHour * 100 + setMinute, 0b01000000, true);
      delay(300);
      hourConfirmed = true;
    }
  }

  // ── Step 2: Set Minute ───────────────────────────────────
  bool minuteConfirmed = false;
  while (!minuteConfirmed) {
    display.showNumberDecEx(setHour * 100 + setMinute, 0b01000000, true);

    if (btnPressed(BTN_UP)) {
      setMinute = (setMinute + 1) % 60;
      display.showNumberDecEx(setHour * 100 + setMinute, 0b01000000, true);
      delay(150);
    }

    // Hold SET 2 seconds to save
    if (btnHeld(BTN_SET, 2000)) {
      minuteConfirmed = true;
    }
  }

  // ── Save to RTC ──────────────────────────────────────────
  DateTime now2 = rtc.now();
  rtc.adjust(DateTime(now2.year(), now2.month(), now2.day(),
                      setHour, setMinute, 0));

  // 5x fast flash to confirm save
  for (int i = 0; i < 5; i++) {
    display.clear();
    delay(100);
    display.showNumberDecEx(setHour * 100 + setMinute, 0b01000000, true);
    delay(100);
  }
}

// ── Schedule Logic ─────────────────────────────────────────
void evaluateSchedule() {
  DateTime now = rtc.now();
  int nowMins = now.hour() * 60 + now.minute();
  int onMins  = ON_HOUR  * 60 + ON_MIN;   // 330
  int offMins = OFF_HOUR * 60 + OFF_MIN;  // 1410

  if (nowMins >= onMins && nowMins < offMins) {
    openValve();
    setNextAlarm(OFF_HOUR, OFF_MIN);
  } else {
    closeValve();
    setNextAlarm(ON_HOUR, ON_MIN);
  }
}

void setNextAlarm(int h, int m) {
  rtc.clearAlarm(1);
  rtc.setAlarm(DS3231_A1_Hour, m, h, 0, false);
  rtc.enableAlarm(1, true);
}

// ── Valve Control ──────────────────────────────────────────
void openValve() {
  digitalWrite(SOLENOID_PIN, HIGH);
  valveOpen = true;
}

void closeValve() {
  digitalWrite(SOLENOID_PIN, LOW);
  valveOpen = false;
}

// ── Sleep ──────────────────────────────────────────────────
void enterSleep() {
  display.setBrightness(0, false); // display off during sleep
  set_sleep_mode(SLEEP_MODE_PWR_DOWN);
  sleep_enable();
  attachInterrupt(0, wakeISR, LOW);
  sleep_cpu();
  sleep_disable();
  detachInterrupt(0);
  display.setBrightness(4, true);  // display back on wake
}

void wakeISR() { }
