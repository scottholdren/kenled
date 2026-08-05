// KenLED player — loops the compiled-in animation from animation.h forever.
//
// Board: ESP32-S3-DevKitC-1 (Arduino IDE board: "ESP32S3 Dev Module")
// Library: FastLED (Library Manager)
//
// To change the animation: export a new animation.h from the designer app,
// replace the one next to this sketch, and re-flash.

#include <FastLED.h>
#include "animation.h"

// ---- Wiring config ------------------------------------------------------
// GPIO driving the WS2812B data line (through the 74AHCT125 level shifter).
// Bench test tip: set to 48 to use the DevKitC-1's onboard pixel — it will
// show the animation's top-left LED.
#define DATA_PIN 4

// true if the physical chain zigzags: row 0 runs left-to-right, row 1
// right-to-left, and so on (the usual way strips are wired into a matrix).
// false if every row runs left-to-right (parallel wiring).
#define SERPENTINE true

// Global brightness cap, 0-255. Full white at 255 is blinding and hot;
// diffused installations usually look best well below half.
#define BRIGHTNESS 96

// Power safety net: FastLED dims the whole frame if it would exceed this
// draw. Keep below the power supply rating (10 A supply -> 8000 mA cap).
#define MAX_MILLIAMPS 8000
// -------------------------------------------------------------------------

CRGB leds[ANIM_NUM_LEDS];

// The designer grid is row-major with origin top-left. This maps a grid
// position to the LED's position along the physical chain.
uint16_t ledIndex(uint8_t x, uint8_t y) {
  if (SERPENTINE && (y & 1)) {
    return (uint16_t)y * ANIM_COLS + (ANIM_COLS - 1 - x);
  }
  return (uint16_t)y * ANIM_COLS + x;
}

void setup() {
  FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, ANIM_NUM_LEDS);
  FastLED.setBrightness(BRIGHTNESS);
  FastLED.setMaxPowerInVoltsAndMilliamps(5, MAX_MILLIAMPS);
  FastLED.clear(true);
}

void loop() {
  for (uint16_t f = 0; f < ANIM_FRAME_COUNT; f++) {
    const uint8_t* frame = ANIM_FRAMES[f];
    for (uint8_t y = 0; y < ANIM_ROWS; y++) {
      for (uint8_t x = 0; x < ANIM_COLS; x++) {
        uint32_t rgb = ANIM_PALETTE[frame[y * ANIM_COLS + x]];
        leds[ledIndex(x, y)] = CRGB(rgb);
      }
    }
    FastLED.show();
    delay(ANIM_FRAME_MS);
  }
}
