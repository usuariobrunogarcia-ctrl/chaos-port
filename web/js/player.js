/*
 * player.js - Sonic's logic, ported from the original Z80 code.
 * Bank 0 ($3600-$3FFF): per-state handlers.  Bank 1 ($3FEF-$4C8F): physics core.
 * Routines are named f_XXXX after their original address.
 */
(function (G) {
  'use strict';
  const SC = G.SC;
  const { rb, wb, rw, ww, xb, xs, xw, xsw, xbit, xset, xres, bset, bres, bit, def } = SC;
  const R = SC.R;
  const neg16 = SC.neg16;
  const abs16 = (v) => (v & 0x8000 ? (-v) & 0xFFFF : v);
  const call = SC.call;

  // Joypad bits in $D137 (held) / $D147 (pressed): 0 up, 1 down, 2 left, 3 right, 4 button1, 5 button2
  const JOY = 0xD137, JOYP = 0xD147;

  // ---------------------------------------------------------------- playable characters
  // 'sonic' runs the original code unchanged.  'knuckles' shares Sonic's engine
  // (same ground physics) and adds his Sonic 3 moves: a lower jump, gliding
  // (press jump again in the air), wall climbing and climbing onto ledges.
  const CHARACTERS = {
    sonic: { name: 'Sonic', jump: 0xFBC0, jumpWater: 0xFCC0 },
    knuckles: { name: 'Knuckles', jump: 0xFC18, jumpWater: 0xFD00, knuckles: true },
  };
  SC.CHARACTERS = CHARACTERS;
  SC.character = 'sonic';
  const charDef = () => CHARACTERS[SC.character] || CHARACTERS.sonic;
  const jumpVel = () => (rb(0xD443) ? charDef().jumpWater : charDef().jump);

  // ---------------------------------------------------------------- Knuckles
  // Speeds are Sonic 3's scaled to Sonic Chaos (top speed 4 px/frame against 6).
  // All values are 8.8 fixed point, px/frame.
  const GLIDE_START = 0x02A0;    // glide speed when it starts
  const GLIDE_ACCEL = 0x0003;    // added every frame while not turning
  const GLIDE_MAX = 0x0600;
  const GLIDE_FALL = 0x0055;     // vertical speed the glide settles at
  const GLIDE_FALL_STEP = 0x0010;
  const GLIDE_TURN = 4;          // turning angle step (128 = half turn)
  const CLIMB_UP = 0x00C0, CLIMB_DOWN = 0x0100;
  const WALLJUMP_X = 0x0280, WALLJUMP_Y = 0xFD00;
  const SLIDE_DECEL = 0x0010, GETUP_FRAMES = 12;
  // mode: null | 'glide' | 'drop' (let go of a glide) | 'climb' | 'ledge' |
  //       'slide' (landed from a glide) | 'getup'
  const K = { mode: null, t: 0, dir: 1, speed: 0, ang: 0, target: 0, climbT: 0 };
  SC.knux = K;
  SC.resetCharacter = () => { K.mode = null; K.t = 0; };
  const AIR_MODES = { glide: 1, drop: 1, climb: 1, ledge: 1 };

  // y += v (16.8 fixed point, sign-extended), like the end of $4097
  function addY(hl) {
    const c = hl & 0x8000 ? 0xFF : 0;
    const sum = rw(0xD513) + hl;
    ww(0xD513, sum & 0xFFFF);
    wb(0xD515, (c + (sum > 0xFFFF ? 1 : 0) + xb(21)) & 0xFF);
  }
  // Is the terrain solid dx pixels right of the player and dy below his feet?
  function solidAt(dx, dy) {
    SC.sensor(dx & 0xFFFF, dy & 0xFFFF);
    if (!(rb(0xD364) & 0x80)) return false;
    const h = rb(0xD368);
    if (h & 0x40) return (h & 0x3F) !== 0;
    return (rb(0xD35A) & 0x1F) + (h & 0x3F) >= 0x20;
  }
  const wallBit = (dir) => (dir > 0 ? 2 : 3);

  // Called in the jump state (0A) before anything else.  Returns true when it
  // has done the whole frame.
  function knuckles() {
    if (!charDef().knuckles) return false;
    switch (K.mode) {
      case null:
        // glide: button pressed again once the jump has been released
        if (!(rb(JOYP) & 0x30) || rb(0xD3B2) !== 0x20) return false;
        startGlide();
        return glideStep();
      case 'glide': return glideStep();
      case 'climb': return climbStep();
      case 'ledge': return ledgeStep();
      default: return false;   // 'drop': plain falling
    }
  }
  function startGlide() {
    K.mode = 'glide';
    K.dir = xbit(4, 4) ? -1 : 1;
    K.target = K.ang = K.dir > 0 ? 0 : 128;
    K.speed = Math.max(GLIDE_START, abs16(rw(0xD516)));
    if (SC.s16(rw(0xD518)) < 0) ww(0xD518, 0);
    ww(0xD373, 0x0700);          // let $402A move faster than the running cap
    xset(3, 0); xset(3, 1);      // in the air, attacking
    wb(0xDE04, 0xAC);
  }
  function glideStep() {
    if (!(rb(JOY) & 0x30)) {
      // let go: drop with a quarter of the speed
      K.mode = 'drop';
      ww(0xD516, (SC.s16(rw(0xD516)) >> 2) & 0xFFFF);
      ww(0xD373, 0x0400);
      xres(3, 1);
      return false;
    }
    const joy = rb(JOY);
    if (joy & 4) K.target = 128; else if (joy & 8) K.target = 0;
    if (K.ang !== K.target) {
      K.ang += K.ang < K.target ? GLIDE_TURN : -GLIDE_TURN;
    } else if (K.speed < GLIDE_MAX) {
      K.speed = Math.min(GLIDE_MAX, K.speed + GLIDE_ACCEL);
    }
    const vx = Math.round(K.speed * Math.cos(K.ang * Math.PI / 128));
    if (K.ang < 64) xres(4, 4); else if (K.ang > 64) xset(4, 4);
    let vy = SC.s16(rw(0xD518));
    vy = vy < GLIDE_FALL ? Math.min(GLIDE_FALL, vy + GLIDE_FALL_STEP) : Math.max(GLIDE_FALL, vy - GLIDE_FALL_STEP);
    ww(0xD518, vy & 0xFFFF);
    ww(0xD516, vx & 0xFFFF);
    ww(0xD375, 0); ww(0xD377, 0);
    call(0x4B46);
    f_401A();
    if (screenClamp()) K.speed = GLIDE_START;
    f_402A();
    addY(rw(0xD518));
    call(0x690B);
    f_48BC();
    if (rb(0xD502) !== 0x0A) { endMode(); return true; }       // hurt, spring...
    if (xbit(35, 1)) {
      // landed: belly slide
      K.mode = 'slide';
      ww(0xD516, vx & 0xFFFF);
      f_45CE();
      return true;
    }
    const dir = vx > 0 ? 1 : vx < 0 ? -1 : 0;
    if (dir && xbit(34, wallBit(dir))) startClimb(dir);
    return true;
  }
  function endMode() {
    if (K.mode === 'glide') ww(0xD373, 0x0400);
    K.mode = null;
  }
  function startClimb(dir) {
    K.mode = 'climb';
    K.dir = dir;
    K.climbT = 0;
    ww(0xD516, 0); ww(0xD518, 0); ww(0xD375, 0);
    ww(0xD373, 0x0400);
    xset(3, 0); xres(3, 1);
    if (dir > 0) xres(4, 4); else xset(4, 4);
    wb(0xDE04, 0xA1);
  }
  function climbStep() {
    call(0x4B46);
    f_401A();
    if (rb(JOYP) & 0x30) {
      // jump away from the wall
      K.mode = null;
      if (K.dir > 0) xset(4, 4); else xres(4, 4);
      ww(0xD516, (K.dir > 0 ? -WALLJUMP_X : WALLJUMP_X) & 0xFFFF);
      ww(0xD518, WALLJUMP_Y);
      xset(3, 0); xset(3, 1);
      wb(0xD3B2, 0x20);
      wb(0xDE04, 0xA2);
      return false;
    }
    const joy = rb(JOY);
    const vy = joy & 1 ? -CLIMB_UP : joy & 2 ? CLIMB_DOWN : 0;
    if (vy) K.climbT++;
    ww(0xD516, 0);
    ww(0xD518, vy & 0xFFFF);
    addY(vy & 0xFFFF);
    ww(0xD511, (rw(0xD511) + K.dir) & 0xFFFF);   // lean on the wall so it pushes back
    call(0x690B);
    f_48BC();
    if (rb(0xD502) !== 0x0A) { K.mode = null; return true; }
    if (xbit(35, 1)) {
      // climbed down to the floor
      K.mode = null;
      ww(0xD518, 0);
      f_45CE();
      return true;
    }
    if (!xbit(34, wallBit(K.dir))) {
      ww(0xD511, (rw(0xD511) - K.dir) & 0xFFFF);
      if (vy < 0 && solidAt(K.dir * 12, -4)) {
        K.mode = 'ledge'; K.t = 0;
      } else {
        K.mode = 'drop';
        ww(0xD518, 0);
      }
    }
    return true;
  }
  // Pull up onto the top of the wall: rise until the feet clear it, then step over.
  function ledgeStep() {
    K.t++;
    ww(0xD516, 0); ww(0xD518, 0);
    if (K.t <= 32 && solidAt(K.dir * 12, -1)) {
      ww(0xD514, (rw(0xD514) - 1) & 0xFFFF);
    } else if (K.t <= 32 + 14) {
      if (K.t < 32) K.t = 32;
      if (!solidAt(K.dir * 12, -8)) ww(0xD511, (rw(0xD511) + K.dir) & 0xFFFF);
    } else {
      K.mode = null;
      wb(0xD510, 0);
      ww(0xD518, 0x0100);
      xset(3, 0); xres(3, 1);
      wb(0xD3B2, 0x21);
    }
    f_48BC();
    if (rb(0xD502) !== 0x0A) K.mode = null;
    return true;
  }
  // Called before the state handler: belly slide after landing from a glide.
  function knucklesGround() {
    if (K.mode && AIR_MODES[K.mode] && rb(0xD501) !== 0x0A) endMode();
    if (K.mode !== 'slide' && K.mode !== 'getup') return;
    const st = rb(0xD502);
    if (st !== 0x01 && st !== 0x05 && st !== 0x06) { K.mode = null; return; }
    wb(JOY, rb(JOY) & 0xF0);        // no steering; buttons stay held so they do not re-trigger
    wb(JOYP, rb(JOYP) & 0xC0);
    if (K.mode === 'getup') {
      if (++K.t >= GETUP_FRAMES) K.mode = null;
      return;
    }
    let vx = SC.s16(rw(0xD516));
    if (Math.abs(vx) <= SLIDE_DECEL) {
      ww(0xD516, 0);
      K.mode = 'getup'; K.t = 0;
      return;
    }
    vx -= Math.sign(vx) * SLIDE_DECEL;
    ww(0xD516, vx & 0xFFFF);
  }

  // ---------------------------------------------------------------- $361D
  // Player object update (called once per frame from the main loop).
  function f_361D() {
    R.ix = 0xD500;
    if (rb(0xD500) === 0) return;
    if (charDef().knuckles) knucklesGround();
    xres(4, 7);
    if (rb(0xD44B) & 0x40) f_4984();
    wb(0xD44F, 0xFF);
    SC.page2(0x0C);
    call(0x64FA);            // animation script
    wb(0xD44F, 0);
    wb(0xD44F, 0xFF);
    SC.page2(0x0C);
    call(0x5E91);            // logic handler of current frame
    wb(0xD44F, 0);
    return f_4A74();
  }

  // $3657: state 00 init
  function f_3657() {
    const iy = R.iy;
    xs(10, 0x40); xs(11, 0x00); xs(6, 0x10); xs(5, 0x08);
    ww(0xD373, 0x0400);
    xres(4, 4);
    f_3686();
    R.iy = iy;
    xs(2, (xb(2) + 1) & 0xFF);
    if (rb(0xD297) !== 7) return;
    xs(2, 0x29);
  }
  function f_3686() {
    // Collision box offsets (left/right sensors) - identical for Sonic and Tails
    ww(0xD498, 0xFFF7); ww(0xD49A, 0xFFF4);
    ww(0xD49C, 0x0009); ww(0xD49E, 0xFFF4);
  }

  // $36C6: state 01 standing
  function f_36C6() {
    wb(0xD289, 0x60);
    f_3FEF();
    if (rb(0xD502) !== 0x01) return;
    if (rw(0xD516) !== 0) return f_45CE();
    const a = rb(JOY);
    if (a & 0x0C) return f_45CE();
    if (a & 1) return f_46B0();
    if (a & 2) return f_46BB();
  }
  // $36F0: state 02 waiting (bored)
  function f_36F0() {
    f_3FEF();
    if (rb(0xD502) !== 0x02) return;
    const a = rb(JOY);
    if (a & 0x30) return f_45ED();
    if (a & 0x0C) return f_45CE();
    if (a & 1) return f_46B0();
    if (a & 2) return f_46BB();
  }
  // $3713: state 03 looking up
  function f_3713() {
    if (rb(0xD3C0) === 0) wb(0xD289, 0xB8);
    if (xb(0) - 1 === 0) {
      if (rb(JOYP) & 0x30) return f_46CE();
    } else {
      if (rb(0xD443) === 0 && (rb(JOYP) & 0x30)) return f_473C();
    }
    f_3FEF();
    if (rb(0xD502) !== 0x03) return;
    const a = rb(JOY);
    if (a & 0x0C) return f_45CE();
    if (a & 2) return f_46BB();
    if (!(a & 1)) return f_45B3();
  }
  // $3759: state 04 ducking
  function f_3759() {
    if (rb(0xD3C0) === 0) wb(0xD289, 0x30);
    if (rb(JOYP) & 0x30) return f_4701();
    f_3FEF();
    if (rb(0xD502) !== 0x04) return;
    const a = rb(JOY);
    if (a & 1) return f_46B0();
    if (!(a & 2)) return f_45B3();
  }
  // $3783: state 05 walking
  function f_3783() {
    wb(0xD289, 0x60);
    f_3FEF();
    if (xb(2) !== 0x05) return;
    f_48A7();
    if (((xb(23) + 1) & 0xFF) >= 2) {
      if (bit(JOY, 1)) return f_47DC();
    }
    if (rb(0xD443) === 0) {
      const hl = abs16(rw(0xD516));
      if (rb(0xD374) === (hl >> 8)) return f_47A9();
      if (xbit(36, 0)) return f_4663();
    }
    f_37CC();
    return f_3831();
  }
  function f_37CC() {
    if (rb(JOY) & 0x0C) return;
    const hl = abs16(rw(0xD516));
    if (((hl & 0xE0) | (hl >> 8)) !== 0) return;
    let a = rb(0xD377);
    if (a & 0x80) a = (-a) & 0xFF;
    if (a < 0x18) return f_45B3();
  }
  function f_37F4() {
    const a = rb(0xD517);
    if (!(a & 0x80)) {
      if (bit(JOY, 2)) return f_47B6();
    } else {
      if (bit(JOY, 3)) return f_47C9();
    }
    // $380C
    if (rb(0xD369) !== 0) return;
    const hl = abs16(rw(0xD516));
    if (((hl & 0xF0) | (hl >> 8)) !== 0) return;
    if (rb(JOY) & 2) return f_46BB();
    return f_45B3();
  }
  function f_3831() {
    const a = rb(0xD517);
    if (a === 0 || a === 0xFF) return;
    if (!xbit(23, 7)) {
      if (bit(JOY, 2)) return f_47B6();
      return;
    }
    if (bit(JOY, 3)) return f_47C9();
  }
  // $384D: state 06 running
  function f_384D() {
    f_3FEF();
    if (rb(0xD502) !== 0x06) return;
    if (bit(JOY, 1)) return f_47DC();
    let a = rb(0xD517);
    if (a & 0x80) a = (-a) & 0xFF;
    if (a < 4) return f_45CE();
    return f_3831();
  }
  // $386F: state 07 skidding (moving right)
  function f_386F() {
    if (xbit(35, 3)) return f_45CE();
    f_3FEF();
    if (rb(0xD502) !== 0x07) return;
    f_37CC();
    xres(4, 4);
    const b = rb(0xD517) & 0x80;
    const a = ((rb(JOY) >> 4) | (rb(JOY) << 4)) & 0x80;
    if (a ^ b) return f_45CE();
  }
  // $389A: state 08 skidding (moving left)
  function f_389A() {
    if (xbit(35, 2)) return f_45CE();
    f_3FEF();
    if (rb(0xD502) !== 0x08) return;
    f_37CC();
    xset(4, 4);
    const b = rb(0xD517) & 0x80;
    const a = ((rb(JOY) << 4) | (rb(JOY) >> 4)) & 0x80;
    if ((a ^ b) === 0) return;
    return f_45CE();
  }
  // $38C5: state 09 rolling
  function f_38C5() {
    f_3FEF();
    if (rb(0xD502) !== 0x09) return;
    return f_37F4();
  }
  // $38D1: state 1B (bounced / sprung, curled)
  function f_38D1() {
    f_3FEF();
    if (rb(0xD502) !== 0x1B) return;
    if (!xbit(35, 1)) return;
    xres(3, 0);
    if (rb(JOYP) & 0x30) return f_45ED();
    const hl = abs16(rw(0xD516));
    if (((hl & 0xC0) | (hl >> 8)) === 0) return f_45B3();
  }
  // $3901: state 0A jumping (variable height: keeps rising while button held)
  function f_3901() {
    if (knuckles()) return;
    if (!(rb(JOY) & 0x30)) {
      wb(0xD3B2, 0x20);
    } else {
      wb(0xD3B2, (rb(0xD3B2) + 1) & 0xFF);
      if (rb(0xD3B2) < 0x0E) ww(0xD518, jumpVel());
    }
    f_3FEF();
    if (rb(0xD502) !== 0x0A) return;
    if (!xbit(35, 1)) return;
    if (rb(0xD36C) !== 0x0D) return f_45CE();
  }
  // $393B: state 0B (spring / thrown in air, spinning)
  function f_393B() {
    f_3FEF();
    if (rb(0xD502) !== 0x0B) return;
    if (xbit(35, 1)) return f_45CE();
    if (!xbit(25, 7)) return f_463C();
    return f_48A7();
  }
  // $3955: state 1C
  function f_3955() {
    f_3FEF();
    if (rb(0xD502) !== 0x1C) return;
    if (xbit(35, 1)) return f_45CE();
    if (!xbit(25, 7)) return f_463C();
  }
  // $396D: state 16 super peel-out charge (Sonic)
  function f_396D() {
    xres(4, 7);
    wb(0xD289, 0x60);
    call(0x690B);
    if (xbit(35, 3)) ww(0xD511, rw(0xD511) + 4);
    else if (xbit(35, 2)) ww(0xD511, rw(0xD511) - 4);
    f_48BC();
    f_4281();
    if (rb(JOYP) & 0x30) wb(0xDE04, 0xAC);
    if (!(rb(JOY) & 0x01)) return f_46E2();
  }
  // $39B6: state 1A peel-out running
  function f_39B6() {
    wb(0xD289, 0x60);
    f_3FEF();
    f_4281();
    if (rb(0xD502) !== 0x1A) return;
    if (rb(0xD523) & 0x0C) {
      xres(3, 1); xres(3, 7);
      return f_45CE();
    }
    if ((rb(0xD36C) & 0x3F) === 0x19) return f_47A9();
    return f_37F4();
  }
  // $39E6: state 0F spin-dash charge
  function f_39E6() {
    xres(4, 7);
    wb(0xD289, 0x60);
    call(0x690B);
    if (xbit(35, 3)) ww(0xD511, rw(0xD511) + 4);
    else if (xbit(35, 2)) ww(0xD511, rw(0xD511) - 4);
    f_48BC();
    f_4281();
    if (!(rb(JOY) & 0x02)) return f_4719();
  }
  // $3A23: state 10 spin-dash released / dash booster
  function f_3A23() {
    wb(0xD289, 0x60);
    f_3FEF();
    f_4281();
    if (rb(0xD502) !== 0x10) return;
    return f_37F4();
  }
  // $3A37: state 0E (falling / hurt recovery)
  function f_3A37() {
    f_3FEF();
    if (rb(0xD502) !== 0x0E) return;
    if (xbit(35, 1)) return f_45CE();
  }
  // $3A48: state 14
  function f_3A48() {
    f_3FEF();
    if (rb(0xD502) !== 0x14) return;
    if (xbit(35, 1)) return f_45CE();
  }
  // $3A59
  function f_3A59() {
    xres(4, 7);
    xsw(22, 0xFF00);
    f_3FEF();
    if (!xbit(35, 1)) return;
    return f_45CE();
  }
  // $3A71: state 1E (hurt)
  function f_3A71() {
    f_3FEF();
    if (xbit(35, 1)) return f_45CE();
  }
  // $3A7C: state 11 rocket shoes flight
  function f_3A7C() {
    xres(4, 7);
    f_3AC1();
    f_3B25();
    f_48A7();
    const b = xbit(4, 4) ? 0x04 : 0x08;
    wb(JOY, rb(JOY) | b);
    f_3FEF();
    if (xbit(35, 1)) {
      xres(34, 1);
      ww(0xD514, rw(0xD514) - 2);
      ww(0xD518, 0);
    }
    if (rw(0xD44C) !== 0) return;
    call(0x189B);
    return f_463C();
  }
  function f_3AC1() {
    const a = rb(JOY);
    if (a & 1) {
      let hl = (xw(24) + 0xFFC0) & 0xFFFF;
      xsw(24, hl);
      const h = hl >> 8;
      if (!(h & 0x80)) return;
      if (h >= 0xFD) return;
      xsw(24, 0xFC00);
      return;
    }
    if (a & 2) {
      const hl = (xw(24) + 0x0040) & 0xFFFF;
      xsw(24, hl);
      const h = hl >> 8;
      if (h & 0x80) return;
      if (h < 3) return;
      xsw(24, 0x0400);
      return;
    }
    let hl = xw(24);
    const de = (hl & 0x8000) ? 0x0020 : 0xFFE0;
    xsw(24, (hl + de) & 0xFFFF);
  }
  // Keep Sonic inside the vertical screen area while flying.
  function f_3B25() {
    const sy = rw(0xD51C);
    let de;
    if (sy < 0x18) de = 0x19;
    else if (sy < SC.SCREEN_BOTTOM_LIMIT) return;
    else de = SC.SCREEN_BOTTOM_LIMIT - 1;
    ww(0xD514, (rw(0xD176) + de) & 0xFFFF);
    ww(0xD518, 0);
  }
  // $3B4E: state riding an object (e.g. a platform that carries Sonic)
  function f_3B4E() {
    f_3FEF();
    f_48A7();
    f_3BA8();
    if (rb(JOYP) & 0x30) {
      R.iy = rw(0xD3A4); SC.ys(2, 0x05);
      xres(3, 0);
      return f_45ED();
    }
    if (xb(35) & 0x0C) {
      R.iy = rw(0xD3A4); SC.ys(2, 0x05);
      return call(0x494F);
    }
    if (!xbit(35, 1)) return;
    xres(34, 1);
    xset(3, 0);
    ww(0xD518, 0xF880);
    ww(0xD514, rw(0xD514) - 1);
    R.iy = rw(0xD3A4); SC.ys(2, 0x03);
    wb(0xDE04, 0xC2);
  }
  function f_3BA8() {
    const ix = R.ix;
    R.ix = rw(0xD3A4);
    const hl = xb(6) === 3 ? 0x0010 : 0x000B;
    call(0x5F27, hl);
    R.ix = ix;
  }
  // $3BC6: state 19 (balancing on a ledge)
  function f_3BC6() {
    wb(0xD289, 0x60);
    f_3FEF();
    if (rb(0xD502) !== 0x19) return;
    if (rw(0xD516) !== 0) return f_45CE();
    const a = rb(JOY);
    if (a & 0x0C) return f_45CE();
    if (a & 1) return f_46B0();
    if (a & 2) return f_46BB();
  }
  // $3BF0: dying (falls off-screen)
  function f_3BF0() {
    xres(4, 7);
    xset(3, 6);
    return f_4097();
  }
  function f_3BFB() {
    xres(4, 7);
    xset(3, 6);
    let hl = 0x0080;
    if (rb(0xD51C) >= 0xD8) { bset(0xD293, 2); hl = 0x1000; }
    ww(0xD518, hl);
    return f_4097();
  }

  // ---- $3C1B / $3CFC / $3DAE: path-following inside loops (tables in bank 13) ----
  function loopPath(tblY, tblX, dir, endLen, reverse) {
    SC.page2(0x0D);
    let v = xw(22);
    if (reverse) v = neg16(v);
    let pos = rw(0xD39D) + v;
    let hi = rb(0xD39F);
    if (pos > 0xFFFF) hi = (hi + 1) & 0xFF;
    pos &= 0xFFFF;
    ww(0xD39D, pos); wb(0xD39F, hi);
    const idx = rw(0xD39E);
    const dy = rw((tblY + idx * 2) & 0xFFFF);
    xsw(20, (xw(60) + dy) & 0xFFFF);
    const dx = rw((tblX + idx * 2) & 0xFFFF);
    xsw(17, (xw(58) + dx) & 0xFFFF);
    return idx;
  }
  function f_3C1B() {
    const idx = loopPath(0x8000, 0x8398);
    if (rw(0xD39E) < 0x0090) {
      const hl = xw(22) - 0x000A;
      if (hl < 0) return f_3CC5();
      xsw(22, hl);
    } else {
      xs(37, 1);
      xsw(22, (xw(22) + 0x000C) & 0xFFFF);
    }
    f_48BC();
    if (rw(0xD39E) < 0x0180) return;
    xs(2, xbit(3, 1) ? 0x09 : 0x06);
    xsw(22, rw(0xD373));
    wb(0xD3A0, 0x10);
    void idx;
  }
  function f_3CC5() {
    if (xw(58) >= xw(17)) xsw(17, (xw(17) + 8) & 0xFFFF);
    else xsw(17, (xw(17) - 2) & 0xFFFF);
    return f_4680();
  }
  function f_3CFC() {
    loopPath(0x8DDC, 0x9140);
    if (rw(0xD39E) < 0x0090) {
      const hl = xw(22) - 0x000A;
      if (hl < 0) return f_3CC5();
      xsw(22, hl);
    } else {
      xs(37, 1);
      xsw(22, (xw(22) + 0x000C) & 0xFFFF);
    }
    f_48BC();
    if (rw(0xD39E) < 0x01A0) return;
    xs(2, 0x0A);
    xsw(24, rw(0xD373));
    xsw(22, 0);
    xset(3, 0); xset(3, 1);
    xres(34, 1);
  }
  function f_3DAE() {
    loopPath(0x86AE, 0x8A46, 0, 0, true);
    if (rw(0xD39E) < 0x0090) {
      let hl = neg16(xw(22)) - 0x000A;
      if (hl < 0) return f_3E74();
      xsw(22, neg16(hl));
    } else {
      xs(37, 0);
      xsw(22, (xw(22) + 0xFFF4) & 0xFFFF);
    }
    f_48BC();
    if (rw(0xD39E) < 0x0180) return;
    xs(2, xbit(3, 1) ? 0x09 : 0x06);
    xsw(22, neg16(rw(0xD373)));
    wb(0xD3A0, 0x10);
  }
  function f_3E74() {
    if (xw(58) >= xw(17)) xsw(17, (xw(17) + 8) & 0xFFFF);
    else xsw(17, (xw(17) - 2) & 0xFFFF);
    return f_4680();
  }
  // $3EAB/$3EE1/$3EF7: enter a loop path. They "pop af; ret" -> abort caller chain.
  function loopEnter(state, addX) {
    xs(2, state);
    if (addX) xsw(17, (xw(17) + 0x20) & 0xFFFF);
    const x = xb(17) & 0xE0;
    xs(17, x);
    xs(58, x); xs(59, xb(18));
    const y = ((xb(20) & 0xE0) + 4) & 0xFF;
    xs(20, y);
    xs(60, y); xs(61, xb(21));
    wb(0xD39D, 0); wb(0xD39E, 0); wb(0xD39F, 0);
    return SC.ABORT;
  }
  const f_3EAB = () => loopEnter(0x0C, false);
  const f_3EE1 = () => loopEnter(0x0D, true);
  const f_3EF7 = () => loopEnter(0x13, false);

  // $3EFD: state 18 (swimming up after bubble / hanging)
  function f_3EFD() {
    wb(0xD289, 0x60);
    call(0x4B46);
    if (rb(0xD443) !== 0) return f_463C();
    let a = rb(JOY);
    let hl = (a & 8) ? 1 : (a & 4) ? 0xFFFF : 0;
    const oldx = rw(0xD511);
    ww(0xD511, (hl + oldx) & 0xFFFF);
    f_3F86(oldx);
    a = rb(JOY);
    hl = (a & 2) ? 1 : (a & 1) ? 0xFFFF : 0;
    ww(0xD518, hl);
    const oldy = rw(0xD514);
    ww(0xD514, (hl + oldy) & 0xFFFF);
    f_3FA7(oldy);
    ww(0xD49A, 0xFFF4); ww(0xD49E, 0xFFF4);
    call(0x690B);
    f_48BC();
    f_48A7();
    if (rb(0xD441) & 0x80) return f_463C();
    ww(0xD3A1, rw(0xD3A1) - 1);
    if (rw(0xD3A1) === 0) return f_463C();
    if (xbit(35, 1)) return f_463C();
    if (xbit(4, 6)) return f_463C();
  }
  function f_3F86(de) {
    const sx = rw(0xD51A);
    if (sx < 0x14) { ww(0xD511, (de + 1) & 0xFFFF); return; }
    if (sx < SC.SCREEN_RIGHT_LIMIT) return;
    ww(0xD511, (de - 1) & 0xFFFF);
  }
  function f_3FA7(de) {
    const sy = rw(0xD51C);
    if (sy < 0x18) { ww(0xD514, (de + 1) & 0xFFFF); return; }
    if (sy < SC.SCREEN_BOTTOM_LIMIT) return;
    ww(0xD514, (de - 1) & 0xFFFF);
  }

  // $3FC8: screen-relative position (also recomputed by the sprite code)
  function f_3FC8() {
    xsw(26, (xw(17) - rw(0xD174)) & 0xFFFF);
    xsw(28, (xw(20) - rw(0xD176)) & 0xFFFF);
  }

  // ================================================================ physics core
  // $3FEF: common movement/physics for Sonic
  function f_3FEF() {
    call(0x4B46);
    f_401A();
    f_4141();
    let hl;
    if (xb(1) < 5) {
      hl = 0;
      // $3FFF: ld hl,$0000 ; falls into $4002: ld ($D377),hl
      ww(0xD377, hl);
    }
    return f_4005();
  }
  function f_4005() {
    f_402A();
    f_4097();
    call(0x690B);
    f_48BC();
    // $4011
    if (rb(JOYP) & 0x30) return f_45ED();
  }
  // $401A: fell below the level -> die
  function f_401A() {
    const hl = rw(0xD51C);
    if (hl & 0x8000) return;
    if (hl < SC.SCREEN_DEATH_Y) return;
    return f_4984();
  }
  // $402A: horizontal movement
  function f_402A() {
    let hl = (rw(0xD516) + rw(0xD375) + rw(0xD377)) & 0xFFFF;
    if (!(hl & 0x8000)) {
      if (xbit(35, 2)) return f_408D();
      xs(10, 0x40);
      if ((hl >> 8) >= rb(0xD374)) hl = rw(0xD373);
    } else {
      if (xbit(35, 3)) return f_408D();
      xs(10, 0xC0);
      const b = (-rb(0xD374)) & 0xFF;
      if ((hl >> 8) < b) hl = neg16(rw(0xD373));
    }
    ww(0xD516, hl);
    f_addX(hl);
  }
  // x += v (16.8 fixed point, sign-extended)
  function f_addX(hl) {
    const c = hl & 0x8000 ? 0xFF : 0;
    const sum = rw(0xD510) + hl;
    ww(0xD510, sum & 0xFFFF);
    wb(0xD512, (c + (sum > 0xFFFF ? 1 : 0) + xb(18)) & 0xFF);
  }
  function f_408D() {
    ww(0xD516, 0);
    ww(0xD375, 0);
  }
  // $4097: vertical movement / gravity
  function f_4097() {
    let hl = rw(0xD518);
    if (xb(1) !== 0x11) {
      if (!xbit(3, 0)) {
        if (rb(0xD3C0) !== 0) return;
        hl = rw(0xD518);
        if (hl & 0x8000) hl = neg16(hl);
      } else {
        hl = rw(0xD518);
        const a = xb(1);
        let de;
        if (rb(0xD443) === 0) {
          de = a === 0x0B ? 0x0018 : a === 0x1B ? 0x0024 : 0x0030;
          hl = (hl + de) & 0xFFFF;
          if (!(hl & 0x8000) && (hl >> 8) >= 7) hl = 0x0700;
        } else {
          de = a === 0x0B ? 0x000C : a === 0x1B ? 0x0012 : 0x0018;
          hl = (hl + de) & 0xFFFF;
          if (!(hl & 0x8000) && (hl >> 8) >= 4) hl = 0x0400;
        }
      }
    }
    // $410B
    if (xbit(34, 1)) {
      hl = 0x0700;
      const ang = rb(0xD369);
      if (ang === 0x0A || ang === 0x0C) hl = 0x0900;
    }
    ww(0xD518, hl);
    const c = hl & 0x8000 ? 0xFF : 0;
    const sum = rw(0xD513) + hl;
    ww(0xD513, sum & 0xFFFF);
    wb(0xD515, (c + (sum > 0xFFFF ? 1 : 0) + xb(21)) & 0xFF);
  }
  // $4141: joypad -> horizontal acceleration
  // Keep the player within the visible screen horizontally.  The original works on
  // the low byte of (x - camera x) for a 256 pixel wide screen.
  function screenClamp() {
    const d = (rw(0xD511) - rw(0xD174)) & 0xFFFF;
    if (SC.VIEW_W === 256) {
      const l = d & 0xFF;
      if (l < 0x10) { f_4244(0x0010); return true; }
      if (l >= 0xF8) { f_4251(0x00F7); return true; }
      return false;
    }
    const sd = SC.s16(d);
    if (sd < 0x10) { f_4244(0x0010); return true; }
    if (sd >= SC.VIEW_W - 8) { f_4251(SC.VIEW_W - 9); return true; }
    return false;
  }
  function f_4141() {
    if (xb(1) < 0x29) {
      if (screenClamp()) return;
      if (xb(1) >= 0x1E) return;
    }
    let tblR, tblL;
    if (rb(0xD443) === 0) { tblR = 0x429D; tblL = 0x431D; } else { tblR = 0x441D; tblL = 0x449D; }
    const off = xb(1) * 4;
    const joy = rb(JOY) & 0x0C;
    if (joy === 0) return f_4223(off);
    const de = xbit(23, 7) ? tblL : tblR;
    const bc = (joy & 4) ? 0 : 2;
    return accelFrom(de + off + bc);
  }
  function accelFrom(p) {
    let de = rw(p);
    const hl = (abs16(rw(0xD516)) + 0x0080) & 0xFFFF;
    if ((hl >> 8) === 0) de = (de * 2) & 0xFFFF;
    ww(0xD375, de);
    const ang = rb(0xD369);
    ww(0xD377, rw(0x459D + ang));
  }
  function f_4223(off) {
    ww(0xD375, 0);
    if (xw(22) === 0) return;
    const bc = xbit(23, 7) ? 0 : 2;
    return accelFrom(0x439D + off + bc);
  }
  function f_4244(bc) {
    ww(0xD511, (rw(0xD174) + bc) & 0xFFFF);
    wb(0xD510, 0);
    return f_425C();
  }
  function f_4251(bc) {
    ww(0xD511, (rw(0xD174) + bc) & 0xFFFF);
    wb(0xD510, 0);
    return f_425C();
  }
  function f_425C() {
    const de = rw(0xD516);
    const c = de & 0x8000 ? 0xFF : 0;
    const hl = rw(0xD510) - de;
    ww(0xD510, hl & 0xFFFF);
    const borrow = hl < 0 ? 1 : 0;
    xs(18, (xb(18) - c - borrow) & 0xFF);
    ww(0xD375, 0);
    ww(0xD516, 0);
  }
  // $4281: clamp to screen edges only
  function f_4281() { screenClamp(); }

  // ---- state transitions ----
  function f_45B3() { xres(3, 0); xres(3, 1); xs(2, 0x01); ww(0xD516, 0); ww(0xD373, 0x0400); return f_4A33(); }
  function f_45CE() {
    xres(3, 0); xres(3, 1); xres(3, 6);
    xs(2, 0x05);
    ww(0xD373, 0x0400);
    f_48A7();
    wb(0xD289, 0x60);
  }
  // $45ED: jump
  function f_45ED() {
    if (xbit(3, 0)) return;
    if (rb(0xD501) === 0x11) return;
    if ((rb(0xD36B) & 0xFC) === 0x90) return;
    wb(0xD3B2, 0); wb(0xD3BC, 0);
    xset(3, 0); xset(3, 1);
    xres(36, 0);
    xs(2, 0x0A);
    K.mode = null;
    ww(0xD518, jumpVel());
    ww(0xD514, rw(0xD514) - 1);
    wb(0xD289, 0x60);
    xres(34, 1);
    wb(0xDE04, 0xA2);
  }
  // $463C: start falling
  function f_463C() {
    if (xb(1) === 0x0A) return;
    xs(2, 0x0E);
    xs(24, 0x00);
    return f_464A();
  }
  function f_464A() {
    xs(25, 0x01);
    xset(3, 0); xres(3, 1); xres(36, 0);
    wb(0xD3BC, 0);
    xres(34, 1);
  }
  function f_4663() {
    xs(2, 0x14); xs(24, 0); xs(25, 1);
    xset(3, 0); xres(3, 1); xres(34, 1);
    wb(0xD3BC, 0);
  }
  function f_4680() {
    xs(2, 0x1D); xs(24, 0x80); xs(25, 0x00);
    xset(3, 0); xres(3, 1); xres(34, 1);
  }
  function f_4699() {
    xset(3, 0); xset(3, 1);
    xs(2, 0x0A);
    ww(0xD518, 0);
    xres(34, 1);
  }
  function f_46B0() { ww(0xD516, 0); xs(2, 0x03); }
  function f_46BB() { ww(0xD516, 0); xres(3, 1); xres(3, 6); xs(2, 0x04); }
  function f_46CE() { ww(0xD516, 0); xres(3, 6); xs(2, 0x15); wb(0xDE04, 0xAC); }
  function f_46E2() {
    ww(0xD373, 0x0700);
    xsw(22, xbit(4, 4) ? 0xF900 : 0x0700);
    xs(2, 0x1A);
    wb(0xDE04, 0xBE);
  }
  function f_4701() { ww(0xD516, 0); xset(3, 1); xres(3, 6); xs(2, 0x0F); wb(0xDE04, 0xAC); }
  function f_4719() {
    ww(0xD373, 0x0700);
    xsw(22, xbit(4, 4) ? 0xF900 : 0x0700);
    xset(3, 1);
    xs(2, 0x10);
    wb(0xDE04, 0xBE);
  }
  function f_473C() {
    ww(0xD516, 0);
    ww(0xD518, 0xFF00);
    ww(0xD514, rw(0xD514) - 4);
    ww(0xD3A1, 0x012C);
    xres(3, 1); xres(3, 6); xres(34, 1); xres(33, 1); xres(35, 1);
    wb(0xD3C0, 0);
    xs(2, 0x18);
  }
  // $4775: rocket shoes start
  function f_4775() {
    ww(0xD516, 0); ww(0xD518, 0);
    ww(0xD373, 0x0700);
    let hl = 0x1770;
    if (rb(0xD297) !== 0x08) {
      wb(0xDE04, 0x85);
      SC.waitFrame();
      hl = 0x012C;
    }
    ww(0xD3A1, hl);
    xres(3, 1); xres(3, 6);
    xs(2, 0x11);
  }
  function f_47A9() { xres(3, 0); xres(3, 1); xs(2, 0x06); }
  function f_47B6() { if (xbit(3, 0)) return; wb(0xDE04, 0xA1); xres(3, 1); xs(2, 0x07); }
  function f_47C9() { if (xbit(3, 0)) return; wb(0xDE04, 0xA1); xres(3, 1); xs(2, 0x08); }
  // $47DC: roll
  function f_47DC() {
    if (xb(23) === 0) return f_46BB();
    xs(2, 0x09);
    ww(0xD373, 0x0600);
    xres(3, 0); xset(3, 1);
    wb(0xDE04, 0xA5);
  }
  function f_47FB() { xs(2, 0x1B); xset(3, 0); xset(3, 1); xres(34, 1); }
  // $480C: launched upwards (spring)
  function f_480C(hl) {
    if (xbit(25, 7)) return;
    xs(2, 0x0B);
    xsw(24, hl);
    xset(3, 0); xres(3, 1); xres(34, 1);
    wb(0xDE04, 0xA6);
  }
  function f_482D(hl) {
    if (xbit(25, 7)) return;
    xs(2, 0x1C);
    xsw(24, hl);
    xset(3, 0); xset(3, 1); xres(34, 1);
  }
  function f_4849(hl) {
    xs(2, 0x09);
    xsw(22, hl);
    ww(0xD373, hl);
    xres(3, 0); xset(3, 1); xres(34, 1);
    wb(0xDE04, 0xA6);
  }
  function f_4868(hl) {
    xs(2, 0x09);
    xsw(22, hl);
    ww(0xD373, abs16(hl));
    xres(3, 0); xset(3, 1); xres(34, 1);
    wb(0xDE04, 0xA6);
  }
  function f_4892() {
    wb(0xD502, 0x20);
    wb(0xDE04, rb(0xD298) === 2 ? 0x97 : 0x89);
  }
  // $48A7: face the direction being pressed
  function f_48A7() {
    let a = rb(JOY);
    a = ((a << 2) | (a >> 6)) & 0xFF;
    if (!(a & 0x30)) return;
    const b = a & 0x10;
    xs(4, (xb(4) & 0xEF) | b);
  }
  // $48BC: damage / invulnerability handling
  function f_48BC() {
    if (xbit(3, 7)) return f_49F7();
    if (xbit(3, 6)) { xs(32, 0); return; }
    if (rb(0xD532) === 0x06) { wb(0xD3B0, 0); wb(0xD520, 0); return; }
    if (rb(0xD3B0) !== 0) {
      wb(0xD3B0, 0);
      xres(35, 0);
      return f_48F7();
    }
    if (rb(0xD520) === 0) return;
    if (xbit(3, 1)) return f_49C3();
    return f_48F7();
  }
  // $48F7: get hurt
  function f_48F7() {
    if (rb(0xD501) === 0x11) {
      wb(0xD532, 0);
      bres(0xD3A3, 3);
      call(0x189B);
      SC.waitFrame();
      wb(0xDE04, 0xC3);
      return f_4942();
    }
    const rings = rb(0xD29A);
    if (rings === 0) return f_4984();
    let n = ((rings >> 4) & 0x0F) + 1;
    if (n >= 8) n = 7;
    for (let h = 0; h < n; h++) call(0x5E9C, 0x06, h);   // scatter rings
    wb(0xD29A, 0);
    call(0x314A);
    wb(0xDE04, 0xA4);
    return f_4942();
  }
  function f_4942() {
    xset(3, 7); xset(3, 6);
    wb(0xD3B1, 0x78);
    xs(32, 0);
    xs(2, 0x1E);
    xset(3, 0);
    xres(34, 1);
    ww(0xD518, xbit(34, 0) ? 0x0100 : 0xFC00);
    ww(0xD516, xbit(35, 3) ? 0x0100 : 0xFF00);
    ww(0xD375, 0);
  }
  // $4984: die
  function f_4984() {
    xs(2, 0x1F);
    xset(3, 0);
    xs(4, 0x00);
    ww(0xD518, 0xFB00);
    ww(0xD375, 0);
    xres(34, 1);
    if (rb(0xD297) >= 0x08) { bset(0xD294, 5); return; }
    bset(0xD293, 2);
    wb(0xD44B, rb(0xD44B) & 0x80);
    wb(0xDE04, 0x96);
    SC.waitFrame();
  }
  function f_49C3() {
    if (xbit(33, 4)) {
      if (rb(0xD501) !== 0x09) { xset(3, 0); ww(0xD518, 0x0080); }
    } else if (xbit(33, 5)) {
      xset(3, 0); xres(34, 1); ww(0xD518, 0xFD00);
    }
    wb(0xD520, 0);
  }
  // $49F7: invulnerability blinking after being hurt
  function f_49F7() {
    let t = rb(0xD3B1);
    if (t === 0) {
      xres(4, 7); xres(3, 7); xres(3, 6);
      wb(0xD3B0, 0); xs(32, 0);
      xres(4, 7);
      return;
    }
    t = (t - 1) & 0xFF;
    wb(0xD3B1, t);
    if (xb(1) === 0x1E) { xres(4, 7); return; }
    if (t & 2) xset(4, 7); else xres(4, 7);
  }
  function f_4A2E() { xs(32, 0); }
  // $4A33: stopped -> check for ledge balance
  function f_4A33() {
    SC.sensor(0xFFFC, 0x0012);
    const b = rb(0xD368);
    SC.sensor(0x0004, 0x0012);
    const c = rb(0xD368);
    let d = (c - b) & 0xFF;
    if (c < b) d = (-d) & 0xFF;
    if (d < 0x10) return;
    if (c === b) { xs(2, 0x01); return; }
    xs(2, 0x19);
    if (c < b) xres(4, 4); else xset(4, 4);
  }
  // $4A74: power-up timers and pending events
  function f_4A74() {
    const pu = rb(0xD532);
    if (pu !== 0) {
      if (pu === 0x03) ww(0xD373, 0x0600);
      const t = (rw(0xD44C) - 1) & 0xFFFF;
      ww(0xD44C, t);
      if (t === 0 && (pu === 0x04 || pu === 0x06)) {
        call(0x189B);
        wb(0xD532, 0);
      }
    }
    const a = rb(0xD3A3);
    if (a & 0x01) { bres(0xD3A3, 0); return f_4AC2(); }
    if (a & 0x02) { bres(0xD3A3, 1); return call(0x3104); }
    if (a & 0x04) { bres(0xD3A3, 2); wb(0xD532, 0x03); ww(0xD44C, 0x0384); return; }
    if (a & 0x08) {
      bres(0xD3A3, 3);
      if (rb(0xD500) !== 1) return;
      wb(0xD532, 0x04);
      ww(0xD44C, rb(0xD297) === 8 ? 0x1770 : 0x012C);
      R.ix = 0xD500;
      return f_4775();
    }
    if (a & 0x10) { bres(0xD3A3, 4); wb(0xD3C4, 0x0B); wb(0xDE04, 0xF8); return; }
    if (a & 0x20) {
      bres(0xD3A3, 5);
      bset(0xD503, 1); bset(0xD503, 7);
      wb(0xDE04, 0x84);
      SC.waitFrame();
      ww(0xD44C, 0x0258);
      if (rb(0xD532) === 0x06) return;
      wb(0xD532, 0x06);
      return call(0x5E9C, 0x05, 0);
    }
  }
  // $4AC2: +10 rings
  function f_4AC2() {
    wb(0xD29A, SC.bcdAdd(rb(0xD29A), 0x10));
    call(0x314A);
    if (rb(0xD29A) >= 0x10) return;
    call(0x3104);
    return call(0x178F);
  }
  // $4B46: level-specific (Aqua Planet water) - nothing for Turquoise Hill
  function f_4B46() {
    if (rb(0xD297) !== 4) return;
    throw new Error('water levels not supported');
  }

  // $4C02/$4C12: carried by an object (handled with objects)
  function f_4C56() {
    const iy = R.iy;
    ww(0xD511, SC.yw(17)); ww(0xD514, SC.yw(20));
    ww(0xD516, SC.yw(22)); ww(0xD518, SC.yw(24));
    bset(0xD503, 1);
    if (SC.yb(63) !== 2) xset(4, 4); else xres(4, 4);
    void iy;
  }
  function f_4C02() {
    xres(4, 7);
    R.iy = rw(0xD3A6);
    f_4C56();
    SC.yset(4, 7);
  }
  function f_4C12() {
    R.iy = rw(0xD3A6);
    f_4C56();
    call(0x753E);
    f_48BC();
    f_401A();
    const st = xb(2);
    if (st !== 0x1E && st !== 0x1F) {
      xres(3, 0);
      if (!(rb(JOY) & 0x30)) return;
    }
    R.iy = rw(0xD3A6);
    SC.yres(4, 7);
    SC.ys(31, 0x10);
    SC.yset(3, 6);
    SC.ys(2, SC.yb(63));
    ww(0xD3A6, 0);
    return f_45ED();
  }

  // $64CB: merge terrain and object collision flags into (ix+35)
  function f_64CB() {
    let b = xb(34);
    if (rb(0xD3C0) !== 0 || (!xbit(3, 1) && !(rb(0xD503) & 0x80))) {
      b |= (xb(33) >> 4) & 0x0F;
    }
    xs(35, b);
  }

  // Register routines
  const table = {
    0x361D: f_361D, 0x3657: f_3657, 0x36C6: f_36C6, 0x36F0: f_36F0, 0x3713: f_3713, 0x3759: f_3759,
    0x3783: f_3783, 0x37CC: f_37CC, 0x37F4: f_37F4, 0x3831: f_3831, 0x384D: f_384D, 0x386F: f_386F,
    0x389A: f_389A, 0x38C5: f_38C5, 0x38D1: f_38D1, 0x3901: f_3901, 0x393B: f_393B, 0x3955: f_3955,
    0x396D: f_396D, 0x39B6: f_39B6, 0x39E6: f_39E6, 0x3A23: f_3A23, 0x3A37: f_3A37, 0x3A48: f_3A48,
    0x3A59: f_3A59, 0x3A71: f_3A71, 0x3A7C: f_3A7C, 0x3B4E: f_3B4E, 0x3BC6: f_3BC6, 0x3BF0: f_3BF0,
    0x3BFB: f_3BFB, 0x3C1B: f_3C1B, 0x3CFC: f_3CFC, 0x3DAE: f_3DAE, 0x3EAB: f_3EAB, 0x3EE1: f_3EE1,
    0x3EF7: f_3EF7, 0x3EFD: f_3EFD, 0x3FC8: f_3FC8, 0x3FEF: f_3FEF, 0x401A: f_401A, 0x402A: f_402A,
    0x4097: f_4097, 0x4141: f_4141, 0x4281: f_4281, 0x45B3: f_45B3, 0x45CE: f_45CE, 0x45ED: f_45ED,
    0x463C: f_463C, 0x464A: f_464A, 0x4663: f_4663, 0x4680: f_4680, 0x4699: f_4699, 0x46B0: f_46B0,
    0x46BB: f_46BB, 0x46CE: f_46CE, 0x46E2: f_46E2, 0x4701: f_4701, 0x4719: f_4719, 0x473C: f_473C,
    0x4775: f_4775, 0x47A9: f_47A9, 0x47B6: f_47B6, 0x47C9: f_47C9, 0x47DC: f_47DC, 0x47FB: f_47FB,
    0x480C: f_480C, 0x482D: f_482D, 0x4849: f_4849, 0x4868: f_4868, 0x4892: f_4892, 0x48A7: f_48A7,
    0x48BC: f_48BC, 0x48F7: f_48F7, 0x4942: f_4942, 0x4984: f_4984, 0x49F7: f_49F7, 0x4A2E: f_4A2E,
    0x4A33: f_4A33, 0x4A74: f_4A74, 0x4AC2: f_4AC2, 0x4B46: f_4B46, 0x4C02: f_4C02, 0x4C12: f_4C12,
    0x64CB: f_64CB, 0x044F: () => {},
  };
  for (const a in table) def(+a, table[a]);
})(typeof window !== 'undefined' ? window : globalThis);
