/*
 * character.js - graphics for Knuckles.  The engine runs him as the player
 * object at $D500 (see player.js); here we only replace the drawing of that
 * object.
 *
 * The sheet comes from js/knuckles_sheet.js (built by tools/build_knuckles_sheet.js,
 * embedded as a data URL so it also works when index.html is opened straight
 * from disk).  A knuckles.png next to index.html overrides it when the page is
 * served over http.
 *
 * Sprite sheet format:
 *   one row of square cells (the cell size is the image height, e.g. 40x40 or
 *   48x48), transparent background, character facing right, feet on the bottom
 *   row of the cell, body centred horizontally.  For the climbing frames he
 *   faces the wall on his right, hands touching the right edge of the body.
 *     0      idle
 *     1-6    walk cycle
 *     7-10   run cycle
 *     11-14  ball (jump / roll), rotating
 *     15     glide
 *     16     glide, turning round (facing the camera)
 *     17     drop (let go of a glide) / falling
 *     18-21  climbing a wall
 *     22-23  pulling himself up onto a ledge
 *     24     belly slide (landed from a glide)
 *     25     getting up
 *     26     hurt
 * If the file is missing, a built-in sheet in the same format is generated.
 * Frames missing from a short sheet fall back to the idle frame.
 */
(function (G) {
  'use strict';
  const SC = G.SC;
  const FRAMES = 27;
  const F = {
    idle: 0, walk: 1, run: 7, ball: 11, glide: 15, turn: 16, drop: 17,
    climb: 18, ledge: 22, slide: 24, getup: 25, hurt: 26,
  };
  const WALK_FRAMES = 6;
  const SHEET_FILE = 'knuckles.png';
  SC.CHAR_SHEET = { frames: FRAMES, layout: F, file: SHEET_FILE };

  let sheet = null;          // { cell, w, h, px: Uint32Array } in ImageData byte order
  let animT = 0, lastFrame = 0;

  // ------------------------------------------------------------ built-in art
  const CELL = 40;
  const PAL = {
    o: [24, 8, 8],        // outline
    r: [224, 36, 36],     // red fur
    d: [150, 16, 24],     // dark red
    c: [248, 232, 208],   // chest crescent / muzzle
    w: [255, 255, 255],   // gloves
    g: [200, 200, 208],   // glove shade / spikes
    e: [255, 255, 255],   // eye white
    p: [120, 40, 160],    // violet eyes
    n: [20, 20, 20],      // nose
    s: [40, 160, 72],     // shoes
    y: [248, 208, 40],    // shoe strap
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
    // thick line (limbs, dreadlocks)
    const line = (fr, x0, y0, x1, y1, r, k) => {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      for (let i = 0; i <= n; i++) disc(fr, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, r, r, k);
    };
    const outline = (fr) => {
      const inside = (x, y) => x >= 0 && y >= 0 && x < CELL && y < CELL && (px[y * w + fr * CELL + x] >>> 24);
      const add = [];
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        if (inside(x, y)) continue;
        if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) add.push([x, y]);
      }
      for (const [x, y] of add) put(fr, x, y, 'o');
    };
    // dreadlocks hanging from the back of the head; sway > 0 blows them back
    const dreads = (fr, hx, hy, dir, sway) => {
      line(fr, hx - 4 * dir, hy - 2, hx - (8 + sway) * dir, hy + 5 - sway, 2, 'd');
      line(fr, hx - 5 * dir, hy + 1, hx - (9 + sway) * dir, hy + 8 - sway, 2, 'r');
      line(fr, hx - 3 * dir, hy + 3, hx - (6 + sway) * dir, hy + 10 - sway, 2, 'd');
    };
    // side view head facing dir (1 right, -1 left)
    const head = (fr, hx, hy, dir) => {
      dreads(fr, hx, hy, dir, 0);
      disc(fr, hx, hy, 6.5, 6, 'r');
      disc(fr, hx + 4 * dir, hy + 3, 3.5, 2.5, 'c');    // muzzle
      disc(fr, hx + 2 * dir, hy - 1.5, 2, 2.5, 'e');    // eye
      put(fr, hx + 3 * dir, hy - 1, 'p'); put(fr, hx + 3 * dir, hy - 2, 'p');
      put(fr, hx + 7 * dir, hy + 2, 'n');
      rect(fr, hx - 1, hy - 7, hx + 1, hy - 6, 'd');    // crest
    };
    const glove = (fr, x, y, dir) => {
      disc(fr, x, y, 3, 3, 'w');
      put(fr, x + 3 * dir, y - 1, 'g'); put(fr, x + 3 * dir, y + 1, 'g');   // knuckle spikes
    };
    const shoe = (fr, x, y, dir) => {
      rect(fr, x - 2, y - 2, x + 3, y, 's');
      put(fr, x + 4 * (dir > 0 ? 1 : 0) - (dir < 0 ? 3 : 0), y, 's');
      rect(fr, x - 1, y - 2, x, y - 2, 'y');
    };
    const torso = (fr, bx, by, dir) => {
      disc(fr, bx, by, 5, 6.5, 'r');
      disc(fr, bx + 2 * dir, by - 1, 3, 3.5, 'c');      // chest crescent
      disc(fr, bx + 0.5 * dir, by - 1, 2.5, 3.5, 'r');
    };
    const standing = (fr, legA, legB, lean, bob, arm) => {
      const bx = 20 + lean, by = 27 + bob;
      line(fr, bx - 1, by + 4, bx - 1 + legB, 36, 1.5, 'd');       // back leg
      shoe(fr, bx - 1 + legB, 38, 1);
      glove(fr, bx - 4 - arm, by + 1, -1);                          // back arm
      torso(fr, bx, by, 1);
      line(fr, bx + 1, by + 4, bx + 1 + legA, 36, 1.5, 'r');       // front leg
      shoe(fr, bx + 2 + legA, 38, 1);
      line(fr, bx + 2, by - 2, bx + 4 + arm, by + 2, 1.2, 'r');     // front arm
      glove(fr, bx + 5 + arm, by + 3, 1);
      head(fr, bx + 1 + lean, by - 12, 1);
    };
    // 0 idle
    standing(0, 0, 0, 0, 0, 0);
    // walk, run
    const walk = [[3, -3, 0, 2], [1, -1, -1, 1], [-1, 1, -1, -1], [-3, 3, 0, -2], [-1, 1, -1, -1], [1, -1, -1, 1]];
    for (let i = 0; i < WALK_FRAMES; i++) standing(F.walk + i, walk[i][0], walk[i][1], 1, walk[i][2], walk[i][3]);
    const run = [[5, -5, 0, 3], [1, -1, -1, 0], [-5, 5, 0, -3], [-1, 1, -1, 0]];
    for (let i = 0; i < 4; i++) standing(F.run + i, run[i][0], run[i][1], 3, run[i][2], run[i][3]);
    // ball with rotating dreadlock tips
    for (let i = 0; i < 4; i++) {
      const fr = F.ball + i, cx = 20, cy = 28;
      const a = i * Math.PI / 2;
      for (let k = 0; k < 3; k++) {
        const b = a + k * 2.1;
        disc(fr, cx + Math.cos(b) * 9, cy + Math.sin(b) * 9, 3, 3, 'd');
      }
      disc(fr, cx, cy, 10, 10, 'r');
      disc(fr, cx + Math.cos(a + 1) * 4, cy + Math.sin(a + 1) * 4, 4, 4, 'c');
      disc(fr, cx + Math.cos(a + 1) * 3, cy + Math.sin(a + 1) * 3, 3, 3, 'r');
      glove(fr, cx + Math.cos(a + 3) * 6, cy + Math.sin(a + 3) * 6, 1);
    }
    // glide: flat, fists forward, dreadlocks streaming back
    {
      const fr = F.glide;
      line(fr, 14, 30, 5, 32, 1.5, 'd'); shoe(fr, 4, 33, -1);
      line(fr, 14, 29, 6, 29, 1.5, 'r'); shoe(fr, 5, 30, -1);
      disc(fr, 17, 28, 7, 4, 'r');
      line(fr, 20, 26, 32, 24, 1.2, 'r');
      glove(fr, 33, 23, 1); glove(fr, 35, 26, 1);
      dreads(fr, 25, 22, 1, 5);
      disc(fr, 25, 22, 6, 5.5, 'r');
      disc(fr, 28, 25, 3, 2, 'c');
      disc(fr, 27, 21, 2, 2, 'e'); put(fr, 28, 21, 'p');
    }
    // glide turn: facing the camera, arms spread
    {
      const fr = F.turn;
      line(fr, 17, 30, 10, 34, 1.5, 'd'); line(fr, 23, 30, 30, 34, 1.5, 'd');
      shoe(fr, 9, 36, -1); shoe(fr, 30, 36, 1);
      line(fr, 14, 25, 5, 23, 1.2, 'r'); line(fr, 26, 25, 35, 23, 1.2, 'r');
      glove(fr, 4, 23, -1); glove(fr, 36, 23, 1);
      disc(fr, 20, 27, 6, 5, 'r');
      disc(fr, 20, 26, 3, 3, 'c');
      line(fr, 15, 16, 12, 24, 2, 'd'); line(fr, 25, 16, 28, 24, 2, 'd');
      disc(fr, 20, 17, 6.5, 6, 'r');
      disc(fr, 18, 17, 1.5, 2.5, 'e'); disc(fr, 22, 17, 1.5, 2.5, 'e');
      put(fr, 18, 17, 'p'); put(fr, 22, 17, 'p');
      disc(fr, 20, 21, 3, 2, 'c'); put(fr, 20, 20, 'n');
    }
    // drop: arms up, legs dangling
    {
      const fr = F.drop, bx = 20, by = 27;
      line(fr, bx - 1, by + 4, bx - 3, 36, 1.5, 'd'); shoe(fr, bx - 3, 38, 1);
      line(fr, bx - 2, by - 3, bx - 6, by - 14, 1.2, 'r'); glove(fr, bx - 6, by - 16, -1);
      torso(fr, bx, by, 1);
      line(fr, bx + 1, by + 4, bx + 3, 35, 1.5, 'r'); shoe(fr, bx + 3, 37, 1);
      line(fr, bx + 3, by - 3, bx + 8, by - 13, 1.2, 'r'); glove(fr, bx + 8, by - 15, 1);
      head(fr, bx + 1, by - 11, 1);
    }
    // climbing: back view, wall on the right, hands alternating
    for (let i = 0; i < 4; i++) {
      const fr = F.climb + i, bx = 22, by = 25;
      const up = [0, -3, 0, 3][i];
      line(fr, bx - 1, by + 5, bx + 3, 34 + up, 1.5, 'd'); shoe(fr, bx + 4, 36 + up, 1);
      line(fr, bx + 1, by + 5, bx + 5, 34 - up, 1.5, 'r'); shoe(fr, bx + 6, 36 - up, 1);
      disc(fr, bx, by, 5, 7, 'r');
      line(fr, bx + 2, by - 4, bx + 7, by - 8 + up, 1.2, 'r'); glove(fr, bx + 8, by - 9 + up, 1);
      line(fr, bx + 2, by - 1, bx + 7, by - 2 - up, 1.2, 'd'); glove(fr, bx + 8, by - 3 - up, 1);
      // back of the head: dreadlocks cover it
      disc(fr, bx - 1, by - 11, 6, 6, 'r');
      line(fr, bx - 3, by - 10, bx - 6, by - 3, 2, 'd');
      line(fr, bx - 1, by - 9, bx - 2, by - 1, 2, 'r');
      line(fr, bx + 1, by - 10, bx + 1, by - 3, 2, 'd');
    }
    // ledge: pulling up, then kneeling on top
    {
      let fr = F.ledge;
      line(fr, 22, 30, 24, 38, 1.5, 'd'); shoe(fr, 25, 38, 1);
      torso(fr, 24, 26, 1);
      line(fr, 26, 22, 33, 18, 1.2, 'r'); glove(fr, 34, 17, 1);
      head(fr, 26, 15, 1);
      fr = F.ledge + 1;
      line(fr, 16, 34, 22, 36, 1.5, 'd'); shoe(fr, 14, 37, -1);
      disc(fr, 22, 31, 6, 5, 'r');
      line(fr, 24, 33, 30, 37, 1.5, 'r'); shoe(fr, 31, 38, 1);
      glove(fr, 29, 34, 1);
      head(fr, 26, 22, 1);
    }
    // belly slide
    {
      const fr = F.slide;
      line(fr, 14, 35, 4, 34, 1.5, 'd'); shoe(fr, 3, 35, -1);
      disc(fr, 18, 35, 8, 3.5, 'r');
      line(fr, 23, 35, 34, 34, 1.2, 'r'); glove(fr, 35, 35, 1);
      dreads(fr, 26, 30, 1, 3);
      disc(fr, 26, 30, 5.5, 5, 'r');
      disc(fr, 29, 33, 3, 2, 'c');
      disc(fr, 28, 29, 1.5, 2, 'e'); put(fr, 29, 29, 'p');
    }
    // getting up: crouched
    {
      const fr = F.getup, bx = 20, by = 31;
      line(fr, bx - 2, by + 3, bx - 5, 37, 1.5, 'd'); shoe(fr, bx - 5, 38, 1);
      torso(fr, bx, by, 1);
      line(fr, bx + 2, by + 3, bx + 5, 37, 1.5, 'r'); shoe(fr, bx + 6, 38, 1);
      glove(fr, bx + 6, by + 3, 1);
      head(fr, bx + 2, by - 10, 1);
    }
    // hurt
    {
      const fr = F.hurt, bx = 20, by = 26;
      line(fr, bx - 1, by + 4, bx - 6, 35, 1.5, 'd'); shoe(fr, bx - 6, 37, -1);
      line(fr, bx + 1, by + 4, bx + 6, 35, 1.5, 'r'); shoe(fr, bx + 7, 37, 1);
      line(fr, bx - 3, by - 2, bx - 10, by - 6, 1.2, 'r'); glove(fr, bx - 11, by - 7, -1);
      line(fr, bx + 3, by - 2, bx + 10, by - 6, 1.2, 'r'); glove(fr, bx + 11, by - 7, 1);
      torso(fr, bx, by, 1);
      head(fr, bx, by - 12, -1);
    }
    for (let fr = 0; fr < FRAMES; fr++) outline(fr);
    return { cell: CELL, w, h, px };
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
          resolve({ cell: img.height, w: img.width, h: img.height, px: new Uint32Array(d.data.buffer) });
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }
  const usable = (s) => s && s.h >= 16 && s.w >= s.h;
  SC.loadCharacterSheet = async function (url) {
    const tries = [[url || SHEET_FILE, url || SHEET_FILE]];
    if (!url && SC.KNUCKLES_SHEET) tries.push([SC.KNUCKLES_SHEET, 'embedded']);
    for (const [src, name] of tries) {
      const s = await loadSheet(src);
      if (usable(s)) {
        sheet = s;
        SC.characterSheetSource = name;
        return name;
      }
    }
    sheet = makeSheet();
    SC.characterSheetSource = 'built-in';
    return 'built-in';
  };
  sheet = makeSheet();
  SC.builtinCharacterSheet = makeSheet;   // used by tools/export_character.js

  // ------------------------------------------------------------ animation
  function pickFrame() {
    const K = SC.knux || {};
    const st = SC.rb(0xD501);
    const flags = SC.rb(0xD503);
    const vx = Math.abs(SC.s16(SC.rw(0xD516)));
    switch (K.mode) {
      case 'glide': return K.ang % 128 ? F.turn : F.glide;
      case 'drop': return F.drop;
      case 'climb': return F.climb + ((K.climbT >> 3) & 3);
      case 'ledge': return F.ledge + (K.t < 32 ? 0 : 1);
      case 'slide': return F.slide;
      case 'getup': return F.getup;
    }
    if (st === 0x1E || st === 0x1F) return F.hurt;
    if (flags & 0x02) return F.ball + ((animT >> (vx > 0x400 ? 1 : 2)) & 3);   // rolling / jumping
    if (flags & 0x01) return F.drop;                                            // in the air
    if (vx === 0) return F.idle;
    if (vx >= 0x0500) return F.run + ((animT >> 2) & 3);
    return F.walk + ((animT >> (vx >= 0x0280 ? 2 : 3)) % WALK_FRAMES);
  }
  // Called once per logic frame.
  SC.characterTick = function () { animT = (animT + 1) & 0xFFFF; };

  // Draws the character with its feet at the player position.  Returns true if
  // it drew (so the renderer skips the original player sprites).
  SC.drawCharacter = function (fb, prio, W, H, camX, camY, off) {
    if (!SC.CHARACTERS[SC.character].custom || !sheet) return false;
    const ix = 0xD500;
    if (SC.rb(ix) === 0 || (SC.rb(ix + 4) & 0xC0)) return true;   // hidden / blinking
    const cell = sheet.cell;
    let fr = pickFrame();
    if ((fr + 1) * cell > sheet.w) fr = F.idle;
    lastFrame = fr;
    const flip = (SC.rb(ix + 4) & 0x10) !== 0;
    const ox = off ? off[0] : 0, oy = off ? off[1] : 0;
    const x0 = SC.rw(ix + 17) + ox - 2 - (cell >> 1) - camX;
    const y0 = SC.rw(ix + 20) + oy + 1 - cell - camY;
    const sw = sheet.w, px = sheet.px;
    for (let y = 0; y < cell; y++) {
      const sy = y0 + y;
      if (sy < 0 || sy >= H) continue;
      for (let x = 0; x < cell; x++) {
        const sx = x0 + x;
        if (sx < 0 || sx >= W) continue;
        const c = px[y * sw + fr * cell + (flip ? cell - 1 - x : x)];
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
