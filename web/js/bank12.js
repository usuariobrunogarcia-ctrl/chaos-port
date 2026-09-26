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
  // $94C1: running around a vertical loop (state $22).  Per loop block a small
  // handler sets the direction of motion (ix+10) and snaps Sonic to the track.
  function snapY(off) { xsw(20, (((xw(20) + off) & 0xFFE0) + 0x2E) & 0xFFFF); }
  const f_97B8 = () => snapY(0xFFE0);
  const f_979F = () => snapY(0xFFF0);
  const LOOP_H = {
    0x95F1: () => { xs(10, 0x40); f_97B8(); }, 0x95F4: () => { xs(10, 0x40); f_97B8(); },
    0x95FC: () => xs(10, 0x28), 0x9604: () => xs(10, 0x28), 0x960C: () => xs(10, 0x40),
    0x9611: () => xs(10, 0x58), 0x9619: () => xs(10, 0x58),
    0x9621: () => { xs(10, 0x40); f_97B8(); }, 0x9629: () => { xs(10, 0x40); f_97B8(); },
    0x9631: () => { xs(10, 0xC0); f_979F(); }, 0x9634: () => { xs(10, 0xC0); f_979F(); },
    0x963C: () => { xs(10, 0xC0); f_97B8(); }, 0x9644: () => xs(10, 0xA8),
    0x964C: () => { xs(10, 0xC0); f_97B8(); }, 0x9654: () => xs(10, 0xA8), 0x965D: () => xs(10, 0xC0),
    0x9662: () => xs(10, 0xD8), 0x966A: () => xs(10, 0xD8),
    0x9672: () => { xs(10, 0xC0); f_979F(); }, 0x967A: () => { xs(10, 0xC0); f_97B8(); },
  };
  def(0x94C1, function () {
    call(0x48BC);
    call(0x691A);
    if ((rb(0xD364) & 0x3F) !== 0x17) { xs(10, 0); xs(11, 0); xs(2, 0x09); return; }
    const tbl = rw(0x94F5 + (xb(56) & 3) * 2);
    const h = rw(tbl + (((rb(0xD353) - 0x58) * 2) & 0xFF));
    const f = LOOP_H[h];
    if (!f) throw new Error('loop handler ' + h.toString(16));
    f();
    call(0x6089);
    call(0x60FB);
  });
  // $8313: super peel out start - brief invulnerability
  def(0x8313, function () { xset(3, 7); wb(0xD3B1, 0x0C); });
  // $83A6: after the goal, Sonic runs off the right edge of the screen, then the act ends
  def(0x83A6, function () {
    xres(4, 7);
    xsw(24, 0);
    xres(4, 4);
    const de = (xw(17) - rw(0xD174)) & 0xFFFF;
    const edge = SC.VIEW_W === 256 ? 0xF8 : SC.VIEW_W - 8;
    if (de > edge) {
      call(0x59B9);
      const out = SC.VIEW_W === 256 ? 0x120 : SC.VIEW_W + 32;
      if (de > out) {
        xsw(22, 0);
        bset(0xD293, rb(0xD298) >= 2 ? 4 : 5);
        return;
      }
    }
    let hl = rw(0xD516);
    if (hl & 0x8000) { hl = 0; ww(0xD516, 0); }
    if ((hl >> 8) < 6) xsw(22, (hl + 0x10) & 0xFFFF);
    return call(0x60FB);
  });
})(typeof window !== 'undefined' ? window : globalThis);
