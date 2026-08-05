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
- Loss-prevention: `navigator.storage.persist()` to resist browser eviction,
  plus **share links** — the whole design deflate-compressed into the URL
  fragment. A link is a device-independent save/backup and the way animators
  send designs around; opening one imports it as a new local project.

**Milestone 4 — Hardware export**
- **Export as Arduino header (`animation.h`)** — palette + frame data as C
  arrays. The designer exports the header, drops it into the firmware sketch,
  and flashes once. (Scope decision: this is a flash-once, one-show
  installation — no Wi-Fi update loop needed.)

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

Target: **89 glass bricks, one LED per brick** (~20 cm centers), indoor
installation. Grid modeled as 8×10 or 8×11 in the app.

| Item | Spec | Est. cost |
|---|---|---|
| LEDs | **WS2811 12 V 12 mm bullet pixels, 2× 50-count strings, 20 cm wire spacing** (spacing must reach brick centers — don't buy the default 10 cm). 89 used + 11 spares. Press-fit a 12 mm drilled hole, or silicone to the back of each block. | $40–50 |
| Controller | ✔ **On hand: ESP32-S3-DevKitC-1-N16R8 (×3, AITRIP)** — Wi-Fi + BLE, 16 MB flash, 8 MB PSRAM | $0 |
| Power supply | **12 V, 10 A** (89 px × ~60 mA ≈ 5.4 A worst case; headroom is cheap) | $20–30 |
| Buck converter | 12 V → 5 V, ≥1 A, to power the ESP32 from the same PSU | $3–5 |
| Level shifter | 74AHCT125 — shifts the ESP32's 3.3 V data signal to a solid 5 V | $2 |
| Capacitor | 1000 µF electrolytic (≥16 V) across the power rails at the chain start | $1 |
| Resistor | 300–500 Ω on the data line at the first pixel (many pixel strings have one built in) | $1 |
| Wiring & connectors | 18 AWG for power runs, JST-SM 3-pin pigtails, screw terminal for the PSU | $10 |

Wiring notes for the build:
- ~18–20 m total chain length. 12 V keeps droop manageable — inject power at
  the chain start and once mid-chain.
- **Never** power the pixels through the microcontroller's USB — pixels get PSU
  power directly; controller and pixels share ground.
- Route the chain through the bricks in a **serpentine** (zigzag) matching the
  grid; the firmware maps (x, y) → chain index so the app never has to care.
- Mounting decision (drill 12 mm holes vs. back-mount with silicone): test one
  brick with a back-mounted pixel in the dark before committing to 89 holes.
- If the physical brick layout is not a clean rectangle, add a skip-mask to the
  export + firmware (planned only if needed).

---

## Part 3 — Player Firmware

Target hardware (on hand): **ESP32-S3-DevKitC-1-N16R8** ×3.

- Arduino IDE: install the `esp32` boards package (Espressif), select board
  **"ESP32S3 Dev Module"**. 16 MB flash / 8 MB (octal) PSRAM.
- 3.3 V logic — keep the 74AHCT125 level shifter on the pixel data line.
- Bullet pixels are **WS2811, usually RGB order** (vs. the strip's
  WS2812B/GRB): set `FastLED.addLeds<WS2811, DATA_PIN, RGB>` — confirm color
  order with the first lit pixel.
- Data pin: use a plain GPIO (e.g. GPIO 4). Avoid strapping pins (0, 3, 45, 46)
  and USB pins (19, 20).
- The DevKitC-1 has an **onboard WS2812 RGB LED on GPIO 48** — the firmware
  can be bench-tested against that single pixel before the matrix arrives.

- **Arduino IDE + FastLED** targeting the ESP32-S3.
- Scope: **flash once for the show.** The animation is compiled in from the
  exported `animation.h`; the sketch loops it forever. No Wi-Fi, no runtime
  updates. To change the animation: re-export the header, re-flash.
- Responsibilities:
  - Serpentine coordinate mapping `(x, y) → led index`, matching the physical wiring.
  - Global brightness cap and FastLED power limiting (`setMaxPowerInVoltsAndMilliamps`)
    as a safety net for the PSU.
  - Loop the compiled-in animation at its frame rate, all night.

---

## Part 4 — Build Order

1. **Repo & deploy skeleton** — Vite + React + TS scaffold, GitHub repo,
   Pages workflow deploying a hello-world page. Proves the publishing pipeline first.
2. **Milestones 1–3 of the app** — grid setup → painting → frames → preview →
   save/load. The designer can fully author animations before any hardware exists.
3. **Order hardware** (can overlap with step 2 — shipping takes time).
4. **Milestone 4 export + firmware** — light up the real matrix from an
   exported header file.
5. **Physical install** — mounting, diffusion, power routing, final placement.

## Open decisions

- **Panels vs. strip-built matrix:** pre-built 8×8 panels are plug-and-play but
  fix the grid pitch; hand-built from strips lets you match the art's dimensions.
- **Exact grid dimensions** — decide before ordering (drives panel vs. strip choice).
- ~~ESP32 vs. plain Arduino~~ — **resolved**: ESP32-S3-DevKitC-1-N16R8 boards on hand.
- ~~How "publish" works~~ — **resolved**: flash-once for the show; the animation
  ships compiled into the firmware via `animation.h`. No runtime updates.
