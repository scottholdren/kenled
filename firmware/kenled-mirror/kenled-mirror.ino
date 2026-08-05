// KenLED mirror + Wi-Fi poller — LilyGo T-Dongle-C5 (ESP32-C5).
//
// Plays animations on the 0.96" LCD (ST7735, 80x160) and polls the published
// wall animation from GitHub. Boot order: LittleFS cache -> compiled-in
// animation.h fallback. Network only ever ADDS updates — playback never
// depends on Wi-Fi being up.
//
// Board: "ESP32C5 Dev Module" (esp32 core 3.3.0+)
// Libraries: Adafruit ST7735/GFX, ArduinoJson

#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <SPI.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include "animation.h" // compiled-in fallback

// ---- Network config (hardcoded by decision — one venue, one show) ----
// Credentials live in wifi_secrets.h (gitignored; see wifi_secrets.h.example —
// this repo is public, so they must never be committed).
#include "wifi_secrets.h"
#define POLL_URL "https://raw.githubusercontent.com/scottholdren/kenled/wall/current.json"
#define POLL_INTERVAL_MS 60000UL
#define CACHE_PATH "/current.json"

// ---- T-Dongle-C5 fixed wiring (from LilyGo's pin_config.h) ----
#define PIN_LCD_MOSI 2
#define PIN_LCD_SCK 6
#define PIN_LCD_CS 10
#define PIN_LCD_DC 3
#define PIN_LCD_RST 1
#define PIN_LCD_BL 0 // backlight is ACTIVE LOW: write 0 to turn on

// Panel quirk dials — see git history; this panel needs neither.
#define INVERT_COLORS false
#define SWAP_RB false

// The APA102 on the shared bus only wakes after 32 consecutive zero bits, so
// pure black (0x0000) pixels are forbidden on the wire; near-black keeps a
// set bit in every 16-bit word. Off cells draw dim gray to keep the grid
// visible. The pixel itself is held at steady soft white.
#define NEARBLACK 0x0821
#define OFFCELL 0x2124
#define STATUS_BRIGHT 4 // 0-31

// Animation size limits (matches the app's 32x32 cap)
#define MAX_DIM 32
#define MAX_ANIM_BYTES 65536

Adafruit_ST7735 tft(PIN_LCD_CS, PIN_LCD_DC, PIN_LCD_RST);
GFXcanvas16 canvas(80, 160); // ~25.6 KB framebuffer

struct Anim {
  uint16_t cols, rows, frameCount, frameMs;
  uint32_t palette[16];
  uint8_t* cells; // frameCount * cols * rows palette indices
};

Anim* current = nullptr;
Anim* pending = nullptr; // built by poll task, adopted by loop()
SemaphoreHandle_t pendingMux;

volatile bool wifiUp = false;
volatile uint32_t lastFetchOkAt = 0; // millis() of last 200/304

uint16_t cellSize, xOff, yOff;

void freeAnim(Anim* a) {
  if (a == nullptr) return;
  free(a->cells);
  free(a);
}

uint16_t color565(uint32_t rgb) {
  uint8_t r = (rgb >> 16) & 0xFF, g = (rgb >> 8) & 0xFF, b = rgb & 0xFF;
  uint16_t c = SWAP_RB ? tft.color565(b, g, r) : tft.color565(r, g, b);
  return c == 0 ? NEARBLACK : c;
}

void apa102Steady() {
  // Zeros-only framing: 0xFF tails read as a white LED frame on SK9822-style
  // clones. Trailing zeros double as end clocks and the apply-trigger.
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));
  for (int i = 0; i < 4; i++) SPI.transfer(0x00);
  SPI.transfer(0xE0 | STATUS_BRIGHT);
  SPI.transfer(255); SPI.transfer(255); SPI.transfer(255); // B G R
  for (int i = 0; i < 8; i++) SPI.transfer(0x00);
  SPI.endTransaction();
}

