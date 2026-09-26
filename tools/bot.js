// Finds an input sequence that completes the level (random bot with rewind).
const fs=require('fs'),path=require('path'),vm=require('vm');global.SC={};
const dir=path.join(__dirname,'..','web','js');
for (const f of ['core.js','misc.js','camera.js','player.js','collision.js','objects.js','bank12.js','objects12.js','objects30.js','spawner.js','vdp.js','level.js']) vm.runInThisContext(fs.readFileSync(path.join(dir,f),'utf8'));
SC.loadRom(new Uint8Array(fs.readFileSync(process.argv[2])));
SC.setView(+process.argv[3]||400,+process.argv[4]||224);SC.initGame();
let seed=+(process.argv[5]||7);const rnd=()=>((seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff);
const snap=()=>({ram:SC.ram.slice(),bank:SC.bank.slice(),dt:SC.deathTimer});
const restore=(s)=>{SC.ram.set(s.ram);SC.bank[0]=s.bank[0];SC.bank[1]=s.bank[1];SC.bank[2]=s.bank[2];SC.deathTimer=s.dt;};
let inputs=[],cps=[[0,snap()]],cur=8,hold=0,lives=SC.rb(0xD299);
while(inputs.length<20000){
  if(hold<=0){const r=rnd();cur=r<.55?8:r<.8?24:r<.88?4:r<.94?20:2;hold=5+Math.floor(rnd()*35);}
  SC.vblank(cur);SC.logic();inputs.push(cur);hold--;
  if(SC.rb(0xD293)&4||SC.rb(0xD299)<lives){const k=Math.max(0,cps.length-1-1-Math.floor(rnd()*3));const [f,s]=cps[k];cps=cps.slice(0,k+1);restore(s);inputs=inputs.slice(0,f);hold=0;continue;}
  if(inputs.length%60==0)cps.push([inputs.length,snap()]);
  if(SC.results){console.error('done',inputs.length);break;}
}
fs.writeFileSync(process.argv[6]||'/tmp/claude-0/wide_inputs.json',JSON.stringify(inputs));
console.error('x',SC.rw(0xD511),'frames',inputs.length);
