/*
 * collision.js - terrain collision for the player, ported from bank 1 ($690B-$78E1).
 *
 * Every 32x32 block of the layout has a 7-byte record in bank 14:
 *   +0 type (b7 solid floor, b6 one-way/platform, b5 has 2nd layer record at +7,
 *            b0-4 special behaviour), +1 angle, +2 ptr heights per column (32 bytes),
 *   +4 ptr widths per row (32 bytes).
 */
(function (G) {
  'use strict';
  const SC = G.SC;
  const { rb, wb, rw, ww, xb, xs, xw, xsw, xbit, xset, xres, bset, bres, def } = SC;
  const R = SC.R;
  const call = SC.call;
  const neg16 = SC.neg16;
  const ABORT = SC.ABORT = { abort: true };

  // ------------------------------------------------------------ $7666 sensor
  // Probe the layout at (x+bc, y+de+18).  Fills $D353 (block id), $D354 (layout
  // address), $D358/$D35A (probe x/y), $D364 (type), $D100 (angle),
  // $D368 (height at column), $D367 (width at row).
  function sensor(bc, de) {
    const saved = rb(0xD12B);
    SC.page2(0x0E);
    const x = (xw(17) + bc) & 0xFFFF;
    ww(0xD358, x);
    const bx = (x >> 5) & 0xFF;
    let y = (xw(20) + de + 0x12) & 0xFFFF;
    if (y & 0x8000) y = 0;
    ww(0xD35A, y);
    const by = (y >> 5) & 0xFF;
    const row = rw((rw(0xD168) + ((by * 2) & 0xFF)) & 0xFFFF);
    const hl = (row + bx + 0xC001) & 0xFFFF;
    if ((hl & 0xF000) !== 0xC000) {
      outside();
    } else {
      ww(0xD354, hl);
      const blk = rb(hl);
      wb(0xD353, blk);
      let rec = rw((rw(0xD2E0) + blk * 2) & 0xFFFF);
      let t = rb(rec);
      wb(0xD364, t);
      if ((t & 0x20) && xb(37) !== 0) { rec += 7; wb(0xD364, rb(rec)); }
      wb(0xD100, rb(rec + 1));
      const pa = rw(rec + 2);
      wb(0xD368, rb(pa + (x & 0x1F)));
      const pb = rw(rec + 4);
      wb(0xD367, rb(pb + (y & 0x1F)));
      SC.regB = pb >> 8;   // leaks into $7010 in the original
    }
    SC.page2(saved);
  }
  function outside() {
    ww(0xD354, 0xCFFF);
    wb(0xD353, 0xFF);
    wb(0xD364, 0); wb(0xD367, 0); wb(0xD368, 0);
  }
  SC.sensor = sensor;
  // $7725: probe for items (rings/monitor blocks) - type only
  function sensorType(bc, de) {
    const saved = rb(0xD12B);
    SC.page2(0x0E);
    const x = (xw(17) + bc) & 0xFFFF;
    ww(0xD358, x);
    const bx = x >> 5;
    let y = (xw(20) + de + 0x12) & 0xFFFF;
    if (y & 0x8000) y = 0;
    ww(0xD35A, y);
    const by = (y >> 5) & 0xFF;
    const row = rw((rw(0xD168) + ((by * 2) & 0xFF)) & 0xFFFF);
    const hl = (row + bx + 0xC001) & 0xFFFF;
    if ((hl & 0xF000) !== 0xC000) {
      outside();
      SC.page2(saved);
      return 0;
    }
    ww(0xD354, hl);
    const blk = rb(hl);
    wb(0xD353, blk);
    const rec = rw((rw(0xD2E0) + blk * 2) & 0xFFFF);
    wb(0xD364, rb(rec));
    SC.page2(saved);
    return rb(0xD364);
  }
  SC.sensorType = sensorType;

  // ------------------------------------------------------------ $690B
  function f_690B() {
    if (f_691A() === ABORT) return;
    f_715E();
    f_73C9();
    f_753E();
    return call(0x64CB);
  }
  function f_691A() {
    wb(0xD36A, rb(0xD369));
    wb(0xD369, 0);
    wb(0xD497, rb(0xD36B));
    let de = 0;
    const a = xb(1);
    if (a === 0x21) de = 0xFFF2;
    else if (a === 0x12) de = 0x0008;
    sensor(0, de);
    wb(0xD36B, rb(0xD353));
    wb(0xD36D, rb(0xD353));
    f_6F61();
    const t = rb(0xD364);
    wb(0xD36C, t);
    return special(t & 0x1F);
  }

  // ------------------------------------------------------------ floor
  function f_6F61() {
    const a = rb(0xD36C);           // block type seen on the previous frame
    if (a & 0x80) return floorSolid();
    if (a & 0x40) return floorPlatform();
  }
  function floorSolid() {
    if (xbit(25, 7)) return;        // moving up
    if ((rb(0xD368) & 0x3F) === 0x20) f_7056();
    const c = rb(0xD35A) & 0x1F;
    let a = rb(0xD368);
    if (a & 0x40) a = (rb(0xD36C) & 0x1F) === 0x1C ? 0x20 : rb(0xD368);
    a = ((a & 0x3F) + c) & 0xFF;
    if (a < 0x20) return;
    a -= 0x20;
    ww(0xD514, (rw(0xD514) - a) & 0xFFFF);
    landed();
  }
  function landed() {
    xset(34, 1);
    call(0x64CB);
    wb(0xD369, rb(0xD100));
  }
  function floorPlatform() {
    if (xbit(36, 0) && xb(2) === 0x14) return;
    if (xbit(36, 1)) return f_7010();
    if (xbit(25, 7)) return;
    if ((rb(0xD368) & 0x3F) === 0) f_7056();
    xres(34, 1);
    const b = (xb(25) + 9) & 0xFF;
    const c = rb(0xD35A) & 0x1F;
    let a = (rb(0xD368) + c) & 0xFF;
    if (a < 0x20) return;
    a -= 0x20;
    if (a >= b) return;
    ww(0xD514, (rw(0xD514) - a) & 0xFFFF);
    landed();
  }
  function f_7010() {
    if (xbit(25, 7)) return;
    xres(34, 1);
    ww(0xD35A, (rw(0xD35A) + 4) & 0xFFFF);
    const c = rb(0xD35A) & 0x1F;
    let a = (rb(0xD368) + c) & 0xFF;
    if (a < 0x20) return;
    a -= 0x20;
    if (a >= (SC.regB | 0)) return;
    let hl = (rw(0xD514) - a) & 0xFFFF;
    hl = (hl + rb(0xD3BC)) & 0xFFFF;
    ww(0xD514, hl);
    landed();
  }
  // $7056: surface continues into the block above
  function f_7056() {
    const saved = rb(0xD12B);
    SC.page2(0x0E);
    const hl = (rw(0xD354) + rw(0xD16A)) & 0xFFFF;
    const blk = rb(hl);
    let rec = rw((rw(0xD2E0) + blk * 2) & 0xFFFF);
    if ((rb(rec) & 0x20) && xb(37) !== 0) rec += 7;
    const t = rb(rec);
    if (t & 0x40) {
      if ((t & 0x1F) !== 0x09) {
        const h = rb(rw(rec + 2) + (rb(0xD358) & 0x1F)) & 0x3F;
        if (h) wb(0xD368, (h + 0x20) & 0xFF);
      }
    } else if (t & 0x80) {
      wb(0xD100, rb(rec + 1));
      const h = rb(rw(rec + 2) + (rb(0xD358) & 0x1F)) & 0x3F;
      if (h) xsw(20, (xw(20) - h) & 0xFFFF);
    }
    SC.page2(saved);
  }

  // ------------------------------------------------------------ walls
  function f_715E() {
    bres(0xD522, 2); bres(0xD522, 3);
    f_716B();
    return f_7210();
  }
  function f_716B() {
    sensor(rw(0xD49C), rw(0xD49E));
    if (f_73A7()) return;
    const t = rb(0xD364) & 0x1F;
    if (t === 0x05) return f_7306();
    if (t === 0x0D) return f_72B6();
    if (t === 0x13) return f_7357();
    if (t === 0x16) return f_736B();
    if (t === 0x1E && (rb(0xD137) & 0x08)) {
      const b = rb(0xD2C8) === 1 ? 0x5E : 0x55;
      if (rb(0xD506) === b) xs(2, 0x34);
    }
    if (!(rb(0xD364) & 0x80)) return;
    return f_71B8();
  }
  function f_71B8() {
    let a = rb(0xD367);
    let bc;
    if (!(a & 0x40)) {
      a &= 0x3F;
      if (!a) return;
      const x = rb(0xD358) & 0x1F;
      if (x >= a) return;
      bc = x;
    } else {
      a &= 0x3F;
      if (!a) return;
      const c = a;
      let hl = (rw(0xD358) + 0x20) & 0xFFE0;
      let t = hl - c;
      const borrow = t < 0 ? 1 : 0;
      const de = t & 0xFFFF;
      t = rw(0xD358) - de - borrow;
      if (t < 0) return;
      bc = t & 0xFFFF;
    }
    ww(0xD511, (rw(0xD511) - bc) & 0xFFFF);
    xset(34, 2);
    call(0x64CB);
    if ((rb(0xD364) & 0x1F) !== 0x0A) return;
    if (rb(0xD501) === 0x11) return;
    return call(0x4868, 0xFA00);
  }
  function f_7210() {
    sensor(rw(0xD498), rw(0xD49A));
    if (f_73B8()) return;
    const t = rb(0xD364) & 0x1F;
    if (t === 0x05) return f_7329();
    if (t === 0x0D) return f_72DD();
    if (t === 0x13) return f_7357();
    if (t === 0x16) return f_7389();
    if (t === 0x1E && (rb(0xD137) & 0x04)) {
      const b = rb(0xD2C8) === 1 ? 0x5E : 0x55;
      if (rb(0xD506) === b) xs(2, 0x34);
    }
    if (!(rb(0xD364) & 0x80)) return;
    return f_725D();
  }
  function f_725D() {
    let a = rb(0xD367);
    let bc;
    if (!(a & 0x40)) {
      a &= 0x3F;
      if (!a) return;
      const x = rb(0xD358) & 0x1F;
      if (x >= a) return;
      bc = (a - x - 1) & 0xFF;
    } else {
      a &= 0x3F;
      if (!a) return;
      const c = a;
      const hl = ((rw(0xD358) + 0x20) & 0xFFE0) - 1;
      const t = hl - rw(0xD358);
      if (t < 0) return;
      if ((t & 0xFF) >= c) return;
      bc = t & 0xFFFF;
    }
    ww(0xD511, (rw(0xD511) + bc) & 0xFFFF);
    xset(34, 3);
    call(0x64CB);
    if ((rb(0xD364) & 0x1F) !== 0x0A) return;
    if (rb(0xD501) === 0x11) return;
    return call(0x4849, 0x0600);
  }
  const absHi = () => { let a = rb(0xD517); if (a & 0x80) a = (-a) & 0xFF; return a; };
  // breakable walls (rolling into them fast)
  function f_72B6() {
    if (!xbit(3, 1)) return f_71B8();
    if (absHi() < 3) return f_71B8();
    const hl = rw(0xD516);
    if ((hl >> 8) < 7) ww(0xD516, (hl + 0x40) & 0xFFFF);
    return f_7898();
  }
  function f_72DD() {
    if (!xbit(3, 1)) return f_725D();
    if (absHi() < 3) return f_725D();
    const hl = rw(0xD516);
    if (((-(hl >> 8)) & 0xFF) < 7) ww(0xD516, (hl + 0xFFC0) & 0xFFFF);
    return f_7898();
  }
  // spikes on walls
  function f_7306() {
    if ((rb(0xD353) & 0xFE) !== 0xF2) {
      const st = rb(0xD502);
      if (st === 0x17) return f_72B6();
      if (st === 0x1E) return;
    }
    f_71B8();
    call(0x64CB);
    if (rb(0xD353) !== 0xF4) return;
    return f_7349();
  }
  function f_7329() {
    if ((rb(0xD353) & 0xFE) !== 0xF2) {
      const st = rb(0xD502);
      if (st === 0x17) return f_72DD();
      if (st === 0x1E) return;
    }
    f_725D();
    call(0x64CB);
    if (rb(0xD353) !== 0xF5) return;
    return f_7349();
  }
  function f_7349() {
    if (xbit(3, 7)) return;
    ww(0xD518, 0x0100);
    return call(0x48F7);
  }
  function f_7357() {
    wb(0xD36D, rb(0xD353));
    const a = rb(0xD353);
    if (a === 0x81 || a === 0x82) return f_6D4F();
  }
  // monitors hit from the side
  function f_736B() {
    const s = rb(0xD501);
    if (s === 0x0F || s === 0x15) return f_71B8();
    if (!xbit(3, 1)) return f_71B8();
    if (rb(0xD519) & 0x80) return f_71B8();
    return f_7857();
  }
  function f_7389() {
    const s = rb(0xD501);
    if (s === 0x0F || s === 0x15) return f_725D();
    if (!xbit(3, 1)) return f_725D();
    if (rb(0xD519) & 0x80) return f_725D();
    return f_7857();
  }
  // layer switches for loops ($A1/$A2 blocks)
  function f_73A7() {
    if (rb(0xD353) !== 0xA1) return false;
    if (xb(37) === 0) return false;
    xs(37, 0);
    return true;
  }
  function f_73B8() {
    if (rb(0xD353) !== 0xA2) return false;
    if (xb(37) !== 0) return false;
    xs(37, 1);
    return true;
  }

  // ------------------------------------------------------------ ceiling
  function f_73C9() {
    xres(34, 0);
    if (rb(0xD3C0) === 0) {
      if (xbit(34, 1)) return;
      if (!xbit(25, 7)) return;
    }
    sensor(0, 0xFFE8);
    const b = rb(0xD364);
    const t = b & 0x1F;
    if (t === 0x0D) return f_7464();
    if (t === 0x15) return f_748F();
    if (t === 0x14) return f_749D();
    if (t === 0x13) return f_752F();
    if (t === 0x05) return f_74E7();
    if (t === 0x1C) return f_746E();
    if (!(b & 0x80)) return;
    if ((rw(0xD35A) & 0xFFE0) === (rw(0xD514) & 0xFFE0)) return;
    return f_742C();
  }
  function f_742C() {
    const c = rb(0xD35A) & 0x1F;
    const b = rb(0xD368);
    let a = b & 0x3F;
    if (!a) return;
    if (!(b & 0x40)) a = 0x20;
    if (a < c) return;
    a -= c;
    xsw(20, (xw(20) + a) & 0xFFFF);
    xset(34, 0);
    call(0x64CB);
    return f_7459();
  }
  function f_7459() { ww(0xD518, 0x0100); xres(34, 0); }
  function f_7464() {
    if (rb(0xD3C0) === 0) return f_7898();
    return call(0x4984);
  }
  function f_746E() {
    let a = rb(0xD368);
    if (!(a & 0x40)) a = 0x20;
    a &= 0x3F;
    const hl = (rw(0xD35A) & 0xFFE0) + a;
    if (hl - rw(0xD514) >= 0) return;
    return f_742C();
  }
  function f_748F() {
    ww(0xD518, 0x0780);
    wb(0xDE04, 0xA6);
    return call(0x47FB);
  }
  function ceilPush() {
    const c = rb(0xD35A) & 0x1F;
    const b = rb(0xD368);
    let a = b & 0x3F;
    if (!a) return false;
    if (a !== 0x20 && !(b & 0x40)) return false;
    if (a < c) return false;
    a -= c;
    xsw(20, (xw(20) + a) & 0xFFFF);
    xset(34, 0);
    call(0x64CB);
    return true;
  }
  function f_749D() {
    if ((rb(0xD353) & 0xFE) !== 0x3A) return;
    if (!ceilPush()) return;
    ww(0xD518, 0x0580);
    ww(0xD516, 0x0400);
    wb(0xDE04, 0xA6);
    return call(0x47FB);
  }
  function f_74E7() {
    if (!ceilPush()) return;
    if (xb(1) === 0x1E) return;
    if ((rb(0xD353) & 0xFE) !== 0x3E) return f_7459();
    if (xbit(3, 7)) return f_7459();
    return call(0x48F7);
  }
  function f_752F() {
    if (rb(0xD353) !== 0x80) return;
    wb(0xD36D, rb(0xD353));
    return f_6D4F();
  }

  // ------------------------------------------------------------ items in the layout
  function f_753E() {
    const de = xbit(7, 0) ? 0xFFF0 : 0xFFE6;
    wb(0xD442, rb(0xD441));
    const a = sensorType(0, de);
    wb(0xD441, a);
    const t = a & 0x1F;
    if (t === 0x07) return f_756F();
    if (t === 0x1D) return f_760C();
    if (t === 0x1A) return f_7646();
    return f_749D();
  }
  // Replace a layout block (the original also redraws it in VRAM).
  function setBlock(addr, blk) {
    wb(addr, blk);
    if (SC.onBlockChanged) SC.onBlockChanged(addr - 0xC001, blk);
  }
  SC.setBlock = setBlock;
  // rings: blocks $40.. hold up to 4 rings (one per 16x16 quarter)
  function f_756F() {
    SC.page2(rb(0xD162));
    const a = (rb(0xD353) - 0x40) & 0xFF;
    wb(0xD352, a);
    let hl = 0x75DC + a * 4;
    hl += (rb(0xD358) >> 4) & 1;
    hl += (rb(0xD35A) >> 3) & 2;
    hl &= 0xFFFF;
    if (rb(hl) === 0) return;
    const nb = rb(hl + 0x18);
    setBlock(rw(0xD354), nb);
    ww(0xD35C, rw(0xD358));
    ww(0xD35E, rw(0xD35A));
    call(0x5E9C, 0x03, 0x00);           // sparkle
    wb(0xDE04, 0xBF);
    return call(0x3138);
  }
  function f_760C() {
    SC.page2(rb(0xD162));
    setBlock(rw(0xD354), 0x46);
    ww(0xD35C, rw(0xD358));
    ww(0xD35E, rw(0xD35A));
    call(0x5E9C, 0x03, 0x00);
    wb(0xDE04, 0xBF);
    return call(0x4AC2);
  }
  function f_7646() {
    if (!xbit(34, 1)) return;
    ww(0xD373, 0x0700);
    ww(0xD516, 0x0700);
    xset(3, 1); xres(3, 0);
    xs(2, 0x10);
    wb(0xDE04, 0xBD);
  }
  // monitor broken: block -> $46, spawn the monitor contents object
  function f_7857() {
    wb(0xD3B3, 0x01);
    SC.page2(rb(0xD162));
    setBlock(rw(0xD354), 0x46);
    const de = ((rb(0xD358) & 0xE0) + 0x10) | (rw(0xD358) & 0xFF00);
    const hl = ((rb(0xD35A) & 0xE0) + 0x08) | (rw(0xD35A) & 0xFF00);
    call(0x5EB7, 0x0F, 0x40, de, hl);
    return call(0x4AC2);
  }
  // breakable block smashed: block -> $9D, 4 fragments
  function f_7898() {
    SC.page2(rb(0xD162));
    setBlock(rw(0xD354), 0x9D);
    ww(0xD35C, rw(0xD358) & 0xFFE0);
    ww(0xD35E, rw(0xD35A) & 0xFFE0);
    call(0x5E9C, 0x07, 0x00);
    call(0x5E9C, 0x07, 0x01);
    call(0x5E9C, 0x07, 0x02);
    return call(0x5E9C, 0x07, 0x03);
  }

  // ------------------------------------------------------------ special block types
  function special(t) {
    switch (t) {
      case 0: xres(36, 0); xres(36, 1); return f_6C4D();
      case 1: return f_6A5D();
      case 5: return f_6ACE();
      case 6: case 7: return f_6C4D();
      case 9: return f_6A75();
      case 11: return f_6BAA();
      case 12: return f_6B79();
      case 13: return f_6B2C();
      case 14: return f_6B56();
      case 16: return f_6C82();
      case 18: return f_69B2();
      case 19: return f_6D43();
      case 20: return f_6A90();
      case 22: return f_6AE3();
      case 23: return f_6E56();
      case 25: xset(36, 0); wb(0xD3BC, (rb(0xD3BC) + 1) & 0xFF); return;
      case 27:
        xset(36, 1);
        if (rb(0xD12F) & 3) return;
        wb(0xD3BC, (rb(0xD3BC) + 1) & 0xFF);
        return;
      default: return;  // 2,3,4,8,10,15,17,21,24,26,28,29,30: nothing
    }
  }
  function f_6C4D() {
    if (!xbit(33, 5)) {
      xres(34, 1);
      const s = rb(0xD501);
      if (s === 0x18 || s === 0x11) return;
    }
    return f_6C6A();
  }
  function f_6C6A() {
    call(0x64CB);
    if (xbit(35, 1)) return;
    if (xbit(3, 0)) return;
    if (xb(1) !== 0x09) return call(0x463C);
    return call(0x4699);
  }
  function f_6A5D() {
    if (rb(0xD297) !== 0x05) return;
    if (rb(0xD36B) !== 0x0B) return;
    if (rb(0xD3F7) !== 0) return;
    return call(0x5E9C, 0x3A, 0x00);
  }
  // spikes
  function f_6ACE() {
    if ((rb(0xD36B) & 0xFE) === 0xF4) return;
    if (!xbit(34, 1)) return;
    if (xbit(3, 7)) return;
    return call(0x48F7);
  }
  // spring (vertical)
  function f_6A75() {
    if (rb(0xD501) === 0x11) return;
    if (!xbit(34, 1)) return;
    if (xb(25) & 0x80) return;
    wb(0xD448, 0xFF);
    return call(0x480C, 0xF880);
  }
  // diagonal spring
  function f_6A90() {
    if (rb(0xD501) === 0x11) return;
    if (!xbit(34, 1)) return;
    let hl = 0x0400;
    xres(4, 4);
    if (rb(0xD36B) >= 0x38) { hl = 0xFC00; xset(4, 4); }
    xsw(22, hl);
    const vy = rb(0xD297) === 0 ? 0xF900 : 0xFA80;
    wb(0xDE04, 0xA6);
    wb(0xD448, 0);
    return call(0x482D, vy);
  }
  // monitor hit from above
  function f_6AE3() {
    if (!xbit(3, 1)) return;
    const s = rb(0xD501);
    if (s === 0x0F || s === 0x10 || s === 0x15 || s === 0x1A) return;
    if (!(rb(0xD522) & 0x0C)) {
      if (rb(0xD519) & 0x80) return;
    }
    ww(0xD518, 0xFBC0);
    xres(34, 1);
    xset(3, 0);
    return f_7857();
  }
  // crumbling block
  function f_6BAA() {
    if (!xbit(34, 1)) return;
    f_6BD4(0xB2);
    call(0x5E9C, 0x37, 0x01);
    ww(0xD35C, rw(0xD358));
    SC.ysw(52, rw(0xD358));
    ww(0xD35E, rw(0xD35A));
    SC.ysw(54, rw(0xD35A));
  }
  function f_6BD4(c) {
    const saved = rb(0xD12B);
    SC.page2(rb(0xD162));
    setBlock(rw(0xD354), c);
    SC.page2(saved);
    return f_6C6A();
  }
  function f_6B79() {
    if (xbit(25, 7)) return;
    ww(0xD518, 0);
    if (rw(0xD354) === rw(0xD356)) return;
    call(0x5EB7, 0x13, 0x00, rw(0xD358), rw(0xD35A));
    ww(0xD356, rw(0xD354));
    SC.ysw(48, rw(0xD354));
  }
  function f_6B2C() {
    const s = rb(0xD501);
    if (s === 0x0F || s === 0x10 || s === 0x15 || s === 0x1A) return;
    if (!xbit(3, 1)) return;
    wb(0xD3B2, 0x10);
    ww(0xD518, 0xFBC0);
    xres(34, 1);
    xset(3, 0);
    return f_7898();
  }
  // conveyor
  function f_6B56() {
    if (!xbit(34, 1)) return;
    const sum = rw(0xD510) + 0xFF00;
    ww(0xD510, sum & 0xFFFF);
    xs(18, (0xFF + (sum > 0xFFFF ? 1 : 0) + xb(18)) & 0xFF);
  }
  // loop layer switching
  function f_6C82() {
    const a = rb(0xD36B);
    if (a === 0x83) return;
    const i = (a - 0x48) & 0xFF;
    if (a < 0x48) return;
    if (i === 8 || i === 9) {
      if (xb(37) === 0) return;
      if (!xbit(34, 1)) return;
      if (rb(0xD497) === 0x52) return call(0x3EE1);
      return;
    }
    if (i === 10) {
      if (xb(37) !== 0) return;
      if (!xbit(34, 1)) return;
      const p = rb(0xD497);
      if (p === 0x51) return call(0x3EAB);
      if (p === 0x57) return call(0x3EF7);
    }
  }
  // ramps that throw Sonic in the air
  function f_69B2() {
    if (xbit(25, 7)) return;
    if (rb(0xD36A) !== 0) {
      if (xb(1) === 0x1B) return;
      if (xw(22) === 0) return;
      const a = xb(35);
      if (!xbit(23, 7)) { if (!(a & 2)) return; }
      else { if (a & 2) return; }
      return f_6A18();
    }
    call(0x64CB);
    if (!xbit(35, 1)) return;
    const b = rb(0xD36B);
    if (b === 0x1F || b >= 0x22) xsw(22, (xw(22) + 0xFC00) & 0xFFFF);
    else xsw(22, (xw(22) + 0x0400) & 0xFFFF);
    return call(0x47DC);
  }
  function f_6A18() {
    let hl = xw(22);
    if (hl & 0x8000) hl = neg16(hl);
    hl = (hl + (hl >> 1) - 1) & 0xFFFF;
    ww(0xD518, (~hl) & 0xFFFF);
    wb(0xDE04, 0xA2);
    return call(0x47FB);
  }
  // tubes
  function f_6D43() {
    if (rb(0xD353) === 0x80) return;
    wb(0xD36D, rb(0xD36B));
    return f_6D4F();
  }
  function f_6D4F() {
    xres(34, 1);
    xset(3, 0);
    const a = rb(0xD353);
    let vx, vy;
    if (a === 0x7F) {
      if (xb(1) === 0x21) return;
      if (xbit(25, 7)) return;
      vx = 0; vy = 0x0600;
    } else if (a === 0x80) {
      if (xb(1) === 0x21) return;
      if (!xbit(25, 7)) return;
      vx = 0; vy = 0xFA00;
    } else if (a === 0x81) {
      if (xb(1) === 0x21) return;
      if (xbit(23, 7)) return;
      if ((xb(20) & 0x1F) >= 0x10) return;
      vx = 0x0600; vy = 0;
    } else if (a === 0x82) {
      if (xb(1) === 0x21) return;
      if ((xb(20) & 0x1F) >= 0x10) return;
      if (xb(1) !== 0x18 && xw(22) !== 0 && !xbit(23, 7)) return;
      vx = 0xFA00; vy = 0;
    } else return;
    f_6E4A();
    wb(0xDE04, 0xA5);
    xs(2, 0x21);
    xsw(24, vy);
    xsw(22, vx);
  }
  function f_6E4A() {
    if (rb(0xD501) !== 0x11) return;
    call(0x189B);
    SC.waitFrame();
  }
  // vertical loops
  function f_6E56() {
    const a = rb(0xD36B);
    wb(0xD36D, a);
    if (a === 0x59 || a === 0x5C) return loopRight();
    if (a === 0x73 || a === 0x72 || a === 0x6B) return loopLeft();
  }
  const LOOP_STATES = [0x05, 0x06, 0x09, 0x10, 0x1A];
  function loopRight() {
    wb(0xDE04, 0xA5);
    if (xbit(23, 7)) return;
    if (rb(0xD297) === 0x03) {
      if (xw(22) < 0x0500) xsw(22, 0x0500);
    } else if (xw(22) < 0x0300) return;
    const s = xb(1);
    if (s === 0x22 || LOOP_STATES.indexOf(s) < 0) return;
    xs(2, 0x22);
    xs(11, ((xw(22) << 5) >> 8) & 0xFF);
    xs(10, 0x40);
    xs(56, rb(0xD297) === 0x03 ? 0x02 : 0x00);
  }
  function loopLeft() {
    wb(0xDE04, 0xA5);
    if (!xbit(23, 7)) return;
    if (xw(22) >= 0xFD00) return;
    const s = xb(1);
    if (s === 0x22 || LOOP_STATES.indexOf(s) < 0) return;
    xs(2, 0x22);
    xs(11, ((neg16(xw(22)) << 5) >> 8) & 0xFF);
    xs(10, 0xC0);
    xs(56, rb(0xD297) === 0x03 ? 0x03 : 0x01);
  }

  // ------------------------------------------------------------ $77CB objects vs terrain
  function f_77CB() {
    xres(34, 1);
    sensor(0, 0);
    f_70E7();
    const t = rb(0xD364) & 0x1F;
    if (t === 0) {
      if (xbit(3, 0)) return;
      xset(3, 4);
      return;
    }
    if (t === 14) {
      if (!xbit(34, 1)) return;
      const d = rb(0xD353) === 0xF0 ? 0xFF00 : 0x0100;
      xsw(17, (xw(17) + d) & 0xFFFF);
    }
  }
  function f_70E7() {
    const t = rb(0xD364);
    if (t & 0x80) {
      if ((rb(0xD368) & 0x3F) === 0x20) f_7056();
      const c = rb(0xD35A) & 0x1F;
      let a = ((rb(0xD368) & 0x3F) + c) & 0xFF;
      if (a < 0x20) return;
      a -= 0x20;
      xsw(20, (xw(20) - a) & 0xFFFF);
      xset(34, 1);
      return;
    }
    if (t & 0x40) {
      if (xbit(25, 7)) return;
      if ((rb(0xD368) & 0x3F) === 0) f_7056();
      const b = (xb(25) + 7) & 0xFF;
      const c = rb(0xD35A) & 0x1F;
      let a = (rb(0xD368) + c) & 0xFF;
      if (a < 0x20) return;
      a -= 0x20;
      if (a >= b) return;
      xsw(20, (xw(20) - a) & 0xFFFF);
      xset(34, 1);
    }
  }
  // $6C1F: replace the block under the probe (used by collapsing floors)
  function f_6C1F(c) {
    const saved = rb(0xD12B);
    SC.page2(rb(0xD162));
    setBlock(rw(0xD354), c);
    SC.page2(saved);
  }

  const table = {
    0x77CB: f_77CB, 0x70E7: f_70E7, 0x6C1F: f_6C1F,
    0x690B: f_690B, 0x691A: f_691A, 0x6F61: f_6F61, 0x7056: f_7056, 0x715E: f_715E, 0x716B: f_716B,
    0x71B8: f_71B8, 0x7210: f_7210, 0x725D: f_725D, 0x73C9: f_73C9, 0x742C: f_742C, 0x7459: f_7459,
    0x753E: f_753E, 0x7666: sensor, 0x7725: sensorType, 0x7857: f_7857, 0x7898: f_7898,
    0x6C6A: f_6C6A, 0x6D4F: f_6D4F, 0x6A18: f_6A18,
  };
  for (const a in table) def(+a, table[a]);
})(typeof window !== 'undefined' ? window : globalThis);
