// Writes the built-in Knuckles sheet as a PNG template for web/knuckles.png:
//   node tools/export_character.js out.png [scale]
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
global.SC = {};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../web/js/core.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../web/js/character.js'), 'utf8'));
const out = process.argv[2] || 'knuckles.png', scale = +(process.argv[3] || 1);
const s = SC.builtinCharacterSheet();
const W = s.w * scale, H = s.h * scale;
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const v = s.px[Math.floor(y / scale) * s.w + Math.floor(x / scale)];
    const o = y * (W * 4 + 1) + 1 + x * 4;
    raw[o] = v & 255; raw[o + 1] = (v >> 8) & 255; raw[o + 2] = (v >> 16) & 255; raw[o + 3] = (v >>> 24) & 255;
  }
}
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out, W + 'x' + H);
