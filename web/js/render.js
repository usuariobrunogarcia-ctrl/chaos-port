/*
 * render.js - software renderer (SMS mode 4 style) into a view of any size.
 * Background from the layout + 32x32 block mappings, sprites (8x16) from the
 * sprite list built by the interrupt code, background priority tiles on top,
 * HUD sprites last.
 */
(function (G) {
  'use strict';
  const SC = G.SC;
  const { rb, rw } = SC;

  let W = 0, H = 0, fb = null, prio = null, img = null, ctx = null;
  const tilePix = new Uint8Array(512 * 64);
  let blockMap = null;   // 256 blocks x 16 entries

  SC.renderSetup = function (canvas, w, h) {
    W = w; H = h;
    canvas.width = w; canvas.height = h;
    ctx = canvas.getContext('2d');
    img = ctx.createImageData(w, h);
    fb = new Uint32Array(img.data.buffer);
    prio = new Uint8Array(w * h);
  };
  SC.onLevelLoaded = function () {
    // block mappings (bank at $D162, pointer table at $D164)
    blockMap = new Uint16Array(256 * 16);
    SC.page2(rb(0xD162));
    const tbl = rw(0xD164);
    for (let b = 0; b < 256; b++) {
      const p = rw(tbl + b * 2);
      for (let i = 0; i < 16; i++) blockMap[b * 16 + i] = rw(p + i * 2);
    }
    SC.tileDirty.fill(1);
  };
  function refreshTiles() {
    const v = SC.vram, d = SC.tileDirty;
    for (let t = 0; t < 512; t++) {
      if (!d[t]) continue;
      d[t] = 0;
      const b = t * 32;
      for (let y = 0; y < 8; y++) {
        const p0 = v[b + y * 4], p1 = v[b + y * 4 + 1], p2 = v[b + y * 4 + 2], p3 = v[b + y * 4 + 3];
        for (let x = 0; x < 8; x++) {
          const s = 7 - x;
          tilePix[t * 64 + y * 8 + x] = ((p0 >> s) & 1) | (((p1 >> s) & 1) << 1) | (((p2 >> s) & 1) << 2) | (((p3 >> s) & 1) << 3);
        }
      }
    }
  }

  SC.render = function (camX, camY, offs) {
    if (!blockMap) return;
    refreshTiles();
    const pal = SC.cramRGB;
    const back = pal[0];
    fb.fill(0xFF000000); prio.fill(0);
    const rowTbl = rw(0xD168);
    const tx0 = camX >> 3, ty0 = camY >> 3;
    const ox = camX & 7, oy = camY & 7;
    const cols = (W >> 3) + 2, rows = (H >> 3) + 2;
    for (let r = 0; r < rows; r++) {
      const ty = ty0 + r;
      const by = ty >> 2;
      if (ty < 0 || by >= 32) continue;
      const rowOff = rw((rowTbl + by * 2) & 0xFFFF);
      for (let c = 0; c < cols; c++) {
        const tx = tx0 + c;
        if (tx < 0) continue;   // like the original, x past the row width wraps into the next row
        const la = 0xC001 + rowOff + (tx >> 2);
        if (la > 0xCFFF) continue;
        const blk = SC.ram[la - 0xC000];
        const e = blockMap[blk * 16 + (ty & 3) * 4 + (tx & 3)];
        const tile = e & 0x1FF, hf = e & 0x200, vf = e & 0x400, pb = (e & 0x800) ? 16 : 0, pr = e & 0x1000;
        const sx = c * 8 - ox, sy = r * 8 - oy;
        for (let y = 0; y < 8; y++) {
          const py = sy + y;
          if (py < 0 || py >= H) continue;
          const srow = tile * 64 + (vf ? 7 - y : y) * 8;
          let o = py * W + sx;
          for (let x = 0; x < 8; x++, o++) {
            const px = sx + x;
            if (px < 0 || px >= W) continue;
            const ci = tilePix[srow + (hf ? 7 - x : x)];
            fb[o] = ci ? pal[ci + pb] : pal[pb];
            if (pr && ci) prio[o] = 1;
          }
        }
      }
    }
    // sprites: first in the list is on top, so draw backwards
    const sp = SC.sprites;
    for (let i = sp.length - 1; i >= 0; i--) {
      const s = sp[i];
      const d = offs && offs[s.o];
      if (d) drawSprite(s.x + d[0] - camX, s.y + d[1] - camY + 1, s.t, true);
      else drawSprite(s.x - camX, s.y - camY + 1, s.t, true);
    }
    // HUD (fixed screen sprites at $DB34 / $DBA8)
    for (let k = 11; k >= 0; k--) {
      const y = rb(0xDB34 + k);
      if (y === 0xD0 || y >= 0xE0) continue;
      drawSprite(rb(0xDBA8 + k * 2), y + 1, rb(0xDBA9 + k * 2), false);
    }
    ctx.putImageData(img, 0, 0);
  };
  function drawSprite(x, y, t, usePrio) {
    const pal = SC.cramRGB;
    t &= 0xFE;
    for (let h = 0; h < 2; h++) {
      const tile = t + h;
      for (let yy = 0; yy < 8; yy++) {
        const py = y + h * 8 + yy;
        if (py < 0 || py >= H) continue;
        for (let xx = 0; xx < 8; xx++) {
          const px = x + xx;
          if (px < 0 || px >= W) continue;
          const ci = tilePix[tile * 64 + yy * 8 + xx];
          if (!ci) continue;
          const o = py * W + px;
          if (usePrio && prio[o]) continue;
          fb[o] = pal[16 + ci];
        }
      }
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
