/*
 * vdp.js - a model of the SMS video memory used by the renderer.
 * The game streams graphics into VRAM (Sonic's current frame, monitor icons,
 * animated rings...), so we keep a VRAM image and write to it exactly where the
 * original does.  Tiles are 4bpp planar, 32 bytes each; 512 tiles.
 */
(function (G) {
  'use strict';
  const SC = G.SC;
  const vram = new Uint8Array(0x4000);
  const cram = new Uint8Array(32);
  const tileDirty = new Uint8Array(512);   // renderer cache invalidation
  let dirtyAny = true;
  SC.vram = vram; SC.cram = cram; SC.tileDirty = tileDirty;
  SC.vdpDirty = () => dirtyAny;
  SC.vdpClean = () => { dirtyAny = false; };

  function markTile(addr) { tileDirty[(addr >> 5) & 0x1FF] = 1; dirtyAny = true; }
  function vw(addr, v) { addr &= 0x3FFF; if (vram[addr] !== v) { vram[addr] = v; markTile(addr); } }
  SC.vramWrite = vw;
  SC.vramFill = function (addr, n, v) { for (let i = 0; i < n; i++) vw(addr + i, v); };
  SC.vramCopy = function (addr, src, mirror) {
    for (let i = 0; i < src.length; i++) vw(addr + i, mirror ? SC.romByte(0x100 + src[i]) : src[i]);
  };

  // $24C2: decompress tiles from ROM (current slot mapping) into VRAM at addr.
  // mode != 0 mirrors every byte through the table at $0100 (horizontal flip).
  SC.decompArt = function (addr, src, mode) {
    const rb = SC.rb;
    const count = rb(src + 2) | (rb(src + 3) << 8);
    const flagOff = rb(src + 4) | (rb(src + 5) << 8);
    let flags = (src + flagOff) & 0xFFFF;
    let data = (src + 6) & 0xFFFF;
    const tile = new Uint8Array(32);
    for (let t = 0; t < count; t++) {
      const code = (rb(flags + (t >> 2)) >> ((t & 3) * 2)) & 3;
      if (code === 0) tile.fill(0);
      else if (code === 1) { for (let i = 0; i < 32; i++) tile[i] = rb(data + i); data += 32; }
      else {
        const mask = rb(data) | (rb(data + 1) << 8) | (rb(data + 2) << 16) | (rb(data + 3) << 24);
        data += 4;
        for (let i = 0; i < 32; i++) {
          if (mask & (1 << i)) tile[i] = rb(data++); else tile[i] = 0;
        }
        if (code === 3) {
          for (let i = 0; i < 14; i += 2) {
            tile[i + 2] ^= tile[i]; tile[i + 3] ^= tile[i + 1];
            tile[i + 18] ^= tile[i + 16]; tile[i + 19] ^= tile[i + 17];
          }
        }
      }
      for (let i = 0; i < 32; i++) vw(addr + t * 32 + i, mode ? SC.romByte(0x100 + tile[i]) : tile[i]);
    }
  };
  // copy n bytes from CPU space to VRAM
  SC.vramFromCpu = function (addr, src, n, mirror) {
    for (let i = 0; i < n; i++) {
      const v = SC.rb(src + i);
      vw(addr + i, mirror ? SC.romByte(0x100 + v) : v);
    }
  };

  // CRAM: 32 entries, --bbggrr
  const rgb = new Uint32Array(32);
  SC.cramRGB = rgb;
  SC.setCram = function (i, v) {
    cram[i] = v;
    const r = (v & 3) * 85, g = ((v >> 2) & 3) * 85, b = ((v >> 4) & 3) * 85;
    rgb[i] = (255 << 24) | (b << 16) | (g << 8) | r;   // little-endian ABGR for ImageData
  };
})(typeof window !== 'undefined' ? window : globalThis);
