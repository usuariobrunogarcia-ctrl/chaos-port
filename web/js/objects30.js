/*
 * objects30.js - object logic in bank 30 ($78000), types $26+:
 *   $26 spring   $27 flying badnik   $28 moving / falling platforms
 */
(function (G) {
  'use strict';
  const SC = G.SC;
  const { rb, wb, rw, ww, xb, xs, xw, xsw, xbit, xset, xres } = SC;
  const call = SC.call;
  const neg16 = SC.neg16;
  const def = (a, f) => SC.def(a, f, 0x1E);

  // ---------------------------------------------------------------- $26 spring
  def(0x825A, function () {
    xs(2, 0x07); xs(10, 0x07);
    const y = (xw(20) + 0x0C) & 0xFFFF;
    xsw(20, y); xsw(60, y);
    let a = xb(63);
    if (!(a & 0x80)) return;
    a &= 0x7F;
    xsw(52, (a * 16) & 0xFFFF);
    xs(2, 0x08); xs(10, 0x08);
    xs(63, 0x01);
    if (xb(9) === 0) xs(63, 0x00);
  });
  function springLaunch() {
    let b = 0xFF, hl = 0xF8A0;
    if (xb(63) !== 0) { b = 0x00; hl = 0xFB00; }
    wb(0xD448, b);
    call(0x5F17, hl);
  }
  def(0x82AF, function () {
    if (xbit(4, 6)) return;
    if (rb(0xD519) & 0x80) return;
    if (!(rb(0xD522) & 2)) return;
    if (rb(0xD502) === 0x21) return;
    if (!call(0x61A5, 0x000C)) return;
    const t = (xw(20) + 0xFFE4) & 0xFFFF;
    if (t < rw(0xD514)) return;
    if (t - rw(0xD514) >= 6) return;
    springLaunch();
    xs(2, xb(63) === 0x01 ? 0x03 : 0x01);
    xs(30, 0x1C);
  });
  function compress(next, t) {
    const a = xb(30) - 7;
    xs(30, a & 0xFF);
    if (a < 0) { xs(2, next); xs(30, t); return; }
    xsw(20, (xw(20) - 7) & 0xFFFF);
  }
  def(0x8312, () => compress(0x02, 0x20));
  def(0x837C, () => compress(0x04, 0x0A));
  function hold(next) {
    const a = xb(30) - 1;
    xs(30, a & 0xFF);
    if (a < 0) xs(2, next);
  }
  def(0x833A, () => hold(0x05));
  def(0x83A4, () => hold(0x06));
  def(0x8349, function () {
    const y = (xw(20) + 7) & 0xFFFF;
    xsw(20, y);
    if (xw(60) - y > 0) return;
    xs(2, xb(10));
    xsw(20, xw(60));
  });
  // $83BF/$8401: spring that follows Sonic inside a horizontal range
  def(0x83BF, function () {
    if (rb(0xD519) & 0x80) return;
    if (rb(0xD502) === 0x21) return;
    if (!(rb(0xD522) & 2)) return;
    xsw(17, xw(58));
    const d = rw(0xD511) - xw(17);
    if (d < 0) return;
    if (d >= xw(52)) return;
    if (!call(0x61B1, 0x0030)) return;
    xs(2, 0x09);
  });
  def(0x8401, function () {
    xs(18, rb(0xD512));
    xs(17, rb(0xD511) & 0xF0);
    springLaunch();
    xs(30, 0x1C);
    xs(2, 0x03);
    if (xb(9) === 0) xs(2, 0x01);
  });

  // ---------------------------------------------------------------- $27 flying badnik
  function f_8999() {
    xs(23, 0xFD); xs(22, 0x80);
    xs(25, 0); xs(24, 0);
  }
  function f_89CB() {
    xs(2, 0x02);
    xs(23, 0); xs(22, 0);
    xs(31, 0x01);
    xs(30, 0x80);
  }
  def(0x898E, function () {
    xs(2, 0x01);
    if (xb(63) !== 0) return f_89CB();
    f_8999();
  });
  def(0x89AC, function () {
    if (xbit(4, 6)) return;
    call(0x6328);
    if (xb(33) & 0x0F) return call(0x5F3D);
    call(0x60FB);
    if (!call(0x61A5, 0x0040)) return;
    xset(4, 1);
    return f_89CB();
  });
  function f_8A06() {
    call(0x6328);
    if (xb(33) & 0x0F) return call(0x5F3D);
    call(0x60FB);
    if (xb(63) !== 0) return;
    const a = xb(30) - 1;
    xs(30, a & 0xFF);
    if (a >= 0) return;
    xs(2, 0x03);
    return f_8999();
  }
  def(0x89DF, function () { xsw(24, (xw(24) + 3) & 0xFFFF); return f_8A06(); });
  def(0x89F3, function () { xsw(24, (xw(24) - 3) & 0xFFFF); return f_8A06(); });
  def(0x8A29, function () {
    if (!call(0x61A5, 0x0180)) { xs(0, 0xFE); return; }
    call(0x6328);
    if (xb(33) & 0x0F) return call(0x5F3D);
    return call(0x60FB);
  });
  def(0x80F1, function () { xsw(24, neg16(xw(24))); });

  // ---------------------------------------------------------------- $28 platforms
  def(0x8585, function () {
    xset(3, 7);
    xs(37, 0);
    let a = xb(63);
    if (a & 0x80) xs(37, 0xFF);
    xs(38, 0);
    if (a & 0x40) xs(38, 0xFF);
    a = ((a & 0x3F) + 1) & 0xFF;
    xs(2, a); xs(54, a);
    const p = xb(63) & 0x7F;
    if (p === 0x0B || p === 0x05) xs(2, 0x0D);
    xs(52, xb(9)); xs(55, xb(9));
    xs(48, 0x10);
    for (const o of [53, 57, 56, 36, 35, 31, 39, 30, 49, 51]) xs(o, 0);
    xs(10, 0xC0); xs(11, 0x02);
    xs(50, call(0x606B, SC.R.ix));
  });
  def(0x85FE, function () {
    if (xbit(4, 6)) return;
    if (rb(0xD519) & 0x80) return;
    call(0x6328);
    if (!xbit(33, 0)) return;
    xs(2, xb(54));
    if (rb(0xD297) === 4 && rb(0xD298) === 1) xs(2, 0x0E);
  });
  // horizontal movement, carrying Sonic
  function moveX() {
    if (rb(0xD519) & 0x80) {
      xs(33, 0);
      call(0x60FB);
      return f_8843();
    }
    const de = xw(17);
    call(0x60FB);
    xsw(35, (xw(17) - de) & 0xFFFF);
    return f_8814();
  }
  function moveY() {
    if (f_8866()) {
      xs(33, 0);
      call(0x60FB);
      return f_8843();
    }
    const de = xw(20);
    call(0x60FB);
    xsw(56, (xw(20) - de) & 0xFFFF);
    return f_8814();
  }
  function f_8628() {
    if (xbit(4, 6)) call(0x60FB);
    return moveX();
  }
  def(0x8628, f_8628);
  function f_8662() {
    f_8908();
    moveX();
    if (f_8925(0x10)) call(0x62F7);
  }
  def(0x8662, f_8662);
  def(0x86A1, function () {
    if (xbit(4, 6)) call(0x60FB);
    return moveY();
  });
  function f_86DA() {
    f_8908();
    moveY();
    if (f_8925(0x10)) call(0x80F1);
  }
  def(0x86DA, f_86DA);
  def(0x8718, () => {});
  // falling platform
  def(0x8719, function () {
    if (xbit(4, 6)) {
      if (xb(39) === 0) return;
      xs(63, 0x80); xs(62, 0x00); xs(0, 0xFE);
      return;
    }
    const s = xb(39);
    if (s === 0xFF) {
      xsw(24, (xw(24) + 0x0030) & 0xFFFF);
      const de = xw(20);
      call(0x60FB);
      xsw(56, (xw(20) - de) & 0xFFFF);
    } else if (s !== 0) {
      if (xb(30) !== 0) xs(30, xb(30) - 1);
      else xs(39, 0xFF);
    }
    if (rb(0xD519) & 0x80) { xs(33, 0); return f_8843(); }
    f_8814();
    if (xb(39) !== 0) return;
    if (!xbit(33, 0)) return;
    xs(39, 0x80);
  });
  def(0x879A, function () {
    if (xbit(4, 6)) return;
    if (f_8866()) { xs(33, 0); return f_8843(); }
    return f_8814();
  });
  function riding(mover, velHiOff) {
    f_8908();
    if (xb(49) === 0) {
      call(0x6328);
      if (!(xb(33) & 0x0F)) return;
      xs(49, 0x01);
    }
    mover();
    if (xb(velHiOff) & 0x80) {
      if (xb(49) === 0x01) return;
      xs(49, 0x00);
      return;
    }
    xs(49, 0x02);
  }
  def(0x87B2, () => riding(f_86DA, 25));
  def(0x87E2, () => riding(f_8662, 23));
  def(0x8812, () => {});
  def(0x8813, () => {});
  def(0x8577, function () { xs(57, 0); xs(56, 0); xs(36, 0); xs(35, 0); });

  // Sonic standing on the platform?
  function f_8814() {
    const c = rb(0xD3C0);
    if (c !== 0 && c !== xb(50)) return f_8843();
    call(0x6328);
    if (!xbit(33, 0)) return f_8843();
    const b = xb(50);
    const a = rb(0xD3C0);
    if (a !== 0 && a !== b) return;
    wb(0xD3C0, b);
    f_88FB();
    f_88A0();
  }
  function f_8843() {
    xs(51, 0);
    if (xb(33) & 0x0C) wb(0xD521, rb(0xD521) & 0x33);
    f_88E1();
    if (rb(0xD3C0) !== xb(50)) return;
    wb(0xD3C0, 0);
  }
  // does Sonic move away from the platform vertically?
  function f_8866() {
    let hl = xw(24), de = rw(0xD518);
    if ((hl >> 8) & (de >> 8) & 0x80) {
      hl = neg16(hl); de = neg16(de);
      wb(0xD4A5, 0xFF);
      return hl < de ? 0xFF : 0;
    }
    if (((hl >> 8) ^ (de >> 8)) & 0x80) return hl < de ? 0xFF : 0;
    if (hl === de) return 0;
    if (hl < de) return 0;
    return 0xFF;
  }
  // carry Sonic
  function f_88A0() {
    ww(0xD514, (xw(20) - ((xb(45) - 2) & 0xFF)) & 0xFFFF);
    ww(0xD511, (rw(0xD511) + xw(35)) & 0xFFFF);
  }
  function f_88C1() {
    if (xb(53) === 0x08) { xs(51, 0xFF); return; }
    xs(53, xb(53) + 1);
    xsw(20, (xw(20) + 1) & 0xFFFF);
  }
  function f_88E1() {
    if (xb(53) === 0) return;
    xs(53, xb(53) - 1);
    xsw(20, (xw(20) - 1) & 0xFFFF);
  }
  function f_88FB() {
    if (!xbit(37, 7)) return;
    if (xb(51) === 0) return f_88C1();
    return f_88E1();
  }
  // delete when far away from Sonic
  function f_8908() {
    if (!xbit(4, 1)) return;
    if (call(0x61A5, 0x0280) && call(0x61B1, 0x02A0)) return;
    xs(0, 0xFE);
  }
  function f_8925(b) {
    let a = (xb(48) - 1) & 0xFF;
    if (a !== 0) { xs(48, a); return 0; }
    xs(48, b);
    a = (xb(55) - 1) & 0xFF;
    if (a !== 0) { xs(55, a); return 0; }
    xs(55, xb(52));
    return 0xFF;
  }
})(typeof window !== 'undefined' ? window : globalThis);
