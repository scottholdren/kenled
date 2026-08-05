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
// Freshness scheme: the branch-ref API tells us the latest wall commit (the
// API is never CDN-cached, and 304 conditional responses don't count against
// GitHub's rate limit), then content is fetched by commit sha — an immutable
// URL the CDN can't serve stale. Plain raw branch URLs sit behind an edge
// cache that ignores query strings, so they can lag pushes by many minutes.
#define REF_URL "https://api.github.com/repos/scottholdren/kenled/git/ref/heads/wall"
#define RAW_BASE "https://raw.githubusercontent.com/scottholdren/kenled/"

// ---- Update mode (compile-time) ----
//   MODE_POLL       — keep polling every POLL_INTERVAL_MS (live-updating wall)
//   MODE_BOOT_FETCH — fetch the latest once at boot, then Wi-Fi off and play
//                     forever. Production mode: power-cycle to pull the latest.
//   MODE_OFFLINE    — no Wi-Fi at all; play the cached/compiled-in animation.
// Override without editing:  --build-property "compiler.cpp.extra_flags=-DUPDATE_MODE=1"
#define MODE_POLL 0
#define MODE_BOOT_FETCH 1
#define MODE_OFFLINE 2
#ifndef UPDATE_MODE
#define UPDATE_MODE MODE_POLL
#endif
#define POLL_INTERVAL_MS 60000UL
#define CACHE_PATH "/current.json"
#define INCOMING_PATH "/incoming.json"

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
volatile bool updateDone = false;    // MODE_BOOT_FETCH: one successful check completed

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

Anim* animFromDoc(JsonDocument& doc) {
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

// Parse an animation from a LittleFS file. Parsing from flash (not from a
// String while TLS buffers are alive) keeps peak heap low enough for big
// multi-frame animations.
Anim* parseAnimFile(const char* path) {
  File f = LittleFS.open(path, "r");
  if (!f) return nullptr;
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, f);
  f.close();
  if (err != DeserializationError::Ok) {
    Serial.printf("[parse] %s: %s\n", path, err.c_str());
    return nullptr;
  }
  return animFromDoc(doc);
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
#if UPDATE_MODE != MODE_OFFLINE
  // status dot, bottom-right: green = fresh/updated, yellow = stale/no fetch
  // yet, red = no wifi
  uint16_t dot;
  if (updateDone) {
    dot = 0x07E0;
  } else if (!wifiUp) {
    dot = 0xF800;
  } else if (millis() - lastFetchOkAt < 3 * POLL_INTERVAL_MS && lastFetchOkAt != 0) {
    dot = 0x07E0;
  } else {
    dot = 0xFFE0;
  }
  canvas.fillRect(canvas.width() - 5, canvas.height() - 5, 4, 4, dot);
#endif
  tft.drawRGBBitmap(0, 0, canvas.getBuffer(), canvas.width(), canvas.height());
  apa102Steady();
}

// ---- Wi-Fi polling (background task) ----

#if UPDATE_MODE != MODE_OFFLINE
// Fetch current.json at a specific commit and stage it for the main loop.
// Streams to flash and frees the TLS connection BEFORE parsing — parsing a
// large animation while TLS buffers are alive can exhaust the heap.
void fetchAnimation(const String& sha) {
  bool downloaded = false;
  {
    WiFiClientSecure client;
    client.setInsecure(); // art installation, not a bank
    HTTPClient http;
    http.begin(client, RAW_BASE + sha + "/current.json");
    int code = http.GET();
    if (code == 200) {
      File f = LittleFS.open(INCOMING_PATH, "w");
      if (f) {
        http.writeToStream(&f);
        f.close();
        downloaded = true;
      }
    } else {
      Serial.printf("[poll] raw fetch HTTP %d\n", code);
    }
    http.end();
  } // TLS + HTTP freed here

  if (!downloaded) return;
  Anim* a = parseAnimFile(INCOMING_PATH);
  if (a != nullptr) {
    LittleFS.remove(CACHE_PATH);
    LittleFS.rename(INCOMING_PATH, CACHE_PATH);
    xSemaphoreTake(pendingMux, portMAX_DELAY);
    freeAnim(pending);
    pending = a;
    xSemaphoreGive(pendingMux);
    Serial.printf("[poll] updated to %s: %ux%u %u frames\n", sha.substring(0, 7).c_str(), a->cols,
                  a->rows, a->frameCount);
  } else {
    Serial.println("[poll] fetched but invalid animation json");
  }
}

void pollTask(void*) {
  String refEtag = "";
  String lastSha = "";
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
      client.setInsecure();
      HTTPClient http;
      http.begin(client, REF_URL);
      http.setUserAgent("kenled-dongle"); // GitHub API requires a User-Agent
      if (refEtag.length() > 0) http.addHeader("If-None-Match", refEtag);
      const char* keys[] = {"ETag"};
      http.collectHeaders(keys, 1);
      int code = http.GET();
      if (code == 304) {
        lastFetchOkAt = millis();
        Serial.println("[poll] ref unchanged");
        http.end();
      } else if (code == 200) {
        String etag = http.header("ETag");
        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, http.getString());
        http.end();
        const char* sha = doc["object"]["sha"] | "";
        if (err == DeserializationError::Ok && strlen(sha) == 40) {
          if (lastSha != sha) {
            fetchAnimation(String(sha));
            lastSha = sha;
          }
          refEtag = etag;
          lastFetchOkAt = millis();
        } else {
          Serial.println("[poll] bad ref response");
        }
      } else {
        Serial.printf("[poll] ref HTTP %d\n", code);
        http.end();
      }
    }
#if UPDATE_MODE == MODE_BOOT_FETCH
    if (lastFetchOkAt != 0) {
      // Got a definitive answer once — done. Wi-Fi off, play forever.
      updateDone = true;
      WiFi.disconnect(true);
      WiFi.mode(WIFI_OFF);
      wifiUp = false;
      Serial.println("[poll] boot fetch complete, wifi off");
      vTaskDelete(nullptr);
    }
    vTaskDelay(pdMS_TO_TICKS(15000)); // retry sooner — waiting on a router, not a schedule
#else
    vTaskDelay(pdMS_TO_TICKS(POLL_INTERVAL_MS));
#endif
  }
}
#endif // UPDATE_MODE != MODE_OFFLINE

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
    boot = parseAnimFile(CACHE_PATH);
    if (boot != nullptr) Serial.println("[boot] playing cached animation");
  }
  if (boot == nullptr) {
    boot = builtinAnim();
    Serial.println("[boot] playing compiled-in animation");
  }
  applyAnim(boot);

#if UPDATE_MODE != MODE_OFFLINE
  WiFi.mode(WIFI_STA);
  xTaskCreate(pollTask, "poll", 8192, nullptr, 1, nullptr);
#endif
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
