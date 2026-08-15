# KenLED Firmware

One firmware: **`kenled-wall/`** — the ESP32-S3-DevKitC-1 controller that
drives the WS2811 bullet-pixel chain and pulls the published wall animation
from GitHub. Playback never depends on the network: boot order is LittleFS
cache, then the compiled-in `animation.h` fallback.

(A LilyGo T-Dongle-C5 "pocket mirror" firmware previously lived here; it was
removed when the project settled on the S3. It's recoverable from git history
if ever wanted — along with its hard-won ST7735/APA102 quirk handling.)

## Build

- Board: **ESP32S3 Dev Module**, FQBN options
  `CDCOnBoot=cdc,FlashSize=16M,PartitionScheme=huge_app,PSRAM=opi`
  (**PSRAM=opi is required** — without it, large animations fail to parse).
- Libraries: **FastLED**, **ArduinoJson**.
- Wi-Fi credentials: copy `kenled-wall/wifi_secrets.h.example` to
  `wifi_secrets.h` (gitignored — the repo is public). Optionally add a
  zero-permission GitHub PAT as `GH_TOKEN` to raise the poll rate limit from
  60/hr (shared per IP) to 5000/hr.

```sh
arduino-cli compile --fqbn "esp32:esp32:esp32s3:CDCOnBoot=cdc,FlashSize=16M,PartitionScheme=huge_app,PSRAM=opi" \
  --build-property "compiler.cpp.extra_flags=-DBENCH_ONBOARD=0 -DUPDATE_MODE=0 -DPOLL_INTERVAL_MS=10000UL -DFLIP_Y=1" \
  firmware/kenled-wall
```

## Compile-time configuration

| Flag | Values | Meaning |
|---|---|---|
| `BENCH_ONBOARD` | `1` (default) / `0` | 1 = drive the DevKitC-1's onboard pixel (GPIO 48) for bench tests; 0 = the real WS2811/RGB chain on GPIO 4 |
| `UPDATE_MODE` | `0` poll / `1` boot-fetch / `2` offline | 0 = check GitHub every `POLL_INTERVAL_MS` (dev). **1 = production: fetch once at boot, then Wi-Fi off — power-cycle the wall to update it.** 2 = no Wi-Fi compiled in at all |
| `POLL_INTERVAL_MS` | ms | Poll cadence in mode 0 (default 60000; bench uses 10000) |
| `NUM_LEDS` | int | Physical chain length (default 100) |
| `FLIP_Y` | `0` / `1` | 1 if the chain's first row is the BOTTOM of the grid |
| `SERPENTINE` | in-file | Rows zigzag (default true) |
| `BRIGHTNESS`, `MAX_MILLIAMPS` | in-file | Global brightness cap and FastLED power limiter |

## Wiring

- Pixel 12 V and GND come **directly from the 12 V PSU**, never from the board.
- Board powers from USB or a 12V→5V buck; all grounds common.
- Data: GPIO 4 → (74AHCT125 level shifter if needed) → 330 Ω → first pixel DIN.
- Chain starts top-left... or bottom-left with `FLIP_Y=1`; rows serpentine.

## Changing the animation

Publish from the designer app (⇪ Publish). In poll mode the wall updates
within the poll interval; in boot-fetch mode, power-cycle the wall.
