/*
 * bank12.js - routines called from the animation scripts in bank 12 ($30000).
 * Sonic's speed dependent animation, loop/tube helpers and object logic of
 * types $01-$25.  All addresses are in slot 2 with bank 12 paged in.
 */
(function (G) {
  'use strict';
  const SC = G.SC;
  const { rb, wb, rw, ww, xb, xs, xw, xsw, xbit, xset, xres, bset, bres } = SC;
  const R = SC.R;
  const call = SC.call;
  const B = 0x0C;
  const def = (a, f) => SC.def(a, f, B);

  function absHiVX() { let a = rb(0xD517); if (a & 0x80) a = (-a) & 0xFF; return a; }

  // $8EE1: walking animation (frame rate depends on speed)
  def(0x8EE1, function () {
    if (xb(35) & 0x0C) { xs(6, 0x5E); xs(7, 0x02); return; }   // pushing a wall
    let c = 0x01, b = 0x06;
    if (xbit(36, 0)) {
      if ((rb(0xD36C) & 0x1F) === 0x19) { c = 0x3C; b = 0x04; }
      else { xres(36, 0); wb(0xD3BC, 0); }
    }
    let a = (rb(0xD52F) + 1) & 0xFF;
    wb(0xD52F, a);
    if (a >= b) { a = 0; wb(0xD52F, 0); }
    xs(6, (a + c) & 0xFF);
    xs(7, rb(0x8F2C + absHiVX()));
  });
  // $8F45: running animation
  def(0x8F45, function () {
    let c = 0x07;
    if (xbit(36, 0)) {
      if ((rb(0xD36C) & 0x1F) === 0x19) c = 0x3C;
      else { xres(36, 0); wb(0xD3BC, 0); }
    }
    let a = (rb(0xD52F) + 1) & 0xFF;
    wb(0xD52F, a);
    if (a >= 4) { a = 0; wb(0xD52F, 0); }
    xs(6, (a + c) & 0xFF);
    xs(7, 0x04);
  });
  // $8F76: rolling/jumping ball animation
  function f_8F76() {
    let a = (rb(0xD52F) + 1) & 0xFF;
    wb(0xD52F, a);
    if (a >= 0x14) { a = 0; wb(0xD52F, 0); }
    const tbl = xb(0) === 1 ? 0x8FB8 : 0x8FCC;
    xs(6, rb(tbl + a));
    if (xbit(34, 1)) {
      xres(4, 4);
      let v = rb(0xD517);
      if (v & 0x80) { v = (-v) & 0xFF; xset(4, 4); }
      xs(7, rb(0x8FE0 + v));
      return;
    }
    const j = rb(0xD137);
    if (j & 0x08) xres(4, 4);
    else if (j & 0x04) xset(4, 4);
    xs(7, 0x03);
  }
  def(0x8F76, f_8F76);
  function frameFromTable(idx) {
    let hl = (idx * 2) & 0xFFFF;
    hl = (hl + (xb(0) === 1 ? 0x906C : 0x90D2)) & 0xFFFF;
    if (rb(hl) === xb(6)) hl++;
    xs(6, rb(hl));
    xs(7, 0x06);
  }
  // $900B: frame from vertical distance to the loop entry
  def(0x900B, function () {
    const l = (((rw(0xD53C) - rw(0xD514)) & 0xFF) >> 4);
    frameFromTable(l);
  });
  // $903D: frame from the position along a loop path
  def(0x903D, function () {
    if (xbit(3, 1)) return f_8F76();
    const q = call(0x2605, rw(0xD39E), 0x0D) & 0xFF;
    frameFromTable(q);
  });
  // $80D9: carry unless standing on a special spot of Aqua Planet
  def(0x80D9, function () {
    if (rb(0xD297) !== 4 || rb(0xD298) !== 0) return true;
    if (rb(0xD514) !== 0x2E || rb(0xD515) !== 1) return true;
    if (((rb(0xD511) + 8) & 0xF8) !== 0xF0) return true;
    if (rb(0xD512) !== 6) return true;
    return false;
  });
  def(0x818F, function () { return (rb(0xD448) & 1) !== 0; });
  def(0x807C, function () {});
})(typeof window !== 'undefined' ? window : globalThis);
