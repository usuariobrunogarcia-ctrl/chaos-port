/*
 * misc.js - small bank-0 helpers: score, rings, lives, HUD digits, music requests, math.
 */
(function (G) {
  'use strict';
  const SC = G.SC;
  const { rb, wb, rw, ww, def } = SC;

  // BCD add with carry in/out (add a,(hl) / adc ; daa)
  function bcdAdc(a, b, cin) {
    let lo = (a & 0x0F) + (b & 0x0F) + cin, hi = (a >> 4) + (b >> 4);
    if (lo > 9) { lo -= 10; hi++; }
    let cout = 0;
    if (hi > 9) { hi -= 10; cout = 1; }
    return [((hi << 4) | lo) & 0xFF, cout];
  }

  // $262F: add 3-byte BCD score at hl
  function f_262F(hl) {
    if (rb(0xD292) !== 0) return;
    ww(0xD2A0, rw(0xD29D));
    wb(0xD2A2, rb(0xD29F));
    let c = 0, r;
    for (let i = 0; i < 3; i++) {
      [r, c] = bcdAdc(rb(0xD29D + i), rb(hl + i), c);
      wb(0xD29D + i, r);
    }
    if (c) { wb(0xD2A3, 0x90); wb(0xD2A4, 0x99); wb(0xD2A5, 0x99); wb(0xD2BB, 0x02); }
    else wb(0xD2BB, 0x01);
    return f_266F();
  }
  function mod3(a) { if (!a) return 0; while (a >= 3) a -= 3; return a; }
  function f_266F() {
    const b = rb(0xD29E) & 0xF0;
    if ((rb(0xD2A1) & 0xF0) === b) return;
    if (rb(0xD2C8) === 1) {
      const a = rb(0xD29E) & 0xF0;
      if (a === 0 || a === 0x50) return f_26BD();
      return;
    }
    const e = mod3((rb(0xD29E) >> 4) & 0x0F);
    const d = mod3(rb(0xD29F) & 0x0F);
    let a = mod3((rb(0xD29F) >> 4) & 0x0F);
    a = mod3((a + e + d) & 0xFF);
    if (a === 0) return f_26BD();
  }
  function f_26BD() {
    const b = rb(0xD2C3);
    wb(0xD2C3, (b & 0x80) | ((b + 1) & 0x7F));
  }
  // $2605: hl / e -> hl (quotient), a = remainder
  function f_2605(hl, e) {
    let a = 0;
    for (let b = 0; b < 16; b++) {
      const top = (hl >> 15) & 1;
      hl = (hl << 1) & 0xFFFF;
      a = ((a << 1) | top) & 0xFF;
      if (a >= e) { a -= e; hl |= 1; }
    }
    SC.regA = a;
    return hl;
  }
  // $3104: extra life
  function f_3104() {
    wb(0xDE04, 0xA9);
    const a = rb(0xD299);
    if (a !== 0x99) wb(0xD299, SC.bcdAdd(a, 1));
    return f_3116();
  }
  function f_3116() {
    if (rb(0xD292) !== 0) return;
    const l = rb(0xD299);
    wb(0xDBA9, (((l & 0x0F) << 1) & 0x1E) + 0x2E);
    wb(0xDBAB, (((l & 0xF0) >> 3) & 0x1E) + 0x2E);
  }
  // $3138: +1 ring
  function f_3138() {
    const a = SC.bcdAdd(rb(0xD29A), 1);
    wb(0xD29A, a);
    if (a === 0) { f_3104(); f_178F(); }
    return f_314A();
  }
  function f_314A() {
    if (rb(0xD292) !== 0) return;
    if (rb(0xD297) === 0x06 && rb(0xD298) === 0x02) return;
    const r = rb(0xD29A);
    wb(0xDBB1, ((r >> 3) & 0x1E) + 0x2E);
    wb(0xDBB3, ((r << 1) & 0x1E) + 0x2E);
  }
  function f_178F() {
    if (rb(0xD2C8) !== 1) return;
    if (rb(0xD297) >= 0x06) return;
    if ((rb(0xD2CC) & 0x1F) === 0x1F) return;
    wb(0xD2BE, 0);          // $1753
    wb(0xD294, 0x88);
    wb(0xD2CD, 0x01);
  }
  // $189B: restart the level music
  function f_189B() {
    if (rb(0xD4A3) !== 0) return;
    const i = rb(0xD297) * 3 + rb(0xD298);
    const m = rb(0x18BA + i);
    wb(0xDE04, m);
    wb(0xD4A4, m);
  }
  function f_1C6F(a) { SC.page2(a); }

  const table = {
    0x262F: f_262F, 0x266F: f_266F, 0x2605: f_2605, 0x3104: f_3104, 0x3116: f_3116, 0x3138: f_3138,
    0x314A: f_314A, 0x178F: f_178F, 0x189B: f_189B, 0x1C6F: f_1C6F,
    0x1753: () => wb(0xD2BE, 0), 0x1758: () => { wb(0xD2BE, 0xFF); wb(0xD2C2, 0); },
  };
  for (const a in table) def(+a, table[a]);
})(typeof window !== 'undefined' ? window : globalThis);
