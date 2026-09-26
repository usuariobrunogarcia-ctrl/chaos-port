// Whole-frame check: RAM at start of logic (tag 0) -> my logic + vblank -> next tag-0 snapshot
const fs = require('fs'), path = require('path'), vm = require('vm');
global.SC = {};
const dir = path.join(__dirname, '..', 'web', 'js');
for (const f of ['core.js','misc.js','camera.js','player.js','collision.js','objects.js','bank12.js','objects12.js','objects30.js','spawner.js','vdp.js','level.js'])
  vm.runInThisContext(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f });
SC.loadRom(new Uint8Array(fs.readFileSync(process.argv[2])));
SC.setView(256, 192);
const snaps = fs.readFileSync(process.argv[3]); const REC = 0x2008;
const recs = []; for (let i = 0; i < snaps.length / REC; i++) if (snaps[i * REC] === 0) recs.push(snaps.subarray(i * REC, (i + 1) * REC));
const ign = [[0xDF00,0xDFFF],[0xDE00,0xDEFF],[0xD178,0xD23F],[0xD161],[0xD170,0xD171],[0xD278,0xD279],[0xDB00,0xDBFF],[0xD44F],[0xD135],[0xD110,0xD111],[0xD134],[0xD2D5],[0xD454,0xD455],[0xD472,0xD496],[0xD100],[0xD12B],[0xD36F,0xD372]];
for (let o = 0xD540; o < 0xDA00; o += 0x40) ign.push([o + 0x1A, o + 0x1D]);
const inR = (a) => ign.some(([l, h]) => a >= l && a <= (h === undefined ? l : h));
let bad = 0;
for (let i = 0; i + 1 < recs.length && bad < +(process.argv[4] || 10); i++) {
  const A = recs[i], B = recs[i + 1];
  if (B.readUInt32LE(4) !== A.readUInt32LE(4) + 1) continue;
  SC.ram.set(A.subarray(8)); SC.bank[0] = A[1]; SC.bank[1] = A[2]; SC.bank[2] = A[3];
  SC.logic();
  const held = B[8 + 0x1137];
  SC.vblank(held & 0x3F);
  const d = [];
  for (let k = 0; k < 0x1FF0; k++) if (SC.ram[k] !== B[8 + k] && !inR(0xC000 + k)) d.push(0xC000 + k);
  if (d.length) { bad++; console.log('frame', A.readUInt32LE(4), d.slice(0, 12).map(a => a.toString(16) + ':' + SC.ram[a - 0xC000].toString(16) + '/' + B[8 + a - 0xC000].toString(16)).join(' ')); }
}
console.log('bad', bad);
