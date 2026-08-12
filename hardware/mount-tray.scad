// KenLED controller mounting tray — ESP32-S3-DevKitC-1 + DROK USB buck.
// Prints flat, no supports. Screws or VHB-tapes into the junction box.
//
// MEASURE YOUR BOARDS and adjust the parameters below before printing —
// clone boards vary a millimeter or two. Rail fit should be snug, not forced.

// ---- parameters (mm) ----
s3_len = 70;      // DevKitC-1 board length (measure yours)
s3_wid = 26;      // board width
pcb_t = 1.8;      // rail groove height (1.6mm PCB + slip)
rail_lip = 2;     // how far the rail lips overhang the board edge

drok_len = 64;    // DROK buck length (measure)
drok_wid = 27;    // DROK width
drok_wall = 8;    // cradle end-wall height

base_t = 3;       // baseplate thickness
gap = 12;         // spacing between the two bays
margin = 6;

tray_len = max(s3_len, drok_len) + 2 * margin;
tray_wid = s3_wid + drok_wid + gap + 2 * margin + 12;

// ---- baseplate with corner screw holes + zip-tie slots ----
difference() {
  cube([tray_len, tray_wid, base_t]);
  for (x = [5, tray_len - 5], y = [5, tray_wid - 5])
    translate([x, y, -1]) cylinder(h = base_t + 2, d = 3.5, $fn = 24); // M3 screws
  // zip-tie slots flanking each bay for cable dressing / backup retention
  for (y = [margin + s3_wid + 2, margin + s3_wid + gap + drok_wid + 2])
    for (x = [tray_len * 0.3, tray_len * 0.7])
      translate([x, y, -1]) cube([8, 3, base_t + 2]);
}

// ---- bay 1: S3 edge rails (board slides in from the end, USB ends open) ----
// Each rail is an L-profile: groove at PCB height, lip overhanging the board edge.
// outer rail — lip faces +y (toward the board)
translate([margin, margin - 4, base_t]) difference() {
  cube([s3_len, 4, pcb_t + 2.4]);
  translate([-1, 4 - rail_lip, 1.2]) cube([s3_len + 2, rail_lip + 1, pcb_t]);
}
// inner rail — lip faces -y (toward the board)
translate([margin, margin + s3_wid, base_t]) difference() {
  cube([s3_len, 4, pcb_t + 2.4]);
  translate([-1, -1, 1.2]) cube([s3_len + 2, rail_lip + 1, pcb_t]);
}

// end stop so the board can't slide out once the box lid is on
translate([margin + s3_len - 0.01, margin - 4, base_t]) cube([2, s3_wid + 8, 4]);

// ---- bay 2: DROK cradle — end walls + the zip-tie slots hold it down ----
drok_y = margin + s3_wid + gap;
for (x = [margin - 2, margin + drok_len])
  translate([x, drok_y, base_t]) cube([2, drok_wid, drok_wall]);
for (y = [drok_y - 2, drok_y + drok_wid])
  translate([margin, y, base_t]) cube([drok_len, 2, 3]); // low side curbs