// ---- Animation parsing (same rules as the app's importer) ----

Anim* parseAnim(const String& json) {
  JsonDocument doc;
  if (deserializeJson(doc, json) != DeserializationError::Ok) return nullptr;
  int cols = doc["cols"] | 0;
  int rows = doc["rows"] | 0;
  JsonArray pal = doc["palette"];
  JsonArray frames = doc["frames"];
  if (cols < 1 || cols > MAX_DIM || rows < 1 || rows > MAX_DIM) return nullptr;
  if (pal.size() != 16 || frames.size() < 1) return nullptr;
  size_t cellCount = (size_t)cols * rows;
  size_t frameCount = frames.size();
  if (cellCount * frameCount > MAX_ANIM_BYTES) return nullptr;

  Anim* a = (Anim*)malloc(sizeof(Anim));
  if (a == nullptr) return nullptr;
  a->cells = (uint8_t*)malloc(cellCount * frameCount);
  if (a->cells == nullptr) {
    free(a);
    return nullptr;
  }
  a->cols = cols;
  a->rows = rows;
  a->frameCount = frameCount;
  int ms = doc["frameDurationMs"] | 125;
  a->frameMs = constrain(ms, 30, 2000);
  for (int i = 0; i < 16; i++) {
    const char* hex = pal[i] | "#000000";
    a->palette[i] = strtoul(hex[0] == '#' ? hex + 1 : hex, nullptr, 16);
  }
  size_t w = 0;
  for (JsonArray f : frames) {
    if (f.size() != cellCount) {
      freeAnim(a);
      return nullptr;
    }
    for (int v : f) a->cells[w++] = (v >= 0 && v < 16) ? v : 0;
  }
  return a;
}

void applyAnim(Anim* a) {
  freeAnim(current);
  current = a;
  uint16_t w = canvas.width(), h = canvas.height();
  cellSize = min(w / a->cols, h / a->rows);
  if (cellSize < 2) cellSize = 2;
  xOff = (w - cellSize * a->cols) / 2;
  yOff = (h - cellSize * a->rows) / 2;
  canvas.fillScreen(NEARBLACK);
}

// ---- Rendering ----

void drawFrame(uint16_t fi) {
  const uint8_t* frame = current->cells + (size_t)fi * current->cols * current->rows;
  uint16_t n = current->cols * current->rows;
  for (uint16_t i = 0; i < n; i++) {
    uint16_t x = xOff + (i % current->cols) * cellSize;
    uint16_t y = yOff + (i / current->cols) * cellSize;
    uint16_t c = frame[i] == 0 ? OFFCELL : color565(current->palette[frame[i]]);
    canvas.fillRect(x, y, cellSize - 1, cellSize - 1, c);
  }
  // status dot, bottom-right: green = fresh, yellow = stale/no fetch yet, red = no wifi
  uint16_t dot = !wifiUp                                        ? 0xF800
                 : (millis() - lastFetchOkAt < 3 * POLL_INTERVAL_MS && lastFetchOkAt != 0) ? 0x07E0
                                                                : 0xFFE0;
  canvas.fillRect(canvas.width() - 5, canvas.height() - 5, 4, 4, dot);
  tft.drawRGBBitmap(0, 0, canvas.getBuffer(), canvas.width(), canvas.height());
  apa102Steady();
}

// ---- Wi-Fi polling (background task) ----

