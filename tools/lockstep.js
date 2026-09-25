#!/usr/bin/env node
/*
 * Lock-step verification of ported routines against RAM snapshots taken from
 * the original game running in an emulator.
 *
 *   node tools/lockstep.js <rom> <snapshots.bin> <tagFrom> <tagTo> <routine> [opts]
 *
 * snapshots.bin records: [tag, bank0, bank1, bank2, frame(u32), ram(8K)].
 * For every snapshot with tag <tagFrom> followed by one with <tagTo>, RAM and the
 * mapper state are restored, <routine> (hex address) is run, and the result is
 * compared with the <tagTo> snapshot.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const args = process.argv.slice(2);
if (args.length < 5) {
  console.error('usage: lockstep.js rom snaps tagFrom tagTo routineHex [--ignore A-B,...] [--max N] [--quiet] [--only A-B]');
  process.exit(1);
}
const [romPath, snapPath, tagFromS, tagToS, routineS] = args;
const opt = { ignore: [], max: 20, quiet: false, only: null, stopOnError: false, ix: 0xD500 };
for (let i = 5; i < args.length; i++) {
  if (args[i] === '--ignore') opt.ignore = args[++i].split(',').map(r => r.split('-').map(x => parseInt(x, 16)));
  else if (args[i] === '--max') opt.max = +args[++i];
  else if (args[i] === '--quiet') opt.quiet = true;
  else if (args[i] === '--only') opt.only = args[++i].split(',').map(r => r.split('-').map(x => parseInt(x, 16)));
  else if (args[i] === '--stop') opt.stopOnError = true;
  else if (args[i] === '--ix') opt.ix = parseInt(args[++i], 16);
}

global.window = undefined;
const SC = global.SC = {};
const jsDir = path.join(__dirname, '..', 'web', 'js');
const order = JSON.parse(fs.readFileSync(path.join(jsDir, 'order.json'), 'utf8'));
for (const f of order) vm.runInThisContext(fs.readFileSync(path.join(jsDir, f), 'utf8'), { filename: f });

SC.loadRom(new Uint8Array(fs.readFileSync(romPath)));
const snaps = fs.readFileSync(snapPath);
const REC = 0x2008;
const n = snaps.length / REC;
const tagFrom = +tagFromS, tagTo = +tagToS, routine = parseInt(routineS, 16);

function inRanges(a, ranges) { for (const [lo, hi] of ranges) if (a >= lo && a <= (hi === undefined ? lo : hi)) return true; return false; }
// stack, ISR-only state (frame counters, sound driver, sprite table, HUD) may change
// when an interrupt lands between the two snapshots
const defaultIgnore = [[0xDF00, 0xDFFF], [0xD44F], [0xDE00, 0xDEFF], [0xD12F], [0xD135], [0xD2C2], [0xD2BF],
  [0xDB00, 0xDBFF], [0xD110, 0xD111], [0xD134], [0xD137, 0xD157], [0xD34E, 0xD351], [0xD36F, 0xD372],
  [0xD174, 0xD177], [0xD15E], [0xD2D5], [0xD454, 0xD455], [0xD492, 0xD496], [0xD4A4]];
// screen coordinates of every object (+$1A..+$1D) are recomputed by the sprite code in the ISR
for (let o = 0xD500; o < 0xDA00; o += 0x40) defaultIgnore.push([o + 0x1A, o + 0x1D]);

let tested = 0, passed = 0, errors = 0, reported = 0;
const diffCount = {};
for (let i = 0; i + 1 < n; i++) {
  const a = snaps.subarray(i * REC, (i + 1) * REC);
  if (a[0] !== tagFrom) continue;
  const b = snaps.subarray((i + 1) * REC, (i + 2) * REC);
  if (b[0] !== tagTo) continue;
  const frame = a.readUInt32LE(4);
  SC.ram.set(a.subarray(8));
  SC.bank[0] = a[1]; SC.bank[1] = a[2]; SC.bank[2] = a[3];
  SC.R.ix = opt.ix; SC.R.iy = 0;
  tested++;
  try {
    SC.call(routine);
  } catch (e) {
    errors++;
    if (reported++ < opt.max) console.log(`frame ${frame}: ERROR ${e.message}`);
    if (opt.stopOnError) { console.log(e.stack); break; }
    continue;
  }
  const want = b.subarray(8);
  const diffs = [];
  for (let k = 0; k < 0x2000; k++) {
    const addr = 0xC000 + k;
    if (SC.ram[k] === want[k]) continue;
    if (inRanges(addr, defaultIgnore) || inRanges(addr, opt.ignore)) continue;
    if (opt.only && !inRanges(addr, opt.only)) continue;
    diffs.push(addr);
  }
  if (!diffs.length) { passed++; continue; }
  for (const d of diffs) diffCount[d] = (diffCount[d] || 0) + 1;
  if (reported++ < opt.max && !opt.quiet) {
    const pre = a.subarray(8);
    console.log(`frame ${frame}: ${diffs.length} diffs: ` + diffs.slice(0, 16).map(d =>
      SC.hex(d) + ' got ' + SC.ram[d - 0xC000].toString(16) + ' want ' + want[d - 0xC000].toString(16) + ' (was ' + pre[d - 0xC000].toString(16) + ')').join(', '));
  }
}
console.log(`tested ${tested}, passed ${passed}, errors ${errors}`);
const top = Object.entries(diffCount).sort((x, y) => y[1] - x[1]).slice(0, 20);
if (top.length) console.log('most frequent diffs: ' + top.map(([a, c]) => SC.hex(+a) + ':' + c).join(' '));
