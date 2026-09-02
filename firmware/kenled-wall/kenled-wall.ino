// KenLED wall — production controller firmware (ESP32-S3-DevKitC-1).
//
// Drives the WS2811 bullet-pixel chain and (unless offline) pulls the
// published wall animation from GitHub. Same update machinery as the
// kenled-mirror dongle: LittleFS cache -> compiled-in fallback; network
// only ever ADDS updates, playback never depends on it.
//
// Board: "ESP32S3 Dev Module". Libraries: FastLED, ArduinoJson.
// Wi-Fi credentials: copy wifi_secrets.h.example to wifi_secrets.h.
//
// BENCH TEST (no string yet): BENCH_ONBOARD 1 drives the DevKitC-1's onboard
// WS2812 (GPIO 48) — it plays the animation's top-left cell. Set to 0 for
// the real chain on DATA_PIN through the level shifter.

#include <FastLED.h>
#include <WiFi.h>
#include <WiFiMulti.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include "wifi_secrets.h"
#include "animation.h" // compiled-in fallback

#ifndef BENCH_ONBOARD
#define BENCH_ONBOARD 1
#endif

#if BENCH_ONBOARD
#define DATA_PIN 48 // DevKitC-1 onboard pixel (some revisions: 38)
#define LED_TYPE WS2812
#define COLOR_ORDER GRB
#else
#define DATA_PIN 4 // through the 74AHCT125 level shifter
#define LED_TYPE WS2811
#define COLOR_ORDER RGB
#endif

#ifndef NUM_LEDS
#define NUM_LEDS 100 // physical chain length (89 bricks + spares)
#endif
#define SERPENTINE true // rows zigzag; flip if wired parallel
#ifndef FLIP_Y
#define FLIP_Y 0 // 1 if the chain's first row is the BOTTOM of the grid
#endif
#define BRIGHTNESS 48
#define MAX_MILLIAMPS 8000 // FastLED's estimate assumes 5V; still a sane cap

#define REF_URL "https://api.github.com/repos/scottholdren/kenled/git/ref/heads/wall"
#define RAW_BASE "https://raw.githubusercontent.com/scottholdren/kenled/"
#ifndef POLL_INTERVAL_MS
#define POLL_INTERVAL_MS 60000UL
#endif
#define CACHE_PATH "/current.json"
#define INCOMING_PATH "/incoming.json"

// ---- Update mode (compile-time), same semantics as kenled-mirror ----
//   0 MODE_POLL / 1 MODE_BOOT_FETCH (production: power-cycle to update) / 2 MODE_OFFLINE
#define MODE_POLL 0
#define MODE_BOOT_FETCH 1
#define MODE_OFFLINE 2
#ifndef UPDATE_MODE
#define UPDATE_MODE MODE_POLL
#endif

#define MAX_DIM 32
#define MAX_ANIM_BYTES 65536

struct Anim {
  uint16_t cols, rows, frameCount, frameMs;
  uint32_t palette[16];
  uint8_t* cells;
};

CRGB leds[NUM_LEDS];
#if UPDATE_MODE != MODE_OFFLINE
WiFiMulti wifiMulti; // connects to whichever configured network is present
#endif
Anim* current = nullptr;
Anim* pending = nullptr;
SemaphoreHandle_t pendingMux;
volatile uint32_t lastFetchOkAt = 0;

void freeAnim(Anim* a) {
  if (a == nullptr) return;
  free(a->cells);
  free(a);
}

// Designer grid is row-major, origin top-left. Maps grid position -> chain index.
uint16_t ledIndex(uint8_t x, uint8_t y, uint16_t cols, uint16_t rows) {
  if (FLIP_Y) y = rows - 1 - y;
  if (SERPENTINE && (y & 1)) return (uint16_t)y * cols + (cols - 1 - x);
  return (uint16_t)y * cols + x;
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

#if UPDATE_MODE != MODE_OFFLINE
// Streams to flash and frees TLS BEFORE parsing (heap headroom).
void fetchAnimation(const String& sha) {
  bool downloaded = false;
  {
    WiFiClientSecure client;
    client.setInsecure();
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
  }
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
      wifiMulti.run(10000); // tries all configured networks, best signal first
    }
    if (WiFi.status() == WL_CONNECTED) {
      WiFiClientSecure client;
      client.setInsecure();
      HTTPClient http;
      http.begin(client, REF_URL);
      http.setUserAgent("kenled-wall");
#ifdef GH_TOKEN
      http.addHeader("Authorization", "Bearer " GH_TOKEN);
#endif
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
      WiFi.disconnect(true);
      WiFi.mode(WIFI_OFF);
      Serial.println("[poll] boot fetch complete, wifi off");
      vTaskDelete(nullptr);
    }
    vTaskDelay(pdMS_TO_TICKS(15000));
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

  FastLED.addLeds<LED_TYPE, DATA_PIN, COLOR_ORDER>(leds, NUM_LEDS);
  FastLED.setBrightness(BRIGHTNESS);
  FastLED.setMaxPowerInVoltsAndMilliamps(5, MAX_MILLIAMPS);
  FastLED.clear(true);

  pendingMux = xSemaphoreCreateMutex();

  Anim* boot = nullptr;
  if (LittleFS.begin(true)) {
    boot = parseAnimFile(CACHE_PATH);
    if (boot != nullptr) Serial.println("[boot] playing cached animation");
  }
  if (boot == nullptr) {
    boot = builtinAnim();
    Serial.println("[boot] playing compiled-in animation");
  }
  current = boot;

#if UPDATE_MODE != MODE_OFFLINE
  WiFi.mode(WIFI_STA);
  wifiMulti.addAP(WIFI_SSID, WIFI_PASS);
#ifdef WIFI_SSID2
  wifiMulti.addAP(WIFI_SSID2, WIFI_PASS2);
#endif
  xTaskCreate(pollTask, "poll", 8192, nullptr, 1, nullptr);
#endif
}

void showFrame(uint16_t fi) {
  const uint8_t* frame = current->cells + (size_t)fi * current->cols * current->rows;
  FastLED.clear();
  for (uint8_t y = 0; y < current->rows; y++) {
    for (uint8_t x = 0; x < current->cols; x++) {
      uint16_t idx = ledIndex(x, y, current->cols, current->rows);
      if (idx < NUM_LEDS) leds[idx] = CRGB(current->palette[frame[y * current->cols + x]]);
    }
  }
  FastLED.show();
}

void loop() {
  static uint16_t f = 0;
  static uint32_t nextAt = 0;

  if (pending != nullptr) {
    xSemaphoreTake(pendingMux, portMAX_DELAY);
    Anim* a = pending;
    pending = nullptr;
    xSemaphoreGive(pendingMux);
    freeAnim(current);
    current = a;
    f = 0;
    nextAt = 0;
  }

  uint32_t now = millis();
  if (now < nextAt) return;
  nextAt = (now > nextAt + current->frameMs) ? now + current->frameMs : nextAt + current->frameMs;
  showFrame(f);
  f = (f + 1) % current->frameCount;
}
