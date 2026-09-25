// Headless run: node tools/headless.js <rom> [frames] [inputs...]
const fs = require('fs'), path = require('path'), vm = require('vm');
global.SC = {};
const dir = path.join(__dirname, '..', 'web', 'js');
for (const f of ['core.js','misc.js','camera.js','player.js','collision.js','objects.js','bank12.js','objects12.js','objects30.js','spawner.js','vdp.js','level.js'])
  vm.runInThisContext(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f });
SC.loadRom(new Uint8Array(fs.readFileSync(process.argv[2])));
const W = +(process.env.VW || 400), H = +(process.env.VH || 224);
SC.setView(W, H);
SC.initGame();
const n = +(process.argv[3] || 600);
for (let f = 0; f < n; f++) {
  let j = 0;
  if (f > 60) j = 8;
  if (f % 90 > 80) j |= 16;
  SC.vblank(j);
  SC.logic();
  if (f % 60 === 0) console.log(f, 'x', SC.rw(0xD511), 'y', SC.rw(0xD514), 'st', SC.rb(0xD502).toString(16), 'vx', SC.s16(SC.rw(0xD516)), 'cam', SC.rw(0xD174), SC.rw(0xD176), 'rings', SC.rb(0xD29A).toString(16), 'spr', SC.sprites.length);
}
