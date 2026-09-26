/*
 * character.js - graphics for the original playable character (Nimbo, a flying
 * squirrel).  The engine runs him as the player object at $D500; here we only
 * replace the drawing of that object.
 *
 * Sprite sheet format (custom_character.png, next to index.html):
 *   one row of 32x32 cells, transparent background, character facing right,
 *   feet on the bottom row of the cell, body centred horizontally.
 *     0      idle
 *     1-4    walk cycle
 *     5-8    run cycle
 *     9-12   ball (jump / roll), rotating
 *     13-14  glide (flap)
 *     15     hurt
 * If the file is missing, a built-in sheet in the same format is generated.
 */
(function (G) {
  'use strict';
  const SC = G.SC;
  const CELL = 32, FRAMES = 16;
  const F = { idle: 0, walk: 1, run: 5, ball: 9, glide: 13, hurt: 15 };
  SC.CHAR_SHEET = { cell: CELL, frames: FRAMES, layout: F };

  let sheet = null;          // { w, h, px: Uint32Array } in ImageData byte order
  let animT = 0, lastFrame = 0;

  // ------------------------------------------------------------ built-in art
  const PAL = {
    o: [40, 24, 16],      // outline
    f: [214, 130, 58],    // fur
    d: [160, 88, 36],     // dark fur
    c: [252, 226, 176],   // cream belly / face
    m: [236, 170, 104],   // membrane
    e: [255, 255, 255],   // eye white
    p: [20, 60, 120],     // pupil
    n: [120, 50, 40],     // nose
    s: [60, 150, 90],     // scarf
  };
  function makeSheet() {
    const w = CELL * FRAMES, h = CELL;
    const px = new Uint32Array(w * h);
    const put = (fr, x, y, k) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= CELL || y >= CELL) return;
      const c = PAL[k];
      px[y * w + fr * CELL + x] = (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
    };
    const disc = (fr, cx, cy, rx, ry, k) => {
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
          if (dx * dx + dy * dy <= 1) put(fr, x, y, k);
        }
    };
    const rect = (fr, x0, y0, x1, y1, k) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(fr, x, y, k);
    };
    // black outline around everything drawn in a frame
    const outline = (fr) => {
      const inside = (x, y) => x >= 0 && y >= 0 && x < CELL && y < CELL && (px[y * w + fr * CELL + x] >>> 24);
      const add = [];
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        if (inside(x, y)) continue;
        if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) add.push([x, y]);
      }
      for (const [x, y] of add) put(fr, x, y, 'o');
    };
    const head = (fr, hx, hy) => {
      disc(fr, hx - 4, hy - 6, 2, 3, 'd');           // ear
      disc(fr, hx + 1, hy - 7, 2, 3, 'd');           // ear
      disc(fr, hx, hy, 6, 5.5, 'f');
      disc(fr, hx + 2, hy + 2, 4, 3, 'c');           // muzzle
      disc(fr, hx + 2, hy - 1, 2, 2.5, 'e');         // eye
      put(fr, hx + 3, hy - 1, 'p'); put(fr, hx + 3, hy, 'p');
      put(fr, hx + 6, hy + 2, 'n');
    };
    const tail = (fr, tx, ty, lift) => {
      disc(fr, tx, ty - lift, 4, 6, 'd');
      disc(fr, tx + 1, ty - lift - 1, 2.5, 4, 'f');
    };
    const standing = (fr, legA, legB, lean, bob) => {
      const bx = 16 + lean, by = 21 + bob;
      tail(fr, bx - 8, by - 2, bob);
      rect(fr, bx - 3 + legB, by + 5, bx - 1 + legB, 31, 'd');   // back leg
      disc(fr, bx, by, 5, 6, 'f');
      disc(fr, bx + 1, by + 1, 3, 4, 'c');
      rect(fr, bx + 1 + legA, by + 5, bx + 3 + legA, 31, 'f');   // front leg
      rect(fr, bx + legA, 30, bx + 5 + legA, 31, 'd');           // foot
      rect(fr, bx - 3, by - 5, bx + 4, by - 4, 's');             // scarf
      head(fr, bx + 2 + lean, by - 11);
    };
    // 0 idle
    standing(0, 0, 0, 0, 0);
    // 1-4 walk, 5-8 run
    const walk = [[2, -2, 0], [0, 0, -1], [-2, 2, 0], [0, 0, -1]];
    for (let i = 0; i < 4; i++) standing(1 + i, walk[i][0], walk[i][1], 1, walk[i][2]);
    const run = [[4, -4, 0], [1, -1, -1], [-4, 4, 0], [-1, 1, -1]];
    for (let i = 0; i < 4; i++) standing(5 + i, run[i][0], run[i][1], 3, run[i][2]);
    // 9-12 ball: fur ball with a rotating cream stripe and the tail wrapped round
    for (let i = 0; i < 4; i++) {
      const fr = 9 + i;
      disc(fr, 16, 21, 10, 10, 'f');
      const a = i * Math.PI / 2;
      for (let r = -8; r <= 8; r++) {
        put(fr, 16 + Math.cos(a) * r, 21 + Math.sin(a) * r, 'c');
        put(fr, 16 + Math.cos(a) * r + Math.sin(a), 21 + Math.sin(a) * r - Math.cos(a), 'c');
      }
      disc(fr, 16 + Math.cos(a + 2) * 6, 21 + Math.sin(a + 2) * 6, 3, 3, 'd');
    }
    // 13-14 glide: arms and legs spread, membrane between them
    for (let i = 0; i < 2; i++) {
      const fr = 13 + i, flap = i ? 1 : 0;
      for (let x = 3; x <= 28; x++) {
        const t = Math.abs(x - 16) / 13;
        const top = 16 - Math.round((1 - t) * 3) + flap;
        rect(fr, x, top, x, top + 6 - Math.round(t * 2), 'm');
      }
      disc(fr, 16, 19 + flap, 7, 4, 'f');
      disc(fr, 17, 20 + flap, 4, 2, 'c');
      disc(fr, 3, 16 + flap * 2, 2, 2, 'f'); disc(fr, 29, 16 + flap * 2, 2, 2, 'f');
      disc(fr, 5, 22, 2, 2, 'd'); disc(fr, 27, 22, 2, 2, 'd');
      tail(fr, 5, 27, 0);
      rect(fr, 13, 15 + flap, 20, 15 + flap, 's');
      head(fr, 22, 11 + flap);
    }
    // 15 hurt
    tail(15, 7, 18, 0);
    disc(15, 15, 20, 5, 6, 'f');
    rect(15, 12, 25, 14, 31, 'd'); rect(15, 17, 24, 19, 30, 'f');
    rect(15, 10, 12, 12, 17, 'f'); rect(15, 20, 12, 22, 17, 'f');
    head(15, 17, 9);
    for (let fr = 0; fr < FRAMES; fr++) outline(fr);
    return { w, h, px };
  }

  // ------------------------------------------------------------ loading
  function loadSheet(url) {
    return new Promise((resolve) => {
      if (typeof Image === 'undefined') return resolve(null);
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, img.width, img.height);
          resolve({ w: img.width, h: img.height, px: new Uint32Array(d.data.buffer) });
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }
  SC.loadCharacterSheet = async function (url) {
    const s = await loadSheet(url || 'custom_character.png');
    sheet = s && s.h >= CELL && s.w >= CELL ? s : makeSheet();
    SC.characterSheetSource = s ? 'custom_character.png' : 'built-in';
    return SC.characterSheetSource;
  };
  sheet = makeSheet();
  SC.builtinCharacterSheet = makeSheet;   // used by tools/export_character.js

  // ------------------------------------------------------------ animation
  function pickFrame() {
    const st = SC.rb(0xD501);
    const flags = SC.rb(0xD503);
    const vx = Math.abs(SC.s16(SC.rw(0xD516)));
    if (SC.gliding) return F.glide + ((animT >> 3) & 1);
    if (st === 0x0F || st === 0x15 || st === 0x16) return F.hurt;
    if (flags & 0x02) return F.ball + ((animT >> (vx > 0x400 ? 1 : 2)) & 3);   // rolling / jumping
    if (flags & 0x01) return F.walk + 1;                                         // in the air
    if (vx === 0) return F.idle;
    if (vx >= 0x0500) return F.run + ((animT >> 2) & 3);
    return F.walk + ((animT >> (vx >= 0x0280 ? 2 : 3)) & 3);
  }
  // Called once per logic frame.
  SC.characterTick = function () { animT = (animT + 1) & 0xFFFF; };

  // Draws the character with its feet at the player position.  Returns true if
  // it drew (so the renderer skips the original player sprites).
  SC.drawCharacter = function (fb, prio, W, H, camX, camY, off) {
    if (SC.character === 'sonic' || !sheet) return false;
    const ix = 0xD500;
    if (SC.rb(ix) === 0 || (SC.rb(ix + 4) & 0xC0)) return true;   // hidden / blinking
    const fr = pickFrame();
    lastFrame = fr;
    const flip = (SC.rb(ix + 4) & 0x10) !== 0;
    const ox = off ? off[0] : 0, oy = off ? off[1] : 0;
    const x0 = SC.rw(ix + 17) + ox - 2 - (CELL >> 1) - camX;
    const y0 = SC.rw(ix + 20) + oy + 1 - CELL - camY;
    const sw = sheet.w, px = sheet.px;
    for (let y = 0; y < CELL; y++) {
      const sy = y0 + y;
      if (sy < 0 || sy >= H) continue;
      for (let x = 0; x < CELL; x++) {
        const sx = x0 + x;
        if (sx < 0 || sx >= W) continue;
        const c = px[y * sw + fr * CELL + (flip ? CELL - 1 - x : x)];
        if ((c >>> 24) < 128) continue;
        const o = sy * W + sx;
        if (prio[o]) continue;
        fb[o] = c | 0xFF000000;
      }
    }
    return true;
  };
  SC.characterFrame = () => lastFrame;
})(typeof window !== 'undefined' ? window : globalThis);
