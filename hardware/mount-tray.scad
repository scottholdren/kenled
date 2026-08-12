// KenLED controller mounting tray — ESP32-S3-DevKitC-1 + DROK USB buck.
// Prints flat, no supports. Screws or VHB-tapes into the junction box.
// v3: both bays centered; corner screw holes have clear webbing all around.

// ---- parameters (mm) ----
s3_len = 62;      // DevKitC-1 board length (measured)
s3_wid = 28;      // board width (measured)
pcb_t = 1.8;      // rail groove height (1.6mm PCB + slip)
rail_lip = 0.4;   // lip overhang — tiny, clears the header pins

drok_len = 63;    // DROK buck length (measured)
drok_wid = 27;    // DROK width (measured)
drok_wall = 8;    // cradle side-wall height

base_t = 3;       // baseplate thickness
gap = 12;         // spacing between the two bays
edge = 14;        // clear border around the bays (screw holes live here)
hole_inset = 7;   // screw hole distance from tray corners

// ---- derived layout (everything centered) ----
tray_len = max(s3_len, drok_len) + 2 * edge;
content_h = (s3_wid + 8) + gap + (drok_wid + 4); // s3 bay + gap + drok bay
tray_wid = content_h + 2 * edge;

s3_x = (tray_len - s3_len) / 2;
s3_y = edge + 4;                       // s3 board's lower edge
drok_x = (tray_len - drok_len) / 2;
drok_y = edge + 8 + s3_wid + gap + 2;  // drok module's lower edge

// ---- baseplate with corner screw holes + drok zip-tie slots ----
difference() {
  cube([tray_len, tray_wid, base_t]);
  for (x = [hole_inset, tray_len - hole_inset], y = [hole_inset, tray_wid - hole_inset])
    translate([x, y, -1]) cylinder(h = base_t + 2, d = 3.5, $fn = 24); // M3
  // zip-tie slot pairs flanking the DROK bay
  for (x = [drok_x + drok_len * 0.25, drok_x + drok_len * 0.75 - 8])
    for (y = [drok_y - 6, drok_y + drok_wid + 3])
      translate([x, y, -1]) cube([8, 3, base_t + 2]);
}

// ---- bay 1: S3 edge rails (ends open — USB reachable; slide in from an end) ----
// outer rail, lip faces +y (toward the board)
translate([s3_x, s3_y - 4, base_t]) difference() {
  cube([s3_len, 4, pcb_t + 2.4]);
  translate([-1, 4 - rail_lip, 1.2]) cube([s3_len + 2, rail_lip + 1, pcb_t]);
}
// inner rail, lip faces -y
translate([s3_x, s3_y + s3_wid, base_t]) difference() {
  cube([s3_len, 4, pcb_t + 2.4]);
  translate([-1, -1, 1.2]) cube([s3_len + 2, rail_lip + 1, pcb_t]);
}
// end stop (one end only, so the board can still slide in; the box wall
// or lid backs up the open end)
translate([s3_x + s3_len, s3_y - 4, base_t]) cube([2, s3_wid + 8, 4]);

// ---- bay 2: DROK cradle — side walls only, BOTH ENDS OPEN for terminals/USB ----
for (y = [drok_y - 2, drok_y + drok_wid])
  translate([drok_x, y, base_t]) cube([drok_len, 2, drok_wall]);
