# KenLED — Addressable LED Matrix Art Installation

An art installation of ~100 addressable RGB LEDs arranged in a configurable grid
(8×8, 8×10, 8×9, etc.), driven by a microcontroller, with animations authored in a
web app published on GitHub Pages.

Two deliverables:

1. **Designer app** (this repo, published via GitHub Pages) — configure the grid,
   pick a 16-color palette, paint frames, preview the animation, export/publish it.
2. **Player firmware + hardware** — a microcontroller wired to the physical LED
   matrix that plays the published animation in meatspace.

---

## Part 1 — The Designer Web App

### Tech stack

- **Vite + React + TypeScript.** Pure static site — no backend, no accounts.
  GitHub Pages can host it directly.
- **Deploy:** GitHub Actions workflow builds on push to `main` and deploys to
  GitHub Pages (`actions/deploy-pages`). URL: `https://<user>.github.io/kenled/`.
- **Persistence:** `localStorage` autosave, plus explicit JSON file export/import
  so designs can be shared and versioned.

### Features (build in this order)

**Milestone 1 — Grid setup & single-frame painting**
- New-project screen: choose columns × rows (e.g. 8×8 … 8×13; free-form within
  a sane cap like 32×32, with a live LED-count readout since the physical build
  is ~100 LEDs).
- 16-color palette, pre-seeded with a good default set + black/off. Each swatch
  is editable via a color picker (palette is per-project, saved with the design).
- Paint tools: click to set a cell, click-drag to paint, right-click (or
  eraser tool) to clear, fill tool, clear-frame button.

**Milestone 2 — Frames & animation**
- Frame strip along the bottom: add, duplicate, delete, reorder frames;
  thumbnails of each frame.
- Onion-skin toggle (ghost of previous frame) — cheap to build, huge for animators.
- Frame duration: global FPS control (and optionally per-frame duration later).

**Milestone 3 — Preview & persistence**
- Preview mode: plays all frames in a loop at the chosen speed, rendered as
  glowing "LED" dots on black to approximate the real thing.
- Autosave to localStorage; project manager (multiple named designs).
- Export / import `.json` design files.

**Milestone 4 — Publish & hardware export**
- **Export as Arduino header (`animation.h`)** — palette + frame data as
  `PROGMEM` arrays for the compile-and-upload workflow.
- **Publish as JSON at a known URL** — the app writes `animation.json` into the
  repo (via a "download, commit, push" flow or the GitHub API), so the ESP32 can
  fetch it over Wi-Fi. Simplest v1: designer downloads `animation.json` and
  commits it to the repo; Pages serves it; the ESP32 polls it.

### Animation data format

One JSON document, shared by the app, the export, and the firmware:

```json
{
  "version": 1,
  "name": "my-animation",
  "cols": 8,
  "rows": 10,
  "frameDurationMs": 125,
  "palette": ["#000000", "#ff0000", "... 16 hex colors total"],
  "frames": [
    [0, 1, 3, 0, "... cols*rows palette indices, row-major, top-left origin"]
  ]
}
```

Palette-indexed frames keep files tiny (100 LEDs × 4 bits × N frames) and make
the 16-color constraint structural, not just a UI convention.

---

## Part 2 — Hardware Shopping List

Target: ~100 LEDs, indoor installation.

| Item | Spec | Est. cost |
|---|---|---|
| LED matrix | WS2812B — either a pre-built 8×8 panel ×2 (buy panels matching the chosen grid) or a 5 V WS2812B strip (30/60 LEDs per meter) cut and mounted into a custom grid | $15–40 |
| Controller | ✔ **On hand: ESP32-S3-DevKitC-1-N16R8 (×3, AITRIP)** — Wi-Fi + BLE, 16 MB flash, 8 MB PSRAM | $0 |
| Power supply | **5 V, 10 A** (100 LEDs × 60 mA max = 6 A worst case; headroom is cheap) | $15–25 |
| Level shifter | 74AHCT125 — shifts the ESP32's 3.3 V data signal to a solid 5 V | $2 |
| Capacitor | 1000 µF, ≥6.3 V electrolytic across the power rails at the strip | $1 |
| Resistor | 300–500 Ω on the data line, close to the first LED | $1 |
| Wiring & connectors | 18 AWG for power, JST-SM 3-pin connectors, barrel jack or screw terminal for the PSU | $10 |
| Diffusion & mounting | Frame/panel to mount the grid, plus a diffuser (frosted acrylic, foam-core grid + vellum) — this is what makes it look like art instead of bare LEDs | varies |

Wiring notes for the build:
- Inject power at both ends of the chain (or every ~50 LEDs) to avoid voltage
  droop / color shift at the far end.
- **Never** power 100 LEDs through the microcontroller's USB — LEDs get PSU
  power directly; controller and strip share ground.
- Strips are usually wired in a **serpentine** (zigzag) pattern; the firmware
  maps (x, y) → LED index so the app never has to care.

---

## Part 3 — Player Firmware

Target hardware (on hand): **ESP32-S3-DevKitC-1-N16R8** ×3.

- Arduino IDE: install the `esp32` boards package (Espressif), select board
  **"ESP32S3 Dev Module"**. 16 MB flash / 8 MB (octal) PSRAM.
- 3.3 V logic — keep the 74AHCT125 level shifter on the WS2812B data line.
- Data pin: use a plain GPIO (e.g. GPIO 4). Avoid strapping pins (0, 3, 45, 46)
  and USB pins (19, 20).
- The DevKitC-1 has an **onboard WS2812 RGB LED on GPIO 48** — the full
  firmware (including Wi-Fi fetch/parse) can be developed and tested against
  that single pixel before the matrix hardware arrives.
- 16 MB flash leaves room for a LittleFS partition to cache many animations.

- **Arduino IDE + FastLED** (or Adafruit NeoPixel) targeting the ESP32-S3.
- Responsibilities:
  - Serpentine coordinate mapping `(x, y) → led index`, matching the physical wiring.
  - Global brightness cap and FastLED power limiting (`setMaxPowerInVoltsAndMilliamps`)
    as a safety net for the PSU.
  - **Mode A (v1):** play an animation compiled in from the exported `animation.h`.
  - **Mode B (v2):** connect to Wi-Fi, poll `https://<user>.github.io/kenled/animation.json`
    every few minutes, parse (ArduinoJson), store the latest animation in flash,
    play it — and keep playing the cached one if the network drops.

---

## Part 4 — Build Order

1. **Repo & deploy skeleton** — Vite + React + TS scaffold, GitHub repo,
   Pages workflow deploying a hello-world page. Proves the publishing pipeline first.
2. **Milestones 1–3 of the app** — grid setup → painting → frames → preview →
   save/load. The designer can fully author animations before any hardware exists.
3. **Order hardware** (can overlap with step 2 — shipping takes time).
4. **Milestone 4 exports** + firmware Mode A — light up the real matrix from an
   exported header file.
5. **Firmware Mode B** — Wi-Fi fetch, closing the loop: design in browser,
   see it on the wall.
6. **Physical install** — mounting, diffusion, power routing, final placement.

## Open decisions

- **Panels vs. strip-built matrix:** pre-built 8×8 panels are plug-and-play but
  fix the grid pitch; hand-built from strips lets you match the art's dimensions.
- **Exact grid dimensions** — decide before ordering (drives panel vs. strip choice).
- ~~ESP32 vs. plain Arduino~~ — **resolved**: ESP32-S3-DevKitC-1-N16R8 boards on hand.
- **How "publish" works in v1** — manual commit of `animation.json` vs. GitHub
  API integration from the app.
