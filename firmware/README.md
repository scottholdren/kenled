# KenLED Firmware

Flash-once player for the show: loops the animation compiled in from
`kenled/animation.h` forever. No Wi-Fi, no runtime updates.

## One-time Arduino IDE setup

1. Install the **Arduino IDE** (2.x).
2. **Boards**: File → Preferences → Additional boards manager URLs, add
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`,
   then Boards Manager → install **esp32** (Espressif Systems).
3. **Library**: Library Manager → install **FastLED**.

## Flashing

1. In the designer app (https://scottholdren.github.io/kenled/), open your
   animation and click **⇓ animation.h**.
2. Replace `kenled/animation.h` with the downloaded file.
3. Open `kenled/kenled.ino` in the Arduino IDE.
4. Board: **ESP32S3 Dev Module**. Port: the board's USB port (use the
   connector labeled **UART**; if you use the USB-OTG port, enable
   Tools → USB CDC On Boot).
5. Upload. The animation starts immediately and loops forever.

## Wiring config (top of kenled.ino)

| Define | Meaning |
|---|---|
| `DATA_PIN` | GPIO for the WS2812B data line (default 4). Set to **48** to bench-test on the DevKitC-1's onboard pixel — it shows the animation's top-left LED. |
| `SERPENTINE` | `true` if rows zigzag (usual strip-built matrix), `false` if all rows run the same direction. |
| `BRIGHTNESS` | Global cap 0–255. Start low (96); diffused walls rarely need more. |
| `MAX_MILLIAMPS` | FastLED power limiter. Keep below the PSU rating (8000 for a 10 A supply). |

## Wiring the matrix

- LED 5 V and GND come **directly from the 5 V PSU**, never from the board's USB.
- Board GND must connect to PSU/strip GND (shared ground).
- Data: `DATA_PIN` → 74AHCT125 level shifter → 300–500 Ω resistor → first LED's DIN.
- 1000 µF capacitor across 5 V/GND at the strip's power input.
- Inject power at both ends of the chain to avoid color droop at the far end.
- The chain starts at the grid's **top-left**, first row running left-to-right
  (that's what the coordinate mapping assumes; flip `SERPENTINE` to match how
  the rows actually zigzag).