void pollTask(void*) {
  String etag = "";
  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      wifiUp = false;
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASS);
      for (int i = 0; i < 20 && WiFi.status() != WL_CONNECTED; i++) {
        vTaskDelay(pdMS_TO_TICKS(500));
      }
    }
    if (WiFi.status() == WL_CONNECTED) {
      wifiUp = true;
      WiFiClientSecure client;
      client.setInsecure(); // art installation, not a bank
      HTTPClient http;
      http.begin(client, POLL_URL);
      if (etag.length() > 0) http.addHeader("If-None-Match", etag);
      const char* keys[] = {"ETag"};
      http.collectHeaders(keys, 1);
      int code = http.GET();
      if (code == 304) {
        lastFetchOkAt = millis();
        Serial.println("[poll] 304 not modified");
      } else if (code == 200) {
        String body = http.getString();
        Anim* a = parseAnim(body);
        if (a != nullptr) {
          File f = LittleFS.open(CACHE_PATH, "w");
          if (f) {
            f.print(body);
            f.close();
          }
          xSemaphoreTake(pendingMux, portMAX_DELAY);
          freeAnim(pending);
          pending = a;
          xSemaphoreGive(pendingMux);
          etag = http.header("ETag");
          lastFetchOkAt = millis();
          Serial.printf("[poll] 200 updated: %ux%u %u frames\n", a->cols, a->rows, a->frameCount);
        } else {
          Serial.println("[poll] 200 but invalid animation json");
        }
      } else {
        Serial.printf("[poll] HTTP %d\n", code);
      }
      http.end();
    }
    vTaskDelay(pdMS_TO_TICKS(POLL_INTERVAL_MS));
  }
}

// ---- Boot ----

Anim* builtinAnim() {
  Anim* a = (Anim*)malloc(sizeof(Anim));
  size_t total = (size_t)ANIM_NUM_LEDS * ANIM_FRAME_COUNT;
  a->cells = (uint8_t*)malloc(total);
  memcpy(a->cells, ANIM_FRAMES, total);
  a->cols = ANIM_COLS;
  a->rows = ANIM_ROWS;
  a->frameCount = ANIM_FRAME_COUNT;
  a->frameMs = ANIM_FRAME_MS;
  memcpy(a->palette, ANIM_PALETTE, sizeof(a->palette));
  return a;
}

void setup() {
  Serial.begin(115200);

  // C5 defaults SPI to other pins — bind it to the panel's wiring explicitly.
  SPI.begin(PIN_LCD_SCK, -1, PIN_LCD_MOSI, PIN_LCD_CS);
  tft.initR(INITR_MINI160x80_PLUGIN);
  tft.setSPISpeed(27000000);
  if (INVERT_COLORS) tft.invertDisplay(true);
  tft.setRotation(0); // portrait, 80 wide x 160 tall
  tft.fillScreen(NEARBLACK);

  pinMode(PIN_LCD_BL, OUTPUT);
  digitalWrite(PIN_LCD_BL, LOW); // on

  apa102Steady();

  pendingMux = xSemaphoreCreateMutex();

  // Boot animation: LittleFS cache first, compiled-in fallback second.
  Anim* boot = nullptr;
  if (LittleFS.begin(true)) {
    File f = LittleFS.open(CACHE_PATH, "r");
    if (f) {
      String body = f.readString();
      f.close();
      boot = parseAnim(body);
      if (boot != nullptr) Serial.println("[boot] playing cached animation");
    }
  }
  if (boot == nullptr) {
    boot = builtinAnim();
    Serial.println("[boot] playing compiled-in animation");
  }
  applyAnim(boot);

  WiFi.mode(WIFI_STA);
  xTaskCreate(pollTask, "poll", 8192, nullptr, 1, nullptr);
}

void loop() {
  static uint16_t f = 0;
  static uint32_t nextAt = 0;

  if (pending != nullptr) {
    xSemaphoreTake(pendingMux, portMAX_DELAY);
    Anim* a = pending;
    pending = nullptr;
    xSemaphoreGive(pendingMux);
    applyAnim(a);
    f = 0;
    nextAt = 0;
  }

  uint32_t now = millis();
  if (now < nextAt) return;
  // drift-free cadence; resync if we ever fall a whole frame behind
  nextAt = (now > nextAt + current->frameMs) ? now + current->frameMs : nextAt + current->frameMs;
  drawFrame(f);
  f = (f + 1) % current->frameCount;
}
