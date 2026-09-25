/*
 * Sonic Chaos (SMS) - Turquoise Hill Zone 1 recreation
 * core.js: ROM access, Sega mapper, work RAM and helpers.
 *
 * The engine keeps the original game's RAM layout (C000-DFFF) so the ported
 * routines can be checked byte-for-byte against the original running in an
 * emulator. Routines are named after their original Z80 address (f_XXXX).
 */
(function (G) {
  'use strict';
  const SC = G.SC = G.SC || {};

  let rom = null, romLen = 0;
  const ram = new Uint8Array(0x2000);
  const bank = [0, 1, 2];
  SC.ram = ram;
  SC.bank = bank;

  SC.loadRom = function (buf) {
    rom = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    // Strip a possible 512-byte copier header.
    if ((rom.length & 0x3FFF) === 512) rom = rom.subarray(512);
    romLen = rom.length;
    SC.rom = rom;
    return SC.checkRom();
  };

  // CRC32 of the known dump (Sonic Chaos (USA, Europe) SMS)
  SC.checkRom = function () {
    let c, crc = 0xFFFFFFFF;
    const t = SC._crcT || (SC._crcT = (() => {
      const t = new Uint32Array(256);
      for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
      return t;
    })());
    for (let i = 0; i < romLen; i++) crc = t[(crc ^ rom[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };

  // ---- CPU address space ----
  function rb(a) {
    a &= 0xFFFF;
    if (a >= 0xC000) return ram[a & 0x1FFF];
    if (a < 0x400) return rom[a];
    return rom[((bank[a >> 14] << 14) | (a & 0x3FFF)) % romLen];
  }
  function wb(a, v) {
    a &= 0xFFFF;
    if (a < 0xC000) return;
    ram[a & 0x1FFF] = v & 0xFF;
    if (a >= 0xFFFD) bank[a - 0xFFFD] = v & 0x3F;
  }
  function rw(a) { return rb(a) | (rb(a + 1) << 8); }
  function ww(a, v) { wb(a, v); wb(a + 1, v >> 8); }
  function rs(a) { const v = rw(a); return v & 0x8000 ? v - 0x10000 : v; }
  function rsb(a) { const v = rb(a); return v & 0x80 ? v - 0x100 : v; }
  // Physical ROM access (bank:offset within 16K window)
  function prom(bankNo, addr) { return rom[((bankNo << 14) | (addr & 0x3FFF)) % romLen]; }
  function promw(bankNo, addr) { return prom(bankNo, addr) | (prom(bankNo, addr + 1) << 8); }

  SC.rb = rb; SC.wb = wb; SC.rw = rw; SC.ww = ww; SC.rs = rs; SC.rsb = rsb;
  SC.prom = prom; SC.promw = promw;
  SC.romByte = (p) => rom[p];

  // Bank switching as done by the game (RAM copy at D12B + mapper reg).
  SC.page2 = function (b) { wb(0xD12B, b); wb(0xFFFF, b); };
  SC.page1 = function (b) { wb(0xD12A, b); wb(0xFFFE, b); };

  // ---- Z80-ish arithmetic helpers ----
  SC.s8 = (v) => ((v & 0xFF) ^ 0x80) - 0x80;
  SC.s16 = (v) => ((v & 0xFFFF) ^ 0x8000) - 0x8000;
  // "dec hl; cpl h; cpl l" == two's complement negate
  SC.neg16 = (v) => (-v) & 0xFFFF;

  // ---- Index registers (object pointers) ----
  const R = SC.R = { ix: 0xD500, iy: 0 };
  SC.xb = (o) => rb(R.ix + o);
  SC.xs = (o, v) => wb(R.ix + o, v);
  SC.xw = (o) => rw(R.ix + o);
  SC.xsw = (o, v) => ww(R.ix + o, v);
  SC.xbit = (o, n) => (rb(R.ix + o) >> n) & 1;
  SC.xset = (o, n) => wb(R.ix + o, rb(R.ix + o) | (1 << n));
  SC.xres = (o, n) => wb(R.ix + o, rb(R.ix + o) & ~(1 << n));
  SC.yb = (o) => rb(R.iy + o);
  SC.ys = (o, v) => wb(R.iy + o, v);
  SC.yw = (o) => rw(R.iy + o);
  SC.ysw = (o, v) => ww(R.iy + o, v);
  SC.ybit = (o, n) => (rb(R.iy + o) >> n) & 1;
  SC.yset = (o, n) => wb(R.iy + o, rb(R.iy + o) | (1 << n));
  SC.yres = (o, n) => wb(R.iy + o, rb(R.iy + o) & ~(1 << n));
  SC.bset = (a, n) => wb(a, rb(a) | (1 << n));
  SC.bres = (a, n) => wb(a, rb(a) & ~(1 << n));
  SC.bit = (a, n) => (rb(a) >> n) & 1;

  // ---- Dispatch of Z80 addresses to ported routines ----
  // Routines living in slot 2 ($8000-$BFFF) are keyed by bank too.
  SC.fn = {};
  const key = (addr, b) => (addr >= 0x8000 ? ((b === undefined ? bank[2] : b) << 16) : 0) | addr;
  SC.def = function (addr, f, b) { SC.fn[key(addr, b)] = f; return f; };
  SC.call = function (addr, ...args) {
    const f = SC.fn[key(addr)];
    if (!f) throw new Error('Unported routine $' + addr.toString(16).toUpperCase().padStart(4, '0') +
      (addr >= 0x8000 ? ' (bank ' + bank[2] + ')' : ''));
    return f(...args);
  };
  // Call through the bank-0 jump table (JP nn stubs at $0338-$044E) or a direct address.
  SC.callAddr = function (addr) {
    if (addr < 0x0450 && addr >= 0x0320 && rom[addr] === 0xC3) addr = rom[addr + 1] | (rom[addr + 2] << 8);
    return SC.call(addr);
  };
  // Z80 "add a,n ; daa" on packed BCD values
  SC.bcdAdd = function (a, n) {
    let lo = (a & 0x0F) + (n & 0x0F), hi = (a >> 4) + (n >> 4);
    if (lo > 9) { lo -= 10; hi++; }
    if (hi > 9) hi -= 10;
    return ((hi << 4) | lo) & 0xFF;
  };
  // add with carry out, and "sub n ; daa"
  SC.bcdAddC = function (a, n) {
    let lo = (a & 0x0F) + (n & 0x0F), hi = (a >> 4) + (n >> 4), c = 0;
    if (lo > 9) { lo -= 10; hi++; }
    if (hi > 9) { hi -= 10; c = 1; }
    return [((hi << 4) | lo) & 0xFF, c];
  };
  SC.bcdSub = function (a, n) {
    let lo = (a & 0x0F) - (n & 0x0F), hi = (a >> 4) - (n >> 4);
    if (lo < 0) { lo += 10; hi--; }
    if (hi < 0) hi += 10;
    return ((hi << 4) | lo) & 0xFF;
  };
  // The original sometimes waits for VBlank inside the game logic (e.g. on death).
  SC.waitFrame = function () { SC.waitedFrames = (SC.waitedFrames | 0) + 1; };

  // View size.  256x192 reproduces the original screen exactly; wider views
  // move the screen-relative limits accordingly.
  SC.setView = function (w, h) {
    SC.VIEW_W = w; SC.VIEW_H = h;
    SC.SCREEN_RIGHT_LIMIT = w - 12;       // $F4
    SC.SCREEN_BOTTOM_LIMIT = h;           // $C0
    SC.SCREEN_DEATH_Y = h + 16;           // $D0
  };
  SC.setView(256, 192);

  SC.hex = (v, n = 4) => '$' + (v >>> 0).toString(16).toUpperCase().padStart(n, '0');
})(typeof window !== 'undefined' ? window : globalThis);
