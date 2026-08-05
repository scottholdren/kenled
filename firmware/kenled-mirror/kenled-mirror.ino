// KenLED mirror — plays animation.h as a grid of squares on the LilyGo
// T-Dongle-C5's 0.96" LCD (ST7735, 80x160). A pocket preview of the wall:
// same exported animation.h, same timing, no LEDs required.
//
// Board: LilyGo T-Dongle-C5 (ESP32-C5) — needs esp32 Arduino core 3.3.0+
//   (Tools -> Board -> "ESP32C5 Dev Module")
// Library: "Adafruit ST7735 and ST7789 Library" (+ Adafruit GFX) from the
//   Library Manager.
//
// Drop the same animation.h exported from the designer app next to this file.

#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <SPI.h>
#include "animation.h"

// T-Dongle-C5 fixed wiring (from LilyGo's pin_config.h)
#define PIN_LCD_MOSI 2
#define PIN_LCD_SCK 6
#define PIN_LCD_CS 10
#define PIN_LCD_DC 3
#define PIN_LCD_RST 1
#define PIN_LCD_BL 0 // backlight is ACTIVE LOW: write 0 to turn on

// Onboard APA102 pixel: on this board revision it listens on the LCD's SPI
// bus (SCK=6/MOSI=2, no chip-select of its own) — the factory pin_config's
// GPIO 4/5 does nothing. Screen traffic latches it with garbage, so an "off"
// frame is sent down the bus after every blit (the LCD's CS is idle then, so
// the LCD ignores it). Verified empirically 2026-08-05.

// Panel quirk dials. The INITR_MINI160x80_PLUGIN init already handles this
// panel's IPS inversion, so both stay off. Diagnosis by what red renders as:
//   red    -> correct, leave alone
//   cyan   -> set INVERT_COLORS true (background will also look white)
//   blue   -> set SWAP_RB true
//   yellow -> both flags are wrongly on; turn both off
#define INVERT_COLORS false
#define SWAP_RB false

// Hardware SPI — SPI.begin() in setup() maps it onto the panel's pins.
Adafruit_ST7735 tft(PIN_LCD_CS, PIN_LCD_DC, PIN_LCD_RST);

// Portrait 80x160: grid drawn top-of-screen down, like the wall.
// Frames render into an off-screen canvas, then blit in one SPI burst —
// no visible cell-by-cell painting at big transitions (like the loop wrap).
GFXcanvas16 canvas(80, 160); // ~25.6 KB framebuffer
uint16_t cellSize, xOff, yOff;

uint16_t color565(uint32_t rgb) {
  uint8_t r = (rgb >> 16) & 0xFF, g = (rgb >> 8) & 0xFF, b = rgb & 0xFF;
  return SWAP_RB ? tft.color565(b, g, r) : tft.color565(r, g, b);
}

// The pixel can't be kept dark (it hears every LCD byte and no code can stop
// a mid-blit latch), so hold it at a steady color instead — a constant glow
// masks the per-frame garbage latches that read as blinking against dark.
#define STATUS_BRIGHT 4 // 0-31

void apa102Steady() {
  // Zeros-only framing: 0xFF tails read as a white LED frame on SK9822-style
  // clones (applied at the next start frame). The trailing zero run is both
  // the end clocks and the apply-trigger for double-buffered clones.
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));
  for (int i = 0; i < 4; i++) SPI.transfer(0x00); // start frame
  SPI.transfer(0xE0 | STATUS_BRIGHT);
  SPI.transfer(255); SPI.transfer(255); SPI.transfer(255); // B G R — white
  for (int i = 0; i < 8; i++) SPI.transfer(0x00); // apply-trigger + end clocks
  SPI.endTransaction();
}

void drawFrame(const uint8_t* frame) {
  for (uint16_t i = 0; i < ANIM_NUM_LEDS; i++) {
    uint16_t x = xOff + (i % ANIM_COLS) * cellSize;
    uint16_t y = yOff + (i / ANIM_COLS) * cellSize;
    // 1px gap between cells reads as the mortar line between bricks
    canvas.fillRect(x, y, cellSize - 1, cellSize - 1, color565(ANIM_PALETTE[frame[i]]));
  }
  tft.drawRGBBitmap(0, 0, canvas.getBuffer(), canvas.width(), canvas.height());
  apa102Steady(); // re-assert every frame over the blit garbage
}

void setup() {
  // C5 defaults SPI to other pins — bind it to the panel's wiring explicitly.
  SPI.begin(PIN_LCD_SCK, -1, PIN_LCD_MOSI, PIN_LCD_CS);
  tft.initR(INITR_MINI160x80_PLUGIN);
  tft.setSPISpeed(27000000);
  if (INVERT_COLORS) tft.invertDisplay(true);
  tft.setRotation(0); // portrait, 80 wide x 160 tall
  tft.fillScreen(ST77XX_BLACK);

  pinMode(PIN_LCD_BL, OUTPUT);
  digitalWrite(PIN_LCD_BL, LOW); // on

  apa102Steady();

  uint16_t w = canvas.width();
  uint16_t h = canvas.height();
  cellSize = min(w / ANIM_COLS, h / ANIM_ROWS);
  xOff = (w - cellSize * ANIM_COLS) / 2;
  yOff = (h - cellSize * ANIM_ROWS) / 2;
  canvas.fillScreen(ST77XX_BLACK);
}

void loop() {
  static uint16_t f = 0;
  static uint32_t nextAt = 0;
  uint32_t now = millis();
  if (now < nextAt) return;
  // drift-free cadence; resync if we ever fall a whole frame behind
  nextAt = (now > nextAt + ANIM_FRAME_MS) ? now + ANIM_FRAME_MS : nextAt + ANIM_FRAME_MS;
  drawFrame(ANIM_FRAMES[f]);
  f = (f + 1) % ANIM_FRAME_COUNT;
}
