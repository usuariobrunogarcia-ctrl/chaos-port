/*
 * main.js - page setup, ROM loading, input and the fixed 60 Hz game loop.
 */
(function () {
  'use strict';
  const SC = window.SC;
  const VIEW_H = 224;
  const canvas = document.getElementById('screen');
  const overlay = document.getElementById('overlay');
  const msg = document.getElementById('msg');
  let running = false;

  // ---- input ----
  const keys = new Set();
  const KEYMAP = {
    ArrowUp: 1, ArrowDown: 2, ArrowLeft: 4, ArrowRight: 8,
    KeyW: 1, KeyS: 2, KeyA: 4, KeyD: 8,
    KeyZ: 16, KeyX: 32, Space: 16, KeyJ: 16, KeyK: 32,
  };
  addEventListener('keydown', (e) => { if (KEYMAP[e.code] !== undefined) { keys.add(e.code); e.preventDefault(); } if (e.code === 'Enter' && SC.gameOver) restart(); });
  addEventListener('keyup', (e) => { keys.delete(e.code); });
  function joy() {
    if (SC.inputOverride) return SC.inputOverride();
    let j = 0;
    for (const k of keys) j |= KEYMAP[k];
    for (const gp of (navigator.getGamepads ? navigator.getGamepads() : [])) {
      if (!gp) continue;
      const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (b(12) || ay < -0.5) j |= 1;
      if (b(13) || ay > 0.5) j |= 2;
      if (b(14) || ax < -0.5) j |= 4;
      if (b(15) || ax > 0.5) j |= 8;
      if (b(0) || b(2)) j |= 16;
      if (b(1) || b(3)) j |= 32;
    }
    // no opposite directions at the same time
    if ((j & 3) === 3) j &= ~3;
    if ((j & 12) === 12) j &= ~12;
    return j;
  }
  // touch controls
  document.querySelectorAll('[data-k]').forEach((el) => {
    const code = el.dataset.k;
    const on = (e) => { keys.add(code); e.preventDefault(); };
    const off = (e) => { keys.delete(code); e.preventDefault(); };
    el.addEventListener('touchstart', on); el.addEventListener('touchend', off); el.addEventListener('touchcancel', off);
    el.addEventListener('mousedown', on); el.addEventListener('mouseup', off); el.addEventListener('mouseleave', off);
  });

  // ---- view size: 224 lines, width from the window's aspect ratio ----
  function viewWidth() {
    const a = innerWidth / innerHeight;
    let w = Math.round(VIEW_H * a / 2) * 2;
    return Math.max(256, Math.min(w, 512));
  }
  function fit() {
    const w = canvas.width, h = canvas.height;
    const s = Math.min(innerWidth / w, innerHeight / h);
    canvas.style.width = Math.floor(w * s) + 'px';
    canvas.style.height = Math.floor(h * s) + 'px';
  }
  addEventListener('resize', fit);

  // ---- ROM ----
  async function startWithRom(buf) {
    const crc = SC.loadRom(new Uint8Array(buf));
    if (crc !== 0xAEDF3BDF) {
      msg.textContent = 'La ROM no parece ser Sonic Chaos (SMS). CRC ' + crc.toString(16).toUpperCase() + ' — se intentará igual.';
    }
    try { localStorage.setItem('chaosRomOk', '1'); } catch (e) { /* ignore */ }
    const w = viewWidth();
    SC.setView(w, VIEW_H);
    SC.renderSetup(canvas, w, VIEW_H);
    fit();
    restart();
    overlay.style.display = 'none';
    if (!running) { running = true; requestAnimationFrame(loop); }
  }
  function restart() {
    SC.gameOver = false;
    SC.initGame();
  }
  document.getElementById('file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) f.arrayBuffer().then(startWithRom);
  });
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) f.arrayBuffer().then(startWithRom);
  });
  // Try the ROM that ships next to the disassembly in this repository.
  const tryPaths = ['../Sonic%20Chaos/SonicChaos.sms', 'SonicChaos.sms', 'rom/SonicChaos.sms'];
  (async function autoload() {
    for (const p of tryPaths) {
      try {
        const r = await fetch(p);
        if (r.ok) { startWithRom(await r.arrayBuffer()); return; }
      } catch (e) { /* not served over http, or missing */ }
    }
  })();

  // ---- loop: fixed 60 Hz logic, render on every display frame ----
  const STEP = 1000 / 60;
  let acc = 0, last = performance.now();
  function tick() {
    SC.vblank(joy());
    if (!SC.gameOver) SC.logic();
  }
  function loop(now) {
    acc += Math.min(now - last, 250);
    last = now;
    let n = 0;
    while (acc >= STEP && n < 5) { tick(); acc -= STEP; n++; }
    SC.render(SC.rw(0xD174), SC.rw(0xD176));
    banner();
    requestAnimationFrame(loop);
  }
  const bannerEl = document.getElementById('banner');
  let bannerText = '';
  const bcd = (v) => (v >> 4) * 10 + (v & 15);
  function banner() {
    let t = '';
    if (SC.gameOver) t = 'GAME OVER\n\nEnter para reintentar';
    else if (SC.results && SC.results.t > 30) {
      const r = SC.results;
      const rings = bcd(r.rings), mins = bcd(r.time >> 8), secs = bcd(r.time & 0xFF);
      t = 'SONIC HAS PASSED\n\nRINGS  ' + rings + ' x 100 = ' + rings * 100 +
          '\nTIME   ' + mins + ':' + String(secs).padStart(2, '0') + '\n\nEnter para jugar otra vez';
    }
    if (t !== bannerText) { bannerText = t; bannerEl.textContent = t; bannerEl.style.display = t ? 'block' : 'none'; }
  }
  addEventListener('keydown', (e) => { if (e.code === 'Enter' && SC.results && SC.results.t > 30) { SC.results = null; restart(); } });
  window.addEventListener('blur', () => keys.clear());
})();
