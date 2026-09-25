/*
 * camera.js - camera bounds helpers ($59B3-$5A02) and the camera update ($4C90).
 */
(function (G) {
  'use strict';
  const SC = G.SC;
  const { rb, wb, rw, ww, bset, bres, def } = SC;

  def(0x59B3, () => bset(0xD15E, 7));
  def(0x59B9, () => { bres(0xD15E, 7); ww(0xD280, rw(0xD174)); });
  // lock the camera: bc = left bound, de = top bound
  def(0x59C5, (bc, de) => { bset(0xD15E, 7); bset(0xD15F, 0); ww(0xD2DA, bc); ww(0xD2DC, de); });
  def(0x59D8, () => { bset(0xD15E, 7); bres(0xD15F, 0); });
  // left bound follows the camera (can't go back)
  def(0x59E3, () => { const de = rw(0xD174); if (rw(0xD280) >= de) return; ww(0xD280, de); });
  def(0x59F3, () => { const de = rw(0xD174); if (rw(0xD282) < de) return; ww(0xD282, de); });

  // ------------------------------------------------------------ $4C90 camera
  // Moves the camera target ($D284/$D286) towards Sonic; the interrupt then copies
  // it to the real camera ($D174/$D176).  The VDP streaming of new tile columns/rows
  // is not needed here (the renderer draws straight from the layout).
  const R = SC.R;
  function f_4C90() {
    R.ix = 0xD15E;
    if (!(rb(0xD15E) & 0x80)) return;
    f_5832();
    SC.page2(rb(0xD162));
    f_4CB0();
    f_4CF7();
    f_4D3E();
    bset(0xD15E, 6);
  }
  function f_5832() {
    wb(0xD15E, rb(0xD15E) & 0xF0);
    if (rb(0xD15F) & 1) return f_5956();
    f_58E1();
    // horizontal
    let b = rb(0xD28A);
    let hl = (rw(0xD511) - rw(0xD284)) & 0xFFFF;
    if (hl !== 0) {
      const l = hl & 0xFF;
      if (l >= b) {
        b = rb(0xD28B);
        if (l >= b) {
          let a = l - b;
          if (a >= 8) a = 7;
          ww(0xD284, ((hl & 0xFF00) | a) + rw(0xD174) & 0xFFFF);
          bset(0xD15E, 3);
        }
      } else {
        b = rb(0xD28C);
        if (l < b) {
          let a = (l - b) & 0xFF;
          if (a < 0xF8) a = 0xF9;
          ww(0xD284, (0xFF00 | a) + rw(0xD174) & 0xFFFF);
          bset(0xD15E, 2);
        }
      }
    }
    // vertical
    b = rb(0xD28D);
    hl = (rw(0xD514) - rw(0xD286)) & 0xFFFF;
    if (hl === 0) return;
    const l = hl & 0xFF;
    if (l >= b) {
      b = rb(0xD28E);
      if (l < b) return;
      let a = l - b;
      if (a >= 8) a = 7;
      ww(0xD286, ((hl & 0xFF00) | a) + rw(0xD176) & 0xFFFF);
      bset(0xD15E, 1);
      return;
    }
    b = rb(0xD28F);
    if (l >= b) return;
    let a = (l - b) & 0xFF;
    if (a < 0xF8) a = 0xF9;
    ww(0xD286, (0xFF00 | a) + rw(0xD176) & 0xFFFF);
    bset(0xD15E, 0);
  }
  // Camera offsets: the original uses screen positions for a 256x192 screen.
  // For other view sizes they are mapped around the screen centre.
  function camX(v) { return SC.VIEW_W === 256 ? v : v + ((SC.VIEW_W - 256) >> 1); }
  function f_58E1() {
    let b = 0x78;
    if (!(rb(0xD15F) & 3)) {
      b = (rb(0xD504) & 0x10) ? 0x88 : 0x68;
    }
    wb(0xD288, camX(b));
    b = rb(0xD28A);
    const tx = rb(0xD288);
    if (tx !== b) {
      b = tx > b ? b + 1 : b - 1;
      wb(0xD28A, b);
      wb(0xD28C, b - 8);
      wb(0xD28B, b + 8);
    }
    b = rb(0xD28D);
    const ty = SC.camY(rb(0xD289));
    if (ty === b) return;
    b = ty > b ? b + 1 : b - 1;
    wb(0xD28D, b);
    wb(0xD28F, b - 0x10);
    wb(0xD28E, b + 0x20 - 0x10);
  }
  SC.camY = (v) => (SC.VIEW_H === 192 ? v : Math.min(SC.VIEW_H - 8, Math.round(v * SC.VIEW_H / 192)));
  function f_5935() {
    const a = rb(0xD288);
    wb(0xD28A, a); wb(0xD28C, a - 8); wb(0xD28B, a + 8);
    const y = SC.camY(rb(0xD289));
    wb(0xD28D, y); wb(0xD28F, y - 0x10); wb(0xD28E, y + 0x10);
  }
  // camera locked (goal): move 1px/frame towards ($D2DA,$D2DC)
  function f_5956() {
    let de = rw(0xD174);
    let hl = rw(0xD2DA);
    if (hl !== de) {
      if (hl > de) {
        ww(0xD284, de + 1);
        bset(0xD15E, 3);
        if (rb(0xD297) !== 6) ww(0xD282, rw(0xD2DA));
      } else {
        ww(0xD284, de - 1);
        bset(0xD15E, 2);
        if (rb(0xD297) !== 6) ww(0xD280, rw(0xD2DA));
      }
    }
    de = rw(0xD176);
    hl = rw(0xD2DC);
    if (hl === de) return;
    if (hl > de) { ww(0xD286, de + 1); bset(0xD15E, 1); }
    else { ww(0xD286, de - 1); bset(0xD15E, 0); }
  }
  // level bounds
  function f_4CB0() {
    if (rb(0xD15E) & 0x04) {
      const hl = rw(0xD284);
      if ((hl >> 8) === 0xFF || hl < rw(0xD280)) { ww(0xD284, rw(0xD174)); return; }
      return;
    }
    if (!(rb(0xD15E) & 0x08)) return;
    if (rw(0xD284) >= rw(0xD282)) ww(0xD284, rw(0xD174));
  }
  function f_4CF7() {
    if (rb(0xD15E) & 0x01) {
      const hl = rw(0xD286);
      if ((hl >> 8) === 0xFF || hl < rw(0xD27C)) { ww(0xD286, rw(0xD176)); return; }
      return;
    }
    if (!(rb(0xD15E) & 0x02)) return;
    if (rw(0xD286) >= rw(0xD27E)) ww(0xD286, rw(0xD176));
  }
  function f_4D3E() {
    wb(0xD172, (-(rb(0xD174) + 1)) & 0xFF);
    let hl = (rw(0xD176) + 0x11) & 0xFFFF;
    hl %= 0xE0;
    wb(0xD173, hl & 0xFF);
  }
  def(0x4C90, f_4C90);
  def(0x5832, f_5832);
  def(0x58E1, f_58E1);
  def(0x5935, f_5935);
})(typeof window !== 'undefined' ? window : globalThis);
