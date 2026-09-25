/*
 * objects.js - object system core, ported from bank 1 ($5DD1-$6907).
 *   - animation scripts (the "brain" of every object, including Sonic)
 *   - object slots, spawning, the activity window, object<->player collision
 */
(function (G) {
  'use strict';
  const SC = G.SC;
  const { rb, wb, rw, ww, xb, xs, xw, xsw, xbit, xset, xres, yb, ys, yw, ysw, bset, bres, def } = SC;
  const R = SC.R;
  const call = SC.call;
  const neg16 = SC.neg16;

  // ------------------------------------------------------------ $5DD1 object loop
  function f_5DD1() {
    wb(0xD521, 0);
    R.ix = 0xD540;
    for (let b = 0; b < 0x13; b++) {
      wb(0xD44F, 0xFF);
      f_5DF1();
      wb(0xD44F, 0);
      R.ix = (R.ix + 0x40) & 0xFFFF;
    }
  }
  function f_5DF1() {
    const t = xb(0);
    if (t === 0) return;
    if (t >= 0xF0) {
      const i = t & 0x0F;
      if (i === 14) { xs(0, 0xFF); xs(1, 0); return; }   // $626D
      if (i === 15) return f_5EF8();
      return;
    }
    const bk = t < 0x26 ? 0x0C : 0x1E;
    SC.page2(bk);
    f_64FA();
    wb(0xD44F, 0);
    wb(0xD44F, 0xFF);
    SC.page2(bk);
    f_5E91();
    wb(0xD44F, 0);
    if (xb(1) === 0) return;
    return f_61E1();
  }
  // $5E91: run the logic handler of the current animation frame
  function f_5E91() {
    const hl = xw(12);
    if (hl === 0) return;
    return SC.callAddr(hl);
  }
  // $5E9C: spawn object type c in the first free slot of $D540-$D8FF
  function f_5E9C(c, h) {
    let iy = 0xD540;
    for (let b = 0; b < 0x10; b++, iy += 0x40) {
      if (rb(iy) === 0) {
        wb(iy, c); wb(iy + 63, h);
        R.iy = iy;
        return true;
      }
    }
    return false;
  }
  // $5EB7: spawn object b (param c) at (de, hl)
  function f_5EB7(b, c, de, hl) {
    let iy = 0xD540;
    for (let k = 0; k < 0x10; k++, iy += 0x40) {
      if (rb(iy) === 0) {
        R.iy = iy;
        wb(iy, b); wb(iy + 63, c);
        wb(iy + 18, de >> 8); wb(iy + 17, de & 0xFF);
        wb(iy + 21, hl >> 8); wb(iy + 20, hl & 0xFF);
        return true;
      }
    }
    return false;
  }
  // $5EE1: find a free slot in $D700-$D9BF (for script-spawned objects). Returns true if none.
  function f_5EE1() {
    let iy = 0xD700;
    for (let b = 0; b < 0x0B; b++, iy += 0x40) {
      if (rb(iy) === 0) { R.iy = iy; return false; }
    }
    R.iy = iy;
    return true;
  }
  // $5EF8: delete object (and its layout "spawned" flag)
  function f_5EF8() {
    const n = xb(62);
    if (n) wb(0xD400 + n - 1, 0);
    return f_5F09();
  }
  function f_5F09() {
    for (let i = 0; i < 0x40; i++) wb(R.ix + i, 0);
  }
  // $5F17: bounce Sonic up (e.g. jumping on a badnik / spring objects)
  function f_5F17(hl) {
    const ix = R.ix;
    R.ix = 0xD500;
    xs(33, 0);
    call(0x480C, hl);
    R.ix = ix;
  }
  // $5F27: place object at Sonic's position + hl (y)
  function f_5F27(hl) {
    const bc = rw(0xD511);
    xsw(17, bc);
    xsw(20, (hl + rw(0xD514)) & 0xFFFF);
  }
  // $5F3D: badnik touched: destroyed if Sonic is attacking (rolling) or invincible.
  // (Otherwise Sonic gets hurt through $D520 on his next update.)
  function f_5F3D() {
    if (!(xb(33) & 0x0F)) return;
    if (rb(0xD532) !== 0x06) {
      if (!(rb(0xD503) & 0x02)) return;
    }
    xs(63, 0x80);
    return f_5F54();
  }
  // $5F54: turn into an explosion/score object
  function f_5F54() {
    f_5F77();
    xs(0, 0x0F);
    xs(1, 0); xs(2, 0); xs(4, 0);
    return f_5F65();
  }
  function f_5F65() {
    xs(7, 0); xs(14, 0); xs(15, 0);
    xs(62, 0); xs(63, 0);
  }
  function f_5F77() {
    const a = xb(0);
    if (a >= 0x50) return;
    // score +? (via $262F with table $27EB)
    return call(0x262F, 0x27EB);
  }
  // $5F84: vy += de, capped at bc
  function f_5F84(de, bc) {
    const hl = (xw(24) + de) & 0xFFFF;
    if (!(hl & 0x8000) && hl >= bc) return;
    xsw(24, hl);
  }
  // $5FA0: solid object (push Sonic out)
  function f_5FA0() {
    f_6328();
    return f_5FA6();
  }
  function f_5FA6() {
    const a = xb(33) & 0x0F;
    switch (a) {
      case 1: // Sonic above the object: stand on it
        if (rb(0xD523) & 1) return;
        ww(0xD514, (xw(20) - xb(45)) & 0xFFFF);
        return;
      case 2:
        if (rb(0xD523) & 2) return;
        ww(0xD514, (xw(20) + rb(0xD52D)) & 0xFFFF);
        return;
      case 4:
        if (rb(0xD523) & 4) return;
        if (rw(0xD174) + SC.VIEW_W - 0x20 < rw(0xD511)) return;
        ww(0xD511, (xw(17) + xb(44) + rb(0xD52C)) & 0xFFFF);
        return;
      case 8:
        if (rb(0xD523) & 8) return;
        if (rw(0xD174) + 0x20 >= rw(0xD511)) return;
        ww(0xD511, (xw(17) - (xb(44) + rb(0xD52C))) & 0xFFFF);
        return;
      default: return;
    }
  }
  function f_6066() { xs(31, 0); }
  // $606B: slot index of object hl (1-based)
  function f_606B(hl) {
    const d = (hl - 0xD500) & 0xFFFF;
    return (((d >> 8) << 2) | ((d & 0xFF) >> 6)) + 1 & 0xFF;
  }
  function f_607A(a) {
    a = (a - 1) & 0xFF;
    return (((a >> 2) << 8) | ((a & 3) << 6)) + 0xD500;
  }
  // $6089: velocity from angle (ix+10) and speed (ix+11) using the sine table at $0200
  function f_6089() {
    xsw(22, 0); xsw(24, 0);
    const n = xb(11);
    if (!n) return;
    const sinv = (a) => { const v = rb(0x0200 + a); return v & 0x80 ? v - 256 : v; };
    let s = sinv(xb(10)) * n;
    xsw(22, (s >> 4) & 0xFFFF);
    s = sinv((xb(10) + 0xC0) & 0xFF) * n;
    xsw(24, (s >> 4) & 0xFFFF);
  }
  // $60FB: move object by its velocity (x and y, 16.8)
  function f_60FB() {
    let hl = (xb(16) | (xb(17) << 8));
    let de = xw(22);
    let a = de & 0x8000 ? 0xFF : 0;
    let sum = hl + de;
    xs(18, (a + xb(18) + (sum > 0xFFFF ? 1 : 0)) & 0xFF);
    xs(16, sum & 0xFF); xs(17, (sum >> 8) & 0xFF);
    hl = (xb(19) | (xb(20) << 8));
    de = xw(24);
    a = de & 0x8000 ? 0xFF : 0;
    sum = hl + de;
    xs(21, (a + xb(21) + (sum > 0xFFFF ? 1 : 0)) & 0xFF);
    xs(19, sum & 0xFF); xs(20, (sum >> 8) & 0xFF);
  }
  function f_613C() {
    if (rb(0xD500) === 1) return;
    if (rb(0xD502) !== 0x18) return;
    wb(0xD502, 0x0E);
  }
  // $614E/$6168: probe terrain under the object; returns 0 if solid, $FF otherwise
  function f_614E() {
    sensorTypeAt(0, 0);
    const a = rb(0xD364);
    return (a & 0xC0) ? 0 : 0xFF;
  }
  function f_6168() {
    sensorTypeAt(0, 0xFFF0);
    return (rb(0xD364) & 0x80) ? 0 : 0xFF;
  }
  function sensorTypeAt(bc, de) { return SC.sensorType(bc, de); }
  // $617E: Sonic within 12px on both axes?
  function f_617E() {
    if (!f_61BB(xw(17), rw(0xD511), 0x0C)) return 0;
    if (!f_61BB(xw(20), rw(0xD514), 0x0C)) return 0;
    return 0xFF;
  }
  function f_61A5(bc) { return f_61BB(xw(17), rw(0xD511), bc); }
  function f_61B1(bc) { return f_61BB(xw(20), rw(0xD514), bc); }
  // |hl-de| < bc ? $FF : 0  (also leaves the sign in SC.regD)
  function f_61BB(hl, de, bc) {
    let d = (hl - de) & 0xFFFF;
    SC.regD = 0;
    if (d & 0x8000) { d = (-d) & 0xFFFF; SC.regD = 0xFF; }
    return d < bc ? 0xFF : 0;
  }
  function f_61D6() {
    if (rb(0xDE04) !== 0) return;
    wb(0xDE04, 0xC4);
  }

  // ------------------------------------------------------------ activity window
  // The original uses a 32x32 table (bank 28 $8146) covering 512x512 pixels around
  // the camera: 3 = delete, bit1 = inactive (hidden).  For wider views we derive the
  // same decision from the distance to the visible area.
  function f_61E1() {
    xres(4, 6);
    const r = SC.activity(xw(17), xw(20));
    if (r === 3) return f_624C();
    if (r & 2) xset(4, 6);
  }
  SC.activityTable = function (x, y) {
    let hl = (x + 0x80 - rw(0xD174));
    if (hl < 0) return 3;
    hl >>= 1;
    if (hl > 0xFF) return 3;
    const e = (hl >> 3) & 0x1F;
    let hy = (y + 0x80 - rw(0xD176));
    if (hy < 0) return 3;
    hy >>= 1;
    if (hy > 0xFF) return 3;
    const idx = ((hy & 0xF8) << 2) + e;
    SC.page2(0x1C);
    return rb(0x8146 + idx);
  };
  SC.activity = SC.activityTable;
  function f_624C() {
    xset(4, 6);
    if (xbit(4, 1)) return;
    if (xb(62)) { xs(0, 0xFE); xs(1, 0); return; }
    xs(0, 0xFF); xs(1, 0);
  }
  function f_62D5() {
    const hl = xw(17);
    if (!xbit(23, 7)) return xw(58) < hl ? 0xFF : 0;
    return hl < (xb(55) | (xb(56) << 8)) ? 0xFF : 0;
  }
  function f_62F7() { xsw(22, neg16(xw(22))); }
  function f_630B() {
    f_6328();
    if (!(xb(33) & 0x0F)) return;
    wb(0xD3B0, 0xFF);
  }
  function f_631A(de) { xsw(24, (xw(24) + de) & 0xFFFF); }

  // $6328: object <-> Sonic bounding box test.  Sets (ix+33) b0 below, b1 above,
  // b2 right, b3 left (the side Sonic touches), (ix+32)=1 and $D520/$D521 for Sonic.
  function f_6328() {
    xs(32, 0);
    xs(33, xb(33) & 0xF0);
    if (xbit(3, 6)) return;
    if (!xbit(3, 7)) {
      if (rb(0xD503) & 0x40) return;
    }
    return boxTest(false);
  }
  function f_640B() {
    xs(32, 0);
    xs(33, xb(33) & 0xF0);
    if (xbit(3, 6)) return;
    if (!xbit(3, 7)) {
      if (rb(0xD503) & 0x40) return;
    }
    return boxTest(true);
  }
  function boxTest(all) {
    let hl = (rw(0xD511) - xw(17));
    let c;
    const miss = () => { xs(33, xb(33) & 0xF0); };
    if (hl >= 0) {
      if (hl >> 8) return miss();
      const a = (rb(0xD52C) + xb(44) - (hl & 0xFF));
      if (((rb(0xD52C) + xb(44)) & 0xFF) < (hl & 0xFF)) return miss();
      c = a & 0xFF;
      xset(33, 2);
    } else {
      hl &= 0xFFFF;
      if (((hl >> 8) + 1) & 0xFF) return miss();
      const l = (-(hl & 0xFF)) & 0xFF;
      if (l === 0) return miss();
      const s = (rb(0xD52C) + xb(44)) & 0xFF;
      if (s < l) return miss();
      c = (s - l) & 0xFF;
      xset(33, 3);
    }
    let l;
    let hy = rw(0xD514) - xw(20);
    if (hy >= 0) {
      if (hy >> 8) return miss();
      const a = rb(0xD52D);
      if (a < (hy & 0xFF)) return miss();
      l = (a - (hy & 0xFF)) & 0xFF;
      xset(33, 1);
    } else {
      hy &= 0xFFFF;
      if (((hy >> 8) + 1) & 0xFF) return miss();
      const n = (-(hy & 0xFF)) & 0xFF;
      if (n === 0) return miss();
      const a = xb(45);
      if (a < n) return miss();
      l = (a - n) & 0xFF;
      xset(33, 0);
    }
    if (all) {
      xs(33, 0x0F);
      if (!(rb(0xD503) & 0x80)) xs(32, 1);
      if (!xbit(3, 7)) wb(0xD520, f_606B(R.ix));
      wb(0xD521, (rb(0xD521) & 0x0F) | 0xF0);
      return;
    }
    // keep only the axis with the smallest overlap
    const b = c < l ? 0x0C : 0x03;
    xs(33, xb(33) & b);
    if (!(rb(0xD503) & 0x80)) xs(32, 1);
    if (!xbit(3, 7)) wb(0xD520, f_606B(R.ix));
    const f = xb(33) & 0x0F;
    const cc = (f & 0x03) ? 0x03 : 0x0C;
    const v = ((f ^ cc) << 4 | (f ^ cc) >> 4) & 0xFF;
    wb(0xD521, (rb(0xD521) & 0x0F) | v);
  }

  // ------------------------------------------------------------ animation scripts
  // Script entries: [time, frame, handler.w]  or  $FF cmd args...
  // Script tables: bank 1 $65BA lists, per object type, a pointer (in the object's
  // bank) to its per-state script table.
  function scriptTable() {
    const t = xb(0);
    // types 1..6 use $65BA; the table continues for every object type
    return rw(0x65BA + (((t - 1) * 2) & 0xFF));
  }
  function f_64FA() {
    if (xw(14) !== 0) {
      if (!xbit(3, 3) && xb(2) !== xb(1)) {
        xs(1, xb(2));
        return f_651D();
      }
      const t = (xb(7) - 1) & 0xFF;
      xs(7, t);
      if (t === 0) return f_653D();
      return;
    }
    return f_651D();
  }
  function f_651D() {
    const tbl = scriptTable();
    const p = rw((tbl + ((xb(1) * 2) & 0xFF)) & 0xFFFF);
    xsw(14, p);
    return f_653D();
  }
  function f_653D() {
    for (let guard = 0; guard < 256; guard++) {
      let hl = xw(14);
      const a = rb(hl);
      if (a !== 0xFF) {
        xs(7, a);
        xs(6, rb(hl + 1));
        xs(12, rb(hl + 2));
        xs(13, rb(hl + 3));
        xsw(14, (hl + 4) & 0xFFFF);
        return f_6562();
      }
      // command
      const cmd = rb(hl + 1);
      hl = (hl + 2) & 0xFFFF;
      xsw(14, hl);
      const r = command(cmd, hl);
      if (r === 'done') return;
    }
    throw new Error('animation script loop');
  }
  function command(cmd, hl) {
    switch (cmd) {
      case 0: // restart / switch to the requested state
        if (xb(1) === xb(2)) f_651D();
        else { xs(1, xb(2)); f_651D(); }
        return 'done';
      case 1: { // call routine
        const de = rw(hl);
        xsw(14, hl + 2);
        SC.callAddr(de);
        return;
      }
      case 2: { // set velocity
        let de = rw(hl), bc = rw(hl + 2);
        xsw(14, hl + 4);
        if (xbit(4, 4)) de = neg16(de);
        xsw(22, de); xsw(24, bc);
        return;
      }
      case 3: xs(2, rb(hl)); xsw(14, hl + 1); return;
      case 4: { // spawn child object
        if (f_5EE1()) { xsw(14, hl + 6); return; }
        ys(0, rb(hl));
        let de = rw(hl + 1);
        const bc = rw(hl + 3);
        ys(63, rb(hl + 5));
        xsw(14, hl + 6);
        if (xbit(4, 4)) de = neg16(de);
        const x = (xw(17) + de) & 0xFFFF;
        ysw(17, x); ysw(58, x);
        const y = (xw(20) + bc) & 0xFFFF;
        ysw(20, y); ysw(60, y);
        ys(4, xb(4) & 0x10);
        ys(8, xb(8)); ys(9, xb(9));
        return;
      }
      case 5: { // call routine and set handler; frame stays
        const de = rw(hl);
        xs(12, rb(hl + 2)); xs(13, rb(hl + 3));
        xsw(14, hl + 4);
        SC.callAddr(de);
        f_6562();
        return 'done';
      }
      case 6: wb(0xDE04, rb(hl)); xsw(14, hl + 1); return;
      case 7: xsw(14, rw(hl)); return;
      case 8: { // conditional goto
        const de = rw(hl), bc = rw(hl + 2);
        xsw(14, hl + 4);
        const carry = SC.callAddr(de);
        if (carry) xsw(14, bc);
        return;
      }
      case 9: wb(R.ix + rb(hl), rb(hl + 1)); xsw(14, hl + 2); return;
      case 10: wb(rw(hl), rb(hl + 2)); xsw(14, hl + 3); return;
      case 11: { const o = rb(hl); wb(R.ix + o, rb(R.ix + o) & rb(hl + 1)); xsw(14, hl + 2); return; }
      case 12: { const o = rb(hl); wb(R.ix + o, rb(R.ix + o) | rb(hl + 1)); xsw(14, hl + 2); return; }
      case 13: { // frame depending on (ix+10) bit 4
        const c = rb(hl), e = rb(hl + 1), d = rb(hl + 2);
        xs(12, rb(hl + 3)); xs(13, rb(hl + 4));
        xsw(14, hl + 5);
        xs(7, c);
        xs(6, xbit(10, 4) ? d : e);
        f_6562();
        return 'done';
      }
      case 14: xs(51, rb(hl)); xsw(14, hl + 1); return;
      case 15: { // loop
        const n = (xb(51) - 1) & 0xFF;
        xs(51, n);
        if (n) xsw(14, rw(hl)); else xsw(14, hl + 2);
        return;
      }
      default: throw new Error('bad script command ' + cmd);
    }
  }
  // $6562: fetch sprite frame data (bank 15) for (ix+0) type / (ix+6) frame
  function f_6562() {
    SC.page2(0x0F);
    const de = rw((0x8000 + xb(0) * 2) & 0xFFFF);
    const hl = rw((de + xb(6) * 2) & 0xFFFF);
    let a = rb(hl);
    if (xbit(4, 3) && a !== 0) a = 0;
    xs(5, a);
    xs(44, rb(hl + 1));
    xs(45, rb(hl + 2));
    xs(40, rb(hl + 3));
    xs(41, rb(hl + 4));
    xsw(42, (hl + 5) & 0xFFFF);
  }
  // $6276: goal bonus value from the level timer (table at $62AD) and ring count
  function f_6276() {
    let a = 0;
    let de, p;
    for (;;) {
      p = 0x62AD + ((a * 4) & 0xFF);
      de = rw(p);
      wb(0xD11C, (p + 2) & 0xFF); wb(0xD11D, (p + 2) >> 8);
      if (rw(0xD2BF) < de) break;
      a++;
    }
    const q = rw(0xD11C);
    let l = rb(q), h = rb(q + 1);
    // a = daa(rings - $11) ; daa(a + l)
    let r = rb(0xD29A);
    let v = SC.bcdSub ? SC.bcdSub(r, 0x11) : r;
    const s = SC.bcdAddC(v, l);
    l = s[0];
    return (h << 8) | l;
  }
  function f_64F0() { xs(0, 0xFE); }
  function f_64F5() { xs(0, 0xFF); }
  function f_68F8() { xres(4, 4); }
  function f_68FD() { xset(4, 4); }
  function f_6902() { xs(4, xb(4) ^ 0x10); }

  const table = {
    0x5DD1: f_5DD1, 0x5DF1: f_5DF1, 0x5E91: f_5E91, 0x5E9C: f_5E9C, 0x5EB7: f_5EB7, 0x5EE1: f_5EE1,
    0x5EF8: f_5EF8, 0x5F09: f_5F09, 0x5F17: f_5F17, 0x5F27: f_5F27, 0x5F3D: f_5F3D, 0x5F54: f_5F54,
    0x5F77: f_5F77, 0x5F84: f_5F84, 0x5FA0: f_5FA0, 0x5FA6: f_5FA6, 0x6066: f_6066, 0x606B: f_606B,
    0x607A: f_607A, 0x6089: f_6089, 0x60FB: f_60FB, 0x613C: f_613C, 0x614E: f_614E, 0x6168: f_6168,
    0x617E: f_617E, 0x61A5: f_61A5, 0x61B1: f_61B1, 0x61BB: f_61BB, 0x61D6: f_61D6, 0x61E1: f_61E1,
    0x624C: f_624C, 0x62D5: f_62D5, 0x62F7: f_62F7, 0x630B: f_630B, 0x631A: f_631A, 0x6328: f_6328,
    0x640B: f_640B, 0x64FA: f_64FA, 0x651D: f_651D, 0x653D: f_653D, 0x6562: f_6562,
    0x6276: f_6276, 0x6065: () => {}, 0x64F0: f_64F0, 0x64F5: f_64F5, 0x68F8: f_68F8, 0x68FD: f_68FD, 0x6902: f_6902,
  };
  for (const a in table) def(+a, table[a]);
})(typeof window !== 'undefined' ? window : globalThis);
