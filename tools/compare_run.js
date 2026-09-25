// Full-engine comparison with a recorded run of the original (256x192 view)
const fs = require('fs'), path = require('path'), vm = require('vm');
global.SC = {};
const dir = path.join(__dirname, '..', 'web', 'js');
for (const f of ['core.js','misc.js','camera.js','player.js','collision.js','objects.js','bank12.js','objects12.js','objects30.js','spawner.js','vdp.js','level.js'])
  vm.runInThisContext(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f });
SC.loadRom(new Uint8Array(fs.readFileSync(process.argv[2])));
const ref = JSON.parse(fs.readFileSync(process.argv[3]));
SC.setView(256, 192);
SC.initGame();
const off = +(process.argv[4] || 0);
let first = -1;
for (let f = 0; f < ref.inp.length; f++) {
  SC.vblank(ref.inp[f + off + (2)] | 0); SC.logic();
  const r = ref.pos[f + off]; if (!r) break;
  const x = SC.rw(0xD511), y = SC.rw(0xD514);
  if ((x !== r[0] || y !== r[1]) && first < 0) { first = f; console.log('first divergence at', f, 'mine', x, y, 'orig', r); }
  if (f % 300 === 0) console.log(f, 'mine', x, y, 'orig', r[0], r[1]);
}
