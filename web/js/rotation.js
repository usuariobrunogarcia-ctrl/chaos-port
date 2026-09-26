/*
 * rotation.js - smooth rotation of the player in loops.
 *
 * The original draws pre-rotated frames in steps while the player follows a
 * loop path (states $0C, $0D and $13, paths in bank 13).  Here the renderer
 * draws the upright running frame instead, rotated to the exact tangent of the
 * path.  Only the drawing changes: the game logic and RAM are untouched.
 *
 * Frames are built straight from the ROM (art table at $104B / $11CF, sprite
 * layouts in bank 15) and scaled 2x with Scale2x before rotating, so the pixel
 * art keeps clean edges at any angle.
 */
(function (G) {
  'use strict';
  const SC = G.SC;
  const { rb, rw } = SC;

  // loop path tables (bank 13): state -> [y table, x table, entries] ($3C1B, $3CFC, $3DAE)
  const PATHS = { 0x0C: [0x8000, 0x8398, 0x180], 0x0D: [0x8DDC, 0x9140, 0x1A0], 0x13: [0x86AE, 0x8A46, 0x180] };
  // upright running frames: Sonic ($8F45) and Tails ($8D05)
  const RUN = { 1: [7, 4], 2: [7, 3] };
  const SPAN = 8;        // path entries on each side used for the tangent

  // byte / word in ROM as seen with bank b paged into slot 2
  const romB = (b, a) => SC.rom[a < 0x8000 ? a : b * 0x4000 + (a - 0x8000)];
  const romW = (b, a) => romB(b, a) | (romB(b, a + 1) << 8);
  const s16 = (v) => (v << 16) >> 16;

  // ---------------------------------------------------------- frame bitmaps
  // Colour indices (0 = transparent) of frame `fr` of player type `type`,
  // positioned relative to the player's position: { x0, y0, w, h, px }.
  const cache = new Map();
  function playerFrame(type, fr) {
    const key = type * 256 + fr;
    if (cache.has(key)) return cache.get(key);
    // art ($0D15): 4 bytes per frame -> bank, source, number of 8x16 sprites
    const e = (type === 1 ? 0x104B : 0x11CF) + fr * 4;
    const ab = SC.rom[e], src = SC.rom[e + 1] | (SC.rom[e + 2] << 8), n16 = SC.rom[e + 3];
    const tile = (t, y, x) => {
      const b = (t * 32) + y * 4, s = 7 - x;
      if (t >= n16 * 2) return 0;
      let c = 0;
      for (let p = 0; p < 4; p++) c |= ((romB(ab, src + b + p) >> s) & 1) << p;
      return c;
    };
    // layout ($6562 / $220E): bank 15
    const de = romW(0x0F, 0x8000 + type * 2);
    const hl = romW(0x0F, de + fr * 2);
    const n = romB(0x0F, hl);
    const list = romW(0x0F, hl + 3), base = hl + 5;
    const by = romW(0x0F, base), bx = romW(0x0F, base + 2), tiles = romW(0x0F, base + 4);
    const spr = [];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < n; i++) {
      const y = s16((romW(0x0F, list + i * 4) + by) & 0xFFFF) + 1;
      const x = s16((romW(0x0F, list + 2 + i * 4) + bx) & 0xFFFF);
      const t = romB(0x0F, tiles + i) & 0xFE;
      spr.push([x, y, t]);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 8); y1 = Math.max(y1, y + 16);
    }
    let f = null;
    if (n) {
      const w = x1 - x0, h = y1 - y0, px = new Uint8Array(w * h);
      for (const [x, y, t] of spr)
        for (let yy = 0; yy < 16; yy++)
          for (let xx = 0; xx < 8; xx++) {
            const c = tile(t + (yy >> 3), yy & 7, xx);
            if (c) px[(y - y0 + yy) * w + (x - x0 + xx)] = c;
          }
      f = scale2x({ x0, y0, w, h, px });
    }
    cache.set(key, f);
    return f;
  }
  SC.playerFrameBitmap = playerFrame;

  // Scale2x (EPX) on a bitmap of colour indices / packed colours.
  function scale2x(b) {
    const { w, h, px } = b, W2 = w * 2, out = new (px.constructor)(W2 * h * 2);
    const at = (x, y) => px[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
        let e0 = P, e1 = P, e2 = P, e3 = P;
        if (C === A && C !== D && A !== B) e0 = A;
        if (A === B && A !== C && B !== D) e1 = B;
        if (D === C && D !== B && C !== A) e2 = C;
        if (B === D && B !== A && D !== C) e3 = D;
        const o = y * 2 * W2 + x * 2;
        out[o] = e0; out[o + 1] = e1; out[o + W2] = e2; out[o + W2 + 1] = e3;
      }
    return { x0: b.x0, y0: b.y0, w: b.w, h: b.h, px: out, s: 2, raw: px };
  }
  SC.scale2x = scale2x;

  // ---------------------------------------------------------- loop angle
  // Returns the rotation (radians, clockwise on screen) for the player, or
  // null when he is not following a loop path upright.
  SC.loopAngle = function () {
    const p = PATHS[rb(0xD501)];
    if (!p || rb(0xD500) === 0 || (rb(0xD503) & 0x02)) return null;
    // The path is stored in whole pixels, so the tangent is taken over a wide
    // window and blended with the fractional progress ($D39D) to turn smoothly.
    const i = rw(0xD39E), frac = rb(0xD39D) / 256;
    const pt = (k) => {
      k = Math.max(0, Math.min(p[2] - 1, k));
      return [s16(romW(0x0D, p[1] + k * 2)), s16(romW(0x0D, p[0] + k * 2))];
    };
    const tangent = (k) => {
      const a = pt(k - SPAN), b = pt(k + SPAN);
      return [b[0] - a[0], b[1] - a[1]];
    };
    const t0 = tangent(i), t1 = tangent(i + 1);
    const dx = t0[0] + (t1[0] - t0[0]) * frac, dy = t0[1] + (t1[1] - t0[1]) * frac;
    if (!dx && !dy) return null;
    let ang = Math.atan2(dy, dx);
    if (rb(0xD504) & 0x10) ang -= Math.PI;       // drawn mirrored: its natural direction is left
    return ang;
  };
  // Upright frame to rotate for Sonic / Tails, legs cycling with the distance run.
  SC.loopRunFrame = function () {
    const r = RUN[rb(0xD500)];
    if (!r) return 0;
    return r[0] + ((rw(0xD39E) >> 3) % r[1]);
  };

  // ---------------------------------------------------------- drawing
  // Draws bitmap b (from playerFrame / a sprite sheet cell, 2x scaled; its
  // coordinates are relative to the player's position px, py on screen)
  // rotated by `ang` around the body centre, PIVOT_Y pixels above the position:
  // the original draws its pre-rotated loop frames centred there.  `color(v)`
  // turns a bitmap value into a framebuffer colour (0 = transparent).
  const PIVOT_Y = -14;
  SC.drawRotated = function (fb, prio, W, H, b, px, py, ang, flip, color) {
    if (!b) return;
    const s = b.s || 1, cos = Math.cos(ang), sin = Math.sin(ang);
    py += PIVOT_Y;
    const r = Math.ceil(Math.hypot(Math.max(-b.x0, b.x0 + b.w), Math.max(-b.y0 - PIVOT_Y, b.y0 + b.h + PIVOT_Y))) + 1;
    const bw = b.w * s;
    for (let dy = -r; dy <= r; dy++) {
      const sy = py + dy;
      if (sy < 0 || sy >= H) continue;
      for (let dx = -r; dx <= r; dx++) {
        const sx = px + dx;
        if (sx < 0 || sx >= W) continue;
        // inverse rotation of the pixel centre into sprite space
        const cx = dx + 0.5, cy = dy + 0.5;
        let ux = cx * cos + cy * sin, uy = -cx * sin + cy * cos + PIVOT_Y;
        if (flip) ux = -ux;
        const tx = Math.floor((ux - b.x0) * s), ty = Math.floor((uy - b.y0) * s);
        if (tx < 0 || ty < 0 || tx >= bw || ty >= b.h * s) continue;
        const v = b.px[ty * bw + tx];
        if (!v) continue;
        const o = sy * W + sx;
        if (prio[o]) continue;
        const c = color(v);
        if (c) fb[o] = c;
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
