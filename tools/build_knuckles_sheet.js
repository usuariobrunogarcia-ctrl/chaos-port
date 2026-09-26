// Builds web/knuckles.png (the format described in web/js/character.js) from
// the Sonic Chaos style Knuckles sheet by PixelMarioXP:
//   node tools/build_knuckles_sheet.js [source.png] [out.png]
// Each source cell is copied bottom-aligned and horizontally centred into a
// 40x40 cell; the background colours of the source sheet become transparent.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const root = path.join(__dirname, '..');
const src = process.argv[2] || path.join(root, 'art/knuckles_chaos_pixelmarioxp.png');
const out = process.argv[3] || path.join(root, 'web/knuckles.png');
const CELL = 40;
const BG = new Set(['0,85,170', '0,170,255', '170,85,170']);   // sheet, cell, overflow mask

// Source cells [x, y, w, h], in the frame order of character.js.
const FRAMES = [
  [321, 3, 24, 32],                                                                       // idle
  [3, 3, 32, 32], [38, 3, 32, 32], [73, 3, 32, 32], [108, 3, 32, 32], [143, 3, 32, 32], [178, 3, 32, 32], // walk
  [213, 3, 24, 32], [240, 3, 24, 32], [267, 3, 24, 32], [294, 3, 24, 32],                 // run
  [445, 38, 24, 32], [472, 38, 24, 32], [499, 38, 24, 32], [526, 38, 24, 32],             // ball
  [3, 186, 40, 32],                                                                       // glide
  [81, 186, 32, 32],                                                                      // glide turn
  [3, 38, 32, 32],                                                                        // drop
  [116, 186, 24, 32], [143, 186, 24, 32], [170, 186, 24, 32], [197, 186, 24, 32],         // climb
  [633, 151, 24, 32], [224, 186, 24, 32],                                                 // ledge
  [46, 186, 32, 32],                                                                      // belly slide
  [669, 3, 24, 32],                                                                       // get up
  [458, 73, 32, 32],                                                                      // hurt
];

// ---- minimal PNG (8-bit RGBA, non-interlaced) ----
function readPng(file) {
  const b = fs.readFileSync(file);
  let o = 8, W = 0, H = 0;
  const idat = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      W = d.readUInt32BE(0); H = d.readUInt32BE(4);
      if (d[8] !== 8 || d[9] !== 6 || d[12] !== 0) throw new Error('expected an 8-bit RGBA non-interlaced PNG');
    }
    if (type === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), st = W * 4, px = Buffer.alloc(st * H);
  for (let y = 0; y < H; y++) {
    const f = raw[y * (st + 1)];
    for (let x = 0; x < st; x++) {
      const a = raw[y * (st + 1) + 1 + x];
      const L = x >= 4 ? px[y * st + x - 4] : 0, U = y ? px[(y - 1) * st + x] : 0;
      const UL = x >= 4 && y ? px[(y - 1) * st + x - 4] : 0;
      let v = a;
      if (f === 1) v += L;
      else if (f === 2) v += U;
      else if (f === 3) v += (L + U) >> 1;
      else if (f === 4) {
        const p = L + U - UL, pa = Math.abs(p - L), pb = Math.abs(p - U), pc = Math.abs(p - UL);
        v += pa <= pb && pa <= pc ? L : pb <= pc ? U : UL;
      }
      px[y * st + x] = v & 255;
    }
  }
  return { W, H, px };
}
function writePng(file, W, H, px) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

const s = readPng(src);
const W = CELL * FRAMES.length, dst = Buffer.alloc(W * CELL * 4);
FRAMES.forEach(([sx, sy, w, h], fr) => {
  const ox = fr * CELL + ((CELL - w) >> 1), oy = CELL - h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = ((sy + y) * s.W + sx + x) * 4;
    if (s.px[o + 3] < 128 || BG.has(s.px[o] + ',' + s.px[o + 1] + ',' + s.px[o + 2])) continue;
    s.px.copy(dst, ((oy + y) * W + ox + x) * 4, o, o + 4);
  }
});
writePng(out, W, CELL, dst);
console.log('wrote', path.relative(process.cwd(), out), W + 'x' + CELL, FRAMES.length, 'frames');
