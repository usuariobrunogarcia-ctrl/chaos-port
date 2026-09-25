/*
 * objects12.js - object logic in bank 12 (types $03-$25) used in Turquoise Hill.
 *   $03 ring sparkle          $04 speed shoes after-image   $05 invincibility stars
 *   $06 scattered rings       $07 block fragments           $09 ring (object)
 *   $0A score/time helper     $0F monitor sparkle           $10 monitor
 *   $11 monitor icon          $12 HUD scroller              $13 collapsing floor
 *   $18 goal signpost         $19 goal speed/score display  $1B rising spikes
 *   $21 motobug-type badnik
 */
(function (G) {
  'use strict';
  const SC = G.SC;
  const { rb, wb, rw, ww, xb, xs, xw, xsw, xbit, xset, xres, yb, ys, yw, ysw, bset, bres } = SC;
  const R = SC.R;
  const call = SC.call, callAddr = SC.callAddr;
  const neg16 = SC.neg16;
  const def = (a, f) => SC.def(a, f, 0x0C);

  // ---------------------------------------------------------------- $03 sparkle
  def(0x984A, function () {
    const x = rw(0xD35C), y = rw(0xD35E);
    xs(17, ((x & 0xF0) + 6) & 0xFF); xs(18, x >> 8);
    xs(20, y & 0xF0); xs(21, y >> 8);
    xs(2, 0x01);
    xset(4, 1);
  });
  def(0x986D, () => {});

  // ---------------------------------------------------------------- $04 speed shoes trail
  def(0x98BE, function () {
    xs(2, (xb(63) + 1) & 0xFF);
    xset(4, 0);
    call(0x5F27, 0x0004);
    if (xb(63) !== 0) return;
    let hl = 0xD379;
    for (let b = 0; b < 8; b++) {
      ww(hl, rw(0xD511)); ww(hl + 2, rw(0xD514)); hl += 4;
    }
  });
  def(0x98EC, function () {
    if (rb(0xD532) !== 0x03) { xs(0, 0xFF); return; }
    if (xb(63) === 0) {
      for (let i = 0x1C; i >= 1; i--) wb(0xD37C + i, rb(0xD378 + i));   // lddr $D394->$D398
      ww(0xD379, rw(0xD511));
      ww(0xD37B, rw(0xD514));
    }
    const p = rw(0x9939 + ((xb(63) * 2) & 0xFF));
    xs(17, rb(p)); xs(18, rb(p + 1)); xs(20, rb(p + 2)); xs(21, rb(p + 3));
  });

  // ---------------------------------------------------------------- $05 invincibility stars
  def(0x9959, function () {
    xs(6, xb(63) ? 4 : 0);
    xset(4, 0); xset(4, 1);
    let b = 1;
    if (xb(63) === 0xFF) { b = 2; ww(0xD4A0, 0x00B4); }
    xs(2, b);
    bset(0xD503, 7);
    return call(0x5F27, 0x0004);
  });
  def(0x998A, function () {
    if (rb(0xD532) === 0x06) { bset(0xD503, 7); return call(0x5F27, 0x0004); }
    xs(0, 0xFF);
    if (rb(0xD44E) !== 0) return;
    if (rb(0xD293) & 0xBF) return;
    if (rb(0xD501) === 0x20) return;
    if (rb(0xD502) === 0x11) return;
    call(0x189B);
  });
  def(0x99BB, function () {
    const s = rb(0xD501);
    let keep = false;
    if (s === 0x15) keep = true;
    else if (s === 0x1A) {
      const t = (rw(0xD4A0) - 1) & 0xFFFF;
      ww(0xD4A0, t);
      keep = t !== 0;
    }
    if (keep) {
      bset(0xD503, 7); bset(0xD503, 1);
      return call(0x5F27, 0x0004);
    }
    bres(0xD503, 7);
    xs(0, 0xFF);
  });
  def(0x99EA, function () {
    let a = (xb(6) + 1) & 0xFF;
    if (a >= 0x21) a = 0;
    xs(6, a);
    xs(7, 0x01);
  });

  // ---------------------------------------------------------------- $06 scattered rings
  def(0x9A2B, function () {
    xsw(17, rw(0xD511));
    xsw(20, (rw(0xD514) + 0xFFF0) & 0xFFFF);
    const o = (xb(63) * 2) & 0xFFFF;
    xs(22, rb(0x9A7C + o)); xs(23, rb(0x9A7D + o));
    xs(24, rb(0x9A8A + o)); xs(25, rb(0x9A8B + o));
    xsw(60, 0xFC00);
    xs(2, 0x01);
    xset(3, 7); xset(3, 6);
    xset(4, 0);
  });
  function ringCollect() {
    wb(0xDE04, 0xBF);
    call(0x3138);
    xs(2, 0x02);
  }
  def(0x9A98, function () {
    if (call(0x617E)) return ringCollect();
    return scatterMove();
  });
  def(0x9A9E, scatterMove);
  function scatterMove() {
    call(0x631A, 0x0020);
    call(0x60FB);
    if (!xbit(25, 7)) {
      if (call(0x614E) === 0) {
        // bounce: each bounce is weaker
        const hl = xw(60) + 0x0080;
        if (hl > 0xFFFF) { xs(0, 0xFF); return; }
        xsw(60, hl); xsw(24, hl);
      }
    } else if (call(0x6168) === 0) {
      xsw(24, neg16(xw(24)));
    }
    if (xbit(4, 6)) xs(0, 0xFF);
  }

  // ---------------------------------------------------------------- $07 fragments
  def(0x9B11, function () {
    let hl = (xb(63) * 8) & 0xFFFF;
    hl += (rb(0xD517) & 0x80) ? 0x9B95 : 0x9B75;
    xsw(17, (rw(hl) + rw(0xD35C)) & 0xFFFF);
    xsw(20, (rw(hl + 2) + rw(0xD35E)) & 0xFFFF);
    xs(22, rb(hl + 4)); xs(23, rb(hl + 5));
    xs(24, rb(hl + 6)); xs(25, rb(hl + 7));
    xs(2, 0x01);
    xset(4, 0);
    if (rb(0xD297) === 6 && rb(0xD298) === 2) xs(8, 0x9C);
  });
  def(0x9BB5, function () {
    if (xbit(4, 6)) return call(0x5EF8);
    call(0x5F84, 0x00C0, 0x1000);
    return call(0x60FB);
  });

  // ---------------------------------------------------------------- $09 ring object
  def(0x9C10, function () {
    xs(2, 0x01);
    if (xb(63) === 0) return;
    xs(2, 0x03);
    xset(4, 7);          // invisible ring
  });
  def(0x9C22, function () {
    if (xbit(4, 6)) return;
    if (!call(0x617E)) return;
    wb(0xDE04, 0xBF);
    call(0x3138);
    xs(2, 0x02);
    xs(62, 0x00);
  });
  def(0x9C3D, function () {
    if (rb(0xD12F) & 1) return;
    if (!call(0x617E)) return;
    wb(0xDE04, 0xBF);
    call(0x3138);
    xs(62, 0x00);
    xs(0, 0xFF);
  });
  // $0A
  def(0x9C86, function () {
    xs(2, 0x01);
    if (xb(63) !== 0) return;
    xs(2, 0x02);
    ww(0xD2A6, call(0x6276));
    return f_9C99();
  });
  function f_9C99() { xsw(17, rw(0xD511)); xsw(20, rw(0xD514)); }
  def(0x9C99, f_9C99);

  // ---------------------------------------------------------------- $0F monitor sparkle
  def(0xA057, () => call(0x60FB));
  def(0xA05B, () => xs(0, 0xFF));
  def(0xA060, function () {
    if (xb(63) === 0xFF) { xs(2, 0x04); return; }
    xs(2, 0x01);
    if (xbit(63, 6)) {
      xs(2, 0x03);
      call(0x5EB7, 0x11, 0x00, xw(17), xw(20));
    }
    xres(4, 4);
    xs(8, 0); xs(9, 0);
    xset(4, 0);
    if (xw(17) !== 0) return;
    const x = rw(0xD511);
    xsw(17, (x & 0xFF00) | (((x & 0xE0) + 0x10) & 0xFF));
    const y = (rw(0xD514) + 0x20) & 0xFFFF;
    xsw(20, y & 0xFFE0);
  });
  def(0xA0C6, function () {
    if (xbit(63, 6)) { xs(62, 0); xs(0, 0xFF); return; }
    if (xbit(63, 7)) { xs(0, 0xFE); return; }
    xs(0, 0xFF);
  });
  def(0xA0E7, function () {
    const b = xb(63);
    let a = b & 0x3F;
    if (!a) return;
    a--;
    xs(63, (b & 0xC0) | a);
    xs(2, ((xb(1) & 1) + 1) & 0xFF);
  });

  // ---------------------------------------------------------------- $10 monitor
  def(0xA149, function () {
    xset(3, 7);
    xs(2, 0x01);
    if (rb(0xD500) === 1) return;          // Sonic
    if (xb(63) !== 4) return;
    xs(63, 0x01);                          // Tails can't use rocket shoes
  });
  function f_A1F9(b) {
    const c = xb(38);
    const a = xb(4);
    xs(38, a);
    if (a & 0x40) return;
    if (!(c & 0x40)) return;
    wb(0xD3B3, b);
  }
  def(0xA161, function () { f_A1F9(xb(63)); xs(2, 0x02); });
  def(0xA16C, function () {
    f_A1F9(xb(63));
    if (xbit(4, 6)) return;
    call(0x5FA0);
    if (!(rb(0xD503) & 0x02)) return;
    const a = xb(33) & 0x0F;
    if (!a) return;
    if (a === 0x02) {                      // hit from below: pop up
      ww(0xD518, 0x0200);
      xsw(24, 0xFE00);
      xs(2, 0x03);
      return;
    }
    if (a === 0x01) {
      const s = rb(0xD502);
      if (s === 0x0F || s === 0x10 || s === 0x15 || s === 0x1A) return;
    }
    const hl = rw(0xD518);
    if (hl === 0) return;
    if (hl & 0x8000) return;
    f_A1D3();
    xs(63, 0x40);
    if (rb(0xD501) !== 0x09) ww(0xD518, 0xFC00);
    return call(0x5F54);
  });
  function f_A1D3() {
    const a = xb(63);
    if (a >= 0x0A) return;
    wb(0xD3A3, rb(0xD3A3) | rb(0xA1F0 + a));
    xs(63, 0);
    xset(63, 6);
  }
  def(0xA20D, function () {
    call(0x60FB);
    xsw(24, (xw(24) + 0x0040) & 0xFFFF);
    if (call(0x614E)) return;
    call(0x77CB);
    xs(2, 0x02);
  });
  // $11 monitor icon rising
  def(0xA244, function () {
    call(0x5F84, 0x0040, 0x0080);
    return call(0x60FB);
  });
  def(0xA250, () => xs(0, 0xFF));
  // $12
  def(0xA265, function () { xset(4, 1); xs(2, 0x01); });
  def(0xA26E, function () {
    if (!xbit(7, 0)) return;
    for (let i = 0; i < 0x0C; i++) wb(0xDB34 + i, (rb(0xDB34 + i) - 1) & 0xFF);
    if (((rb(0xDB38) + 0x10) & 0xFF) < 0xF8) return;
    xs(0, 0xFF);
  });

  // ---------------------------------------------------------------- $13 collapsing floor
  def(0xA2DD, function () {
    if (xb(63)) { xs(2, 0x03); return; }
    const x = xw(17);
    xs(53, x >> 8); xs(52, x & 0xFF);
    xs(17, ((x & 0xE0) + 0x0E) & 0xFF); xs(18, x >> 8);
    const y = xw(20);
    xs(55, y >> 8); xs(54, y & 0xFF);
    xs(20, ((y & 0xE0) + 0x18) & 0xFF); xs(21, y >> 8);
    xs(2, 0x01);
  });
  def(0xA31B, function () {
    if (xbit(4, 6)) { xs(0, 0xFF); return; }
    if (xb(63)) { xs(63, (xb(63) - 1) & 0xFF); return; }
    xsw(24, (xw(24) + 0x0200) & 0xFFFF);
    call(0x60FB);
  });
  def(0xA33F, () => xs(0, 0xFF));
  def(0xA344, function () {
    if (rb(0xD501) !== 0x0E) {
      if (rb(0xD503) & 1) return;
    }
    bset(0xD521, 1);
    ww(0xD518, 0);
    ww(0xD514, (xw(20) + 0xFFD8) & 0xFFFF);
  });
  def(0xA36A, function () {
    if (xbit(4, 6)) { xs(0, 0xFF); return; }
    if (xw(17) < rw(0xD174)) { xs(0, 0xFF); return; }
    ww(0xD360, xw(52) & 0xFFE0);
    ww(0xD362, (xw(54) & 0xFFE0) | 0x10);
    ww(0xD354, xw(48));
    return call(0x6C1F, 0xB0);
  });

  // ---------------------------------------------------------------- $18 goal signpost
  def(0xA867, function () { xset(3, 7); xs(52, 0); xs(53, 0); });
  def(0xA873, function () { if (xbit(4, 6)) return; xs(2, 0x02); });
  def(0xA87D, function () {
    wb(0xD3B3, 0x12);
    if (rb(0xD502) !== 0x12) return;
    wb(0xD502, 0x0E);
  });
  def(0xA88E, function () {
    if (rb(0xD502) !== 0x18) { if (rw(0xD516) === 0) return; }
    call(0x59E3);
    call(0x6328);
    if (!(xb(33) & 0x0F)) return;
    wb(0xD2BE, 0); wb(0xD445, 0);
    xs(25, 0xFC);
    if (xb(53) !== 0) { xs(2, 0x06); return; }
    xs(2, 0x04);
    return f_AA22();
  });
  def(0xA8C8, () => wb(0xD4A3, 0xFF));
  def(0xA8CE, function () {
    call(0x5F84, 0x0010, 0x0600);
    call(0x60FB);
    if (xw(60) >= xw(20)) return;
    xsw(20, xw(60));
    return f_A8FA();
  });
  function f_A8FA() {
    xs(2, 0x05);
    if (xb(53) !== 0) {
      xs(52, ((rb(0xD12F) & 7) + 1) & 0xFF);
      return f_A9A2();
    }
    xs(52, 0);
    const lv = (rb(0xD297) + 1) & 0xFF;
    f_A9FA((lv & 1) ? 0xA919 : 0xA962);
    return f_A9A2();
  }
  def(0xA8FA, f_A8FA);
  function f_A9A2() {
    let a = xb(52);
    if (a === 0) {
      xs(53, 0xFF);
      wb(0xD3B3, 0x20);
      xs(2, 0x03);
      return;
    }
    let face;
    if (--a === 0) {                     // extra life
      call(0x3104);
      face = rb(0xD500) === 1 ? 0x1B : 0x1D;
    } else if (--a === 0) {              // +10 rings
      wb(0xD29A, SC.bcdAdd(rb(0xD29A), 0x10));
      face = 0x1E;
    } else if (--a === 0) {              // continue
      wb(0xD2C3, SC.bcdAdd(rb(0xD2C3), 1) & 0x7F);
      face = rb(0xD500) === 1 ? 0x1D : 0x1B;
    } else face = 0x1F;
    wb(0xD3B3, face);
  }
  // search the ring count in a table of "lucky" numbers
  function f_A9FA(hl) {
    const a = rb(0xD29A);
    let bc = 0x40;
    let found = false;
    while (bc > 0) {
      const v = rb(hl); hl++; bc--;
      if (v === a) { found = true; break; }
    }
    if (found) {
      wb(0xDC00, a);
      xs(52, (bc >> 4) & 0x0F);
    } else xs(52, 0xFF);
  }
  function f_AA22() {
    const de = (xw(20) - 0x0099 - ((SC.VIEW_H - 192) >> 1)) & 0xFFFF;
    ww(0xD11C, de);
    const bc = (xw(17) - (SC.VIEW_W >> 1)) & 0xFFFF;
    return call(0x59C5, bc, rw(0xD11C));
  }
  def(0xAA47, () => call(0x5E9C, 0x19, 0x00));

  // ---------------------------------------------------------------- $19 goal speed display
  def(0xAA87, function () {
    for (let i = 0; i < 0x10; i++) wb(0xD3E7 + i, rb(0xAAC0 + i));
    for (let i = 0; i < 0x14; i++) wb(0xD3C7 + i, rb(0xAAD0 + i));
    xsw(17, (rw(0xD174) + 0x0104) & 0xFFFF);
    xsw(20, (rw(0xD176) + 0x0050) & 0xFFFF);
    xset(3, 7);
    xs(2, 0x01);
  });
  def(0xAAE4, function () {
    const de = xw(17);
    const lim = (rw(0xD174) + 0x0085) & 0xFFFF;
    if (lim >= de) { xs(2, 0x02); return; }
    xsw(17, (de - 8) & 0xFFFF);
  });
  def(0xAB0A, function () {
    let a = (xb(30) + 1) & 0xFF;
    if (a >= 0x0A) a = 0;
    xs(30, a);
    const c = a * 3;
    for (let i = 0; i < 3; i++) wb(0xD3F2 + i, rb(0xAB2A + c + i));
  });
  def(0xAB48, function () {
    let hl = call(0x6276);
    if (hl === 0) hl = 0x0777;
    ww(0xD2A6, hl);
    const b = hl >> 8, l = hl & 0xFF;
    if ((l & 0x0F) === b && ((l >> 4) & 0x0F) === b) call(0x3104);
    hl = rw(0xD2A6);
    wb(0xD3F2, (((hl >> 8) & 0x0F) * 2 + 0x2E) & 0xFF);
    wb(0xD3F3, ((((hl & 0xFF) >> 4) & 0x0F) * 2 + 0x2E) & 0xFF);
    wb(0xD3F4, (((hl & 0x0F)) * 2 + 0x2E) & 0xFF);
  });
  def(0xAB8C, function () {
    if (rb(0xD501) === 0x20) return;
    call(0x613C);
    if (!(rb(0xD522) & 2)) return;
    call(0x4892);
  });

  // ---------------------------------------------------------------- $1B rising spikes
  def(0xAC7D, function () { xset(3, 7); xs(2, 0x01); xs(31, 0); });
  def(0xAC8B, function () {
    if (xbit(4, 6)) return;
    f_ACFD();
    const y = (xw(20) - 6) & 0xFFFF;
    xsw(20, y);
    if (((xw(60) - y - 0x12) & 0xFFFF) !== 0) return;
    xs(2, 0x02);
    xs(30, 0x10);
  });
  def(0xACC3, function () { if (xbit(4, 6)) return; f_ACFD(); });
  def(0xACCC, function () {
    if (xbit(4, 6)) return;
    const y = (xw(20) + 6) & 0xFFFF;
    xsw(20, y);
    const d = xw(60) - y;
    if (d > 0) return;
    xs(2, 0x04);
    xs(30, 0x40);
  });
  def(0xACFC, () => {});
  function f_ACFD() {
    const t = xb(31);
    if (t) { xs(31, t - 1); return; }
    if (rb(0xD519) & 0x80) return;
    call(0x6328);
    const a = xb(33) & 0x0F;
    if (!a) return;
    if (a & 1) {                         // touching the spikes: hurt
      wb(0xD3B0, 0xFF);
      ww(0xD518, 0xFC00);
      xs(31, 0x10);
      return;
    }
    if (!(rb(0xD522) & 2)) return;
    if (!(rb(0xD503) & 2)) return;
    wb(0xD502, 0x01);
    ww(0xD516, 0);
    ww(0xD511, (xw(17) + (xbit(33, 2) ? 0x0017 : 0xFFE9)) & 0xFFFF);
  }

  // ---------------------------------------------------------------- $21 badnik
  def(0xB210, function () {
    xs(2, 0x03);
    xs(23, 0xFF); xs(22, 0x80);
    xs(25, 0x02); xs(24, 0x00);
    xset(3, 7);
    const a = xb(63);
    xs(63, 0);
    const d = (xw(17) - a * 16) & 0xFFFF;
    xs(56, d >> 8); xs(55, d & 0xFF);
    if (!xbit(4, 4)) return;
    xs(63, 0x01);
    xs(4, 0x00);
    xs(2, 0x05);
  });
  def(0xB264, function () { xres(4, 4); return f_B268(); });
  def(0xB268, f_B268);
  function f_B268() {
    if (xbit(4, 6)) return;
    call(0x60FB);
    call(0x77CB);
    if (!xbit(34, 1)) { xs(2, 0x01); return; }
    if (!(rb(0xD12F) & 1)) {
      if (call(0x62D5)) {
        call(0x62F7);
        const a = xb(2);
        if (!xbit(63, 0)) xs(2, a === 0x04 ? 0x03 : 0x04);
        else xs(2, a === 0x06 ? 0x05 : 0x06);
        return;
      }
    }
    call(0x6328);
    if (xb(33) === 0) return;
    const hl = (xw(20) + 0xFFFC) & 0xFFFF;
    if (hl >= rw(0xD514)) {              // Sonic jumped on it
      wb(0xD448, 0xFF);
      return call(0x5F17, 0xF940);
    }
    if (rb(0xD503) & 2) return call(0x5F54);
    if (rb(0xD532) === 0x06) return call(0x5F54);
    wb(0xD3B0, 0xFF);
  }
  def(0xB2F0, function () { call(0x60FB); return call(0x631A, 0x0040); });
})(typeof window !== 'undefined' ? window : globalThis);
