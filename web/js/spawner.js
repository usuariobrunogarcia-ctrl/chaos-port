/*
 * spawner.js - object placement (bank 28 $70000) and the activity window.
 *
 * Object layout records (9 bytes): type, x.w, y.w (both +256), flags, param,
 * p2, p3.  $D400+i holds the spawn state of record i.
 */
(function (G) {
  'use strict';
  const SC = G.SC;
  const { rb, wb, rw, ww, yb, ys, def } = SC;
  const R = SC.R;

  // Activity of a position relative to the camera:
  //   0 on screen, 1 just outside, 2 outer margin (inactive), 3 delete.
  // For a 256x192 view this is identical to the 32x32 table at bank 28 $8146.
  function axis(d, size) {
    if (d < -96) return 3;
    if (d < -32) return 2;
    if (d < 0) return 1;
    if (d < size) return 0;
    if (d < size + 32) return 1;
    if (d < size + 96) return 2;
    return 3;
  }
  SC.activity = function (x, y) {
    SC.page2(0x1C);
    const dx = SC.s16((x - rw(0xD174)) & 0xFFFF);
    const dy = SC.s16((y - rw(0xD176)) & 0xFFFF);
    const vx = axis(dx, SC.VIEW_W), vy = axis(dy, SC.VIEW_H + 64);
    return vx > vy ? vx : vy;
  };

  // $8000 (bank 28), called every 4th frame
  function f_8000() {
    const lv = rb(0xD297), act = rb(0xD298);
    let p = rw(0x8546 + lv * 2);
    p = rw(p + act * 2);
    let bc = 0xD400;
    while (rb(p) !== 0xFF) {
      if (rb(bc) === 0) trySpawn(p, bc);
      bc++;
      p += 9;
    }
    wb(0xD440, 0x01);
  }
  function trySpawn(p, bc) {
    // scratch value left by the original's x window test
    const hx = rw(p + 1) - ((rw(0xD174) + 0x80) & 0xFFFF);
    if (hx < 0) return;
    if (SC.VIEW_W === 256 && (hx >> 1) > 0xFF) return;
    wb(0xD100, (hx >> 1) & 0xFF);
    const x = (rw(p + 1) - 256) & 0xFFFF;
    const y = (rw(p + 3) - 256) & 0xFFFF;
    const a = SC.activity(x, y);
    if (a >= 3) return;
    if (a !== 2 && rb(0xD440) !== 0) return;
    const type = rb(p);
    if (((type + 2) & 0xFF) === 0) {
      // $FE records: level events, not used in Turquoise Hill
      wb(bc, 0xFF);
      return;
    }
    if (SC.call(0x5EE1)) return;         // no free slot
    const iy = R.iy;
    wb(iy, type);
    wb(bc, type);
    wb(iy + 58, rb(p + 1)); wb(iy + 17, rb(p + 1));
    wb(iy + 59, rb(p + 2) - 1); wb(iy + 18, rb(p + 2) - 1);
    wb(iy + 60, rb(p + 3)); wb(iy + 20, rb(p + 3));
    wb(iy + 61, rb(p + 4) - 1); wb(iy + 21, rb(p + 4) - 1);
    wb(iy + 4, rb(p + 5) | 0x40);
    wb(iy + 63, rb(p + 6));
    wb(iy + 8, rb(p + 7));
    wb(iy + 9, rb(p + 8));
    wb(iy + 62, ((bc - 0xD400) + 1) & 0xFF);
  }
  SC.def(0x8000, f_8000, 0x1C);
})(typeof window !== 'undefined' ? window : globalThis);
