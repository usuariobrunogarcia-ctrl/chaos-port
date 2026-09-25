/*
 * level.js - level start ($2934 and friends), the per-frame interrupt work
 * (input, camera copy, animated graphics, Sonic's art, sprites, timer) and the
 * main loop step ($16B8).
 */
(function (G) {
  'use strict';
  const SC = G.SC;
  const { rb, wb, rw, ww, bset, bres, call } = SC;
  const R = SC.R;

  // ------------------------------------------------------------ level start
  SC.initGame = function () {
    SC.ram.fill(0);
    wb(0xD299, 0x03);      // lives
    wb(0xD2C8, 0x01);      // playing as Sonic
    wb(0xD2CC, 0x00);
    SC.initLevel(0, 0);
  };
  SC.initLevel = function (level, act) {
    // keep lives/score, clear the rest of the level state
    const keep = {};
    for (const a of [0xD299, 0xD29D, 0xD29E, 0xD29F, 0xD2C3, 0xD2C8, 0xD2CC]) keep[a] = rb(a);
    SC.ram.fill(0);
    for (const a in keep) wb(+a, keep[a]);
    wb(0xD297, level); wb(0xD298, act);
    SC.bank[1] = 1;
    // $297E
    for (let a = 0xD300; a <= 0xDBBF; a++) wb(a, 0);
    loadTiles();                     // $78E1
    initHud();                       // $2993
    for (let a = 0xD15E; a <= 0xD290; a++) wb(a, 0);   // $4FCE
    loadHeaders();                   // $4FDC
    loadLayout();                    // $4DAD
    f_2A4F();
    // $2951
    wb(0xD500, rb(0xD2C8));
    // $79F2: block fragments art
    SC.page2(0x0E);
    const p = rw(0xA3A0 + rb(0xD297) * 2);
    SC.decompArt(0x0CC0, p, 0);
    wb(0xD2BF, 0); wb(0xD2C0, 0);
    wb(0xD2BE, 0xFF);                // timer running
    // $1679..: HUD, music, palettes, camera on
    call(0x3116); call(0x314A);
    hudTime();
    call(0x189B);
    setPalettes();
    bset(0xD15E, 7);                 // $59B3
    wb(0xD293, 0x40);
    SC.fade = 0;
    SC.levelDone = 0;
    SC.deathTimer = 0;
    SC.frameCount = 0;
    SC.sprites = [];
    SC.onLevelLoaded && SC.onLevelLoaded();
  };

  function loadTiles() {
    SC.vramFill(0, 0x4000, 0);
    const i = rb(0xD297) * 3 + rb(0xD298);
    let iy = 0x7CED + i * 7;
    SC.page2(rb(iy));
    SC.decompArt(rw(iy + 1), rw(iy + 3), 0);
    iy = rw(iy + 5);
    while (rb(iy) !== 0xFF) {
      const b = rb(iy);
      SC.page2(b & 0x1F);
      SC.decompArt(rw(iy + 1), rw(iy + 3), b & 0x80);
      iy += 5;
    }
  }
  function initHud() {
    let hl = 0x29C4;
    for (let k = 0; k < 12; k++) {
      wb(0xDB34 + k, rb(hl));
      wb(0xDBA8 + k * 2, rb(hl + 1));
      wb(0xDBA9 + k * 2, rb(hl + 2));
      hl += 3;
    }
  }
  function loadHeaders() {
    const lv = rb(0xD297), act = rb(0xD298);
    const iy = rw(rw(0x5082 + lv * 2) + act * 2);
    const ix = 0xD15E;
    wb(ix + 4, rb(iy)); ww(ix + 6, rw(iy + 1));
    wb(ix + 5, rb(iy + 3)); ww(ix + 8, rw(iy + 4));
    ww(ix + 14, rw(iy + 6)); ww(ix + 12, rw(iy + 8)); ww(ix + 16, rw(iy + 10));
    ww(0xD280, rw(iy + 12)); ww(0xD27C, rw(iy + 14));
    ww(0xD282, rw(iy + 16)); ww(0xD27E, rw(iy + 18));
    ww(ix + 10, rw(iy + 20));
    // wider/taller views: the right/bottom limits are for the camera's left/top edge
    ww(0xD282, Math.max(rw(0xD280), rw(0xD282) + 256 - SC.VIEW_W));
    ww(0xD27E, Math.max(rw(0xD27C), rw(0xD27E) + 192 - SC.VIEW_H));
    wb(0xD288, 0x68); wb(0xD289, 0x78);
    // Calculate_CameraBounds
    const cx = SC.VIEW_W === 256 ? 0x68 : 0x68 + ((SC.VIEW_W - 256) >> 1);
    wb(0xD28A, cx); wb(0xD28C, cx - 8); wb(0xD28B, cx + 8);
    const cy = SC.camY(0x78);
    wb(0xD28D, cy); wb(0xD28F, cy - 0x10); wb(0xD28E, cy + 0x10);
  }
  function loadLayout() {
    SC.page2(rb(0xD163));
    let iy = rw(0xD166);
    let de = 0xC001;
    while ((de & 0xF000) === 0xC000) {
      const v = rb(iy);
      if (v === 0xFF) {
        const n = rb(iy + 2);
        if (!n) break;
        for (let b = 0; b < n && (de & 0xF000) === 0xC000; b++) wb(de++, rb(iy + 1));
        iy += 3;
      } else { wb(de++, v); iy++; }
    }
    // $4E57: start position
    const lv = rb(0xD297), act = rb(0xD298);
    const p = rw(rw(0x4E98 + lv * 2) + act * 2);
    ww(0xD2D6, rw(p)); ww(0xD2D8, rw(p + 2));
    ww(0xD511, rw(p + 4)); ww(0xD514, rw(p + 6));
    // camera, centred differently for wider views
    let cx = rw(0xD2D6) - ((SC.VIEW_W - 256) >> 1);
    let cy = rw(0xD2D8) - ((SC.VIEW_H - 192) >> 1);
    cx = Math.min(Math.max(cx, rw(0xD280)), rw(0xD282));
    cy = Math.min(Math.max(cy, rw(0xD27C)), rw(0xD27E));
    ww(0xD174, cx); ww(0xD284, cx);
    ww(0xD176, cy); ww(0xD286, cy);
  }
  function f_2A4F() {
    wb(0xD29A, 0);
    let hl = rw(rw(0x2A9A + rb(0xD297) * 2) + rb(0xD298) * 2);
    ww(0xD2E0, rw(hl)); ww(0xD399, rw(hl + 2)); ww(0xD39B, rw(hl + 4));
    wb(0xD452, rb(hl + 6)); wb(0xD45A, rb(hl + 7)); wb(0xD462, rb(hl + 8)); wb(0xD46A, rb(hl + 9));
  }
  function setPalettes() {
    const i = (rb(0xD297) * 3 + rb(0xD298)) * 2;
    SC.page2(0x0E);
    const bg = rb(0x7F3C + i), spr = rb(0x7F3C + i + 1);
    for (let k = 0; k < 16; k++) {
      SC.setCram(k, rb(0xB64D + bg * 16 + k));
      SC.setCram(16 + k, rb(0xB64D + spr * 16 + k));
    }
  }

  // ------------------------------------------------------------ interrupt work
  // joy: bits 0 up 1 down 2 left 3 right 4 button1 5 button2 (1 = pressed)
  SC.vblank = function (joy) {
    // input ($2451)
    for (let a = 0xD146; a > 0xD137; a--) wb(a, rb(a - 1));
    for (let a = 0xD156; a > 0xD147; a--) wb(a, rb(a - 1));
    let held = joy & 0x3F;
    if ((joy & 0x30) === 0x30) held |= 0x80;
    wb(0xD137, held);
    const prev = rb(0xD138);
    const pressed = (held & 0xBF) & ~prev & 0xFF;
    wb(0xD147, pressed); wb(0xD157, pressed);
    // camera copy
    if (rb(0xD15E) & 0x40) {
      bres(0xD15E, 6);
      ww(0xD174, rw(0xD284));
      ww(0xD176, rw(0xD286));
    }
    ringTiles();                   // bank 29 $850A
    sonicArt();                    // $0D15
    buildSprites();                // $220E
    sonicArtCheck();               // $1027
    animatedTiles();               // bank 29 $8000
    timer();                       // $27EE
    wb(0xD12F, (rb(0xD12F) + 1) & 0xFF);
  };
  function ringTiles() {
    if (rb(0xD12F) & 7) return;
    let a = (rb(0xD351) + 1) & 0xFF;
    if (a >= 4) a = 0;
    wb(0xD351, a);
    const dst = rw(0xD39B);
    if (!dst) return;
    SC.page2(0x1D);
    SC.vramFromCpu(dst, (rw(0xD399) + (((a * 32) & 0xFF) * 4)) & 0xFFFF, 0x80);
  }
  const ANIM = [[0x879D, 0x87DD, 0x881D], [0x875D, 0x879D, 0x87DD], [0x879D, 0x875D, 0x879D], [0x875D, 0x879D, 0x87DD]];
  function animatedTiles() {
    for (let s = 0; s < 4; s++) {
      const iy = 0xD452 + s * 8;
      if (rb(iy) !== 1) continue;
      wb(iy + 3, (rb(iy + 3) + 1) & 0xFF);
      if (rb(iy + 3) < 0x0C) continue;
      wb(iy + 3, 0);
      let ph = (rb(iy + 2) + 1) & 0xFF;
      if (ph >= 4) ph = 0;
      wb(iy + 2, ph);
      SC.page2(0x1D);
      const src = ANIM[ph & 3];
      SC.vramFromCpu(0x3480, src[0], 0x40);
      SC.vramFromCpu(0x34C0, src[1], 0x40);
      SC.vramFromCpu(0x3500, src[2], 0x40);
    }
  }
  function sonicArt() {
    const f = rb(0xD34E);
    if ((f & 0xA0) !== 0xA0) return;
    const idx = rb(0xD34F);
    if (idx === 0) { SC.vramFill(0, 0x200, 0); wb(0xD34E, 0); return; }
    const e = (0x104B + idx * 4) & 0xFFFF;
    const bank = rb(e), src = rw(e + 1), n = rb(e + 3);
    SC.page2(bank);
    const mirror = (f & 0x40) !== 0;
    SC.vramFromCpu(0, src, n * 64, mirror);
    if (mirror) wb(0xD34E, 0); else bres(0xD34E, 7);
  }
  function sonicArtCheck() {
    let a = ((rb(0xD504) << 2) & 0x40) | 0x20;
    wb(0xD34E, a);
    if (rb(0xD350) !== a) { wb(0xD350, a); bset(0xD34E, 7); }
    if (rb(0xD34F) !== rb(0xD506)) { wb(0xD34F, rb(0xD506)); bset(0xD34E, 7); }
  }
  function timer() {
    if (rb(0xD2BE) === 0) return;
    let t = (rb(0xD2C2) + 1) & 0xFF;
    wb(0xD2C2, t);
    if (t !== 0x3C) return;
    wb(0xD2C2, 0);
    if (rb(0xD294) & 0x80) return;
    let s = SC.bcdAdd(rb(0xD2BF), 1);
    if (s !== 0x60) { wb(0xD2BF, s); return hudTime(); }
    wb(0xD2BF, 0);
    const m = SC.bcdAdd(rb(0xD2C0), 1);
    wb(0xD2C0, m);
    if (m === 0x10) { wb(0xD44B, 0xC0); wb(0xD2BE, 0); return; }   // 10:00 -> time over
    hudTime();
  }
  function hudTime() {
    wb(0xDBB9, ((rb(0xD2C0) << 1) & 0x1E) + 0x2E);
    wb(0xDBBD, ((rb(0xD2BF) >> 3) & 0x1E) + 0x2E);
    wb(0xDBBF, ((rb(0xD2BF) << 1) & 0x1E) + 0x2E);
  }

  // $220E: build the sprite list (also refreshes every object's screen position)
  function buildSprites() {
    const out = [];
    SC.page2(0x0F);
    for (let k = 0; k < 20; k++) {
      const ix = 0xD500 + k * 0x40;
      R.ix = ix;
      if (rb(ix + 5) === 0) continue;
      if (((rb(ix) - 1) & 0xFF) >= 0xEF) continue;
      let c = rb(ix + 4);
      if (c & 0x20) {
        wb(ix + 46, (rb(ix + 46) + 1) & 0xFF);
        if (rb(ix + 46) & 2) bset(ix + 4, 7); else bres(ix + 4, 7);
        c = rb(ix + 4);
      }
      if (c & 0xC0) continue;
      const sx = (rw(ix + 17) - rw(0xD174)) & 0xFFFF;
      const sy = (rw(ix + 20) - rw(0xD176)) & 0xFFFF;
      ww(ix + 26, sx); ww(ix + 28, sy);
      const n = rb(ix + 5);
      const base = rw(ix + 42);
      const list = rw(ix + 40);
      const flip = (c & 0x10) !== 0;
      const by = (sy + rw(base)) & 0xFFFF;
      let bx = rw(base + 2);
      if (flip) bx = (-bx) & 0xFFFF;
      bx = (sx + bx) & 0xFFFF;
      const xl = flip ? (list + 2 + 0x0D08) & 0xFFFF : (list + 2) & 0xFFFF;
      const tiles = rw(base + 4);
      const tb = flip ? rb(ix + 9) : rb(ix + 8);
      const wx = rw(ix + 17), wy = rw(ix + 20);
      for (let i = 0; i < n; i++) {
        const dy = SC.s16((rw(list + i * 4) + by) & 0xFFFF);
        const dx = SC.s16((rw(xl + i * 4) + bx) & 0xFFFF);
        // world-space position so the renderer can use its own (wider) camera
        out.push({ x: dx - SC.s16(sx) + wx, y: dy - SC.s16(sy) + wy, t: (rb(tiles + i) + tb) & 0xFF, o: k });
      }
    }
    SC.sprites = out;
  }

  // ------------------------------------------------------------ main loop step
  SC.logic = function () {
    // $1333: game state
    const st = rb(0xD293);
    if (st & 0x04) {                   // Sonic died
      SC.deathTimer++;
      if (SC.deathTimer < 120) { stepObjectsOnly(); return; }
      let lives = rb(0xD299);
      if (lives === 0) { SC.gameOver = true; return; }
      wb(0xD299, SC.bcdSub(lives, 1));
      SC.initLevel(rb(0xD297), rb(0xD298));
      return;
    }
    if ((rb(0xD294) & 0x88) === 0x88) SC.levelDone = (SC.levelDone | 0) + 1;
    // $16B8
    if (rb(0xD131) !== 0) return;
    if (rb(0xD15E) & 0x40) { wb(0xD2E2, (rb(0xD2E2) + 1) & 0xFF); return; }
    call(0x4C90);
    call(0x361D);
    call(0x5DD1);
    call(0x7AC2);
    if (rb(0xD2E2) >= 4) {
      wb(0xD2E2, 0);
      SC.page2(0x1C);
      call(0x8000);
    }
    wb(0xD2E2, (rb(0xD2E2) + 1) & 0xFF);
  };
  function stepObjectsOnly() {
    call(0x361D);
    call(0x5DD1);
  }

  // $7AC2: graphics requests ($D3B3): monitor icons, goal sign faces...
  SC.def(0x7AC2, function () {
    if (rb(0xD3B3) === 0) return;
    if (rb(0xD3B4) === 0) f_7B51();
    if (rb(0xD3B3) === 0) return;
    if (rb(0xD3B5) === 0) f_7B6D();
    let b = rb(0xD3B4);
    SC.page2(b & 0x1F);
    let n = rb(0xD3B5);
    if (n === 0) return f_7B92();
    if (n > 4) n = 4;
    SC.vramFromCpu(rw(0xD3B8), rw(0xD3B6), n * 32, (b & 0x80) !== 0);
    ww(0xD3B6, rw(0xD3B6) + n * 32);
    ww(0xD3B8, rw(0xD3B8) + 0x80);
    const r = rb(0xD3B5) - 4;
    wb(0xD3B5, r < 0 ? 0 : r);
  });
  function f_7B51() {
    const a = rb(0xD3B3);
    if (a < 0x10) return f_7C71(a);
    ww(0xD3BA, rw(0x7BA6 + (((a - 0x10) * 2) & 0xFF)));
    return f_7B6D();
  }
  function f_7B6D() {
    const hl = rw(0xD3BA);
    if (rb(hl) === 0xFF) return f_7B92();
    wb(0xD3B4, rb(hl)); wb(0xD3B5, rb(hl + 1));
    ww(0xD3B8, rw(hl + 2)); ww(0xD3B6, rw(hl + 4));
    ww(0xD3BA, hl + 6);
  }
  function f_7B92() {
    wb(0xD3B3, 0); wb(0xD3B4, 0); wb(0xD3B5, 0); ww(0xD3B8, 0);
  }
  function f_7C71(a) {           // monitor icons
    SC.page2(0x0E);
    const son = rb(0xD500) === 1;
    SC.vramFromCpu(0x0980, rw((son ? 0x7CBB : 0x7CC7) + a * 2), 0xC0);
    SC.vramFromCpu(0x0BC0, rw((son ? 0x7CD3 : 0x7CDF) + a * 2), 0x80);
    f_7B92();
  }
})(typeof window !== 'undefined' ? window : globalThis);
