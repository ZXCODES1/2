(function () {
'use strict';

// ===================== constants.js =====================
// Virtual canvas resolution
const W = 960;
const H = 540;
const T = 48; // tile size px

// Physics
const GRAVITY          = 2000;   // px/s²
const MAX_FALL         = 900;    // px/s
const JUMP_VEL         = -720;   // initial jump velocity
const JUMP_HOLD_REDUCE = 0.35;   // gravity multiplier while holding jump
const JUMP_HOLD_MAX    = 0.22;   // max seconds to hold jump
const PLAYER_SPEED     = 300;    // px/s run speed
const PLAYER_ACCEL     = 3000;
const PLAYER_DECEL     = 3500;
const COYOTE_T         = 0.1;    // seconds grace after leaving edge
const JUMP_BUF_T       = 0.12;   // jump-buffer window

// Player dimensions
const PW = 36;
const PH = 44;
const PLAYER_LIVES       = 3;
const INVINCIBLE_T       = 2.0;
const SHOOT_CD           = 0.28;
const SHOOT_CD_RAPID     = 0.1;
const PROJ_SPEED         = 580;
const STOMP_BOUNCE       = -550;

// Enemy constants
const CRAWLER_SPEED   = 80;
const BOUNCER_SPEED   = 110;
const SHOOTER_SPEED   = 40;
const ENEMY_PROJ_SPD  = 230;

// Score
const SC_CRYSTAL = 10;
const SC_STOMP   = 100;
const SC_SHOOT   = 150;
const SC_BOSS_HIT = 50;

// Tile types
const TILE_EMPTY  = 0;
const TILE_SOLID  = 1;
const TILE_ONEWAY = 2;
const TILE_SPIKE  = 3;


// ===================== utils.js =====================
const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp   = (a, b, t)  => a + (b - a) * t;
const rnd    = (lo, hi)   => Math.random() * (hi - lo) + lo;
const rndInt = (lo, hi)   => Math.floor(rnd(lo, hi + 1));
const sign   = (v)        => (v > 0 ? 1 : v < 0 ? -1 : 0);

function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// HSL helper
function hsl(h, s, l, a = 1) {
  return `hsla(${h},${s}%,${l}%,${a})`;
}


// ===================== Input.js =====================
class Input {
  constructor() {
    this._keys     = {};
    this._pressed  = {};
    this._released = {};

    // Touch virtual buttons
    this.touch = { left: false, right: false, jump: false, shoot: false };
    this._jumpTap  = false;
    this._shootTap = false;

    window.addEventListener('keydown', e => {
      if (!this._keys[e.code]) this._pressed[e.code] = true;
      this._keys[e.code] = true;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))
        e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      this._keys[e.code]    = false;
      this._released[e.code] = true;
    });

    this._initTouch();
  }

  _initTouch() {
    const bind = (id, prop) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', e => { e.preventDefault(); this.touch[prop] = true; if(prop==='jump') this._jumpTap=true; if(prop==='shoot') this._shootTap=true; }, { passive: false });
      el.addEventListener('touchend',   e => { e.preventDefault(); this.touch[prop] = false; }, { passive: false });
      el.addEventListener('touchcancel',e => { e.preventDefault(); this.touch[prop] = false; }, { passive: false });
    };
    bind('btn-left',  'left');
    bind('btn-right', 'right');
    bind('btn-jump',  'jump');
    bind('btn-shoot', 'shoot');
  }

  clearFrame() {
    this._pressed  = {};
    this._released = {};
    this._jumpTap  = false;
    this._shootTap = false;
  }

  isDown(code)    { return !!this._keys[code]; }
  wasPressed(code){ return !!this._pressed[code]; }
  wasReleased(code){ return !!this._released[code]; }

  left()  { return this.isDown('ArrowLeft') || this.isDown('KeyA') || this.touch.left; }
  right() { return this.isDown('ArrowRight')|| this.isDown('KeyD') || this.touch.right; }

  jump()       { return this.isDown('Space') || this.isDown('ArrowUp') || this.isDown('KeyW') || this.isDown('KeyX') || this.touch.jump; }
  jumpPressed(){ return this.wasPressed('Space') || this.wasPressed('ArrowUp') || this.wasPressed('KeyW') || this.wasPressed('KeyX') || this._jumpTap; }
  jumpReleased(){ return this.wasReleased('Space') || this.wasReleased('ArrowUp') || this.wasReleased('KeyW') || this.wasReleased('KeyX'); }

  shoot()       { return this.isDown('KeyZ') || this.isDown('KeyJ') || this.isDown('ControlLeft') || this.touch.shoot; }
  shootPressed(){ return this.wasPressed('KeyZ') || this.wasPressed('KeyJ') || this.wasPressed('ControlLeft') || this._shootTap; }

  pause() { return this.wasPressed('Escape') || this.wasPressed('KeyP'); }
  confirm(){ return this.wasPressed('Enter') || this.wasPressed('Space') || this.wasPressed('KeyZ') || this._jumpTap || this._shootTap; }
}


// ===================== Audio.js =====================
class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this._musicNodes = [];
    this._musicPlaying = false;
    this._musicTheme = -1;
    this._bpm = 140;
    this._beat = 0;
    this._nextBeatTime = 0;
    this.muted = false;
  }

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this._gain(0.7);
      this.master.connect(this.ctx.destination);
      this.sfxBus   = this._gain(1.0); this.sfxBus.connect(this.master);
      this.musicBus  = this._gain(0.35); this.musicBus.connect(this.master);
    } catch(e) { console.warn('Audio init failed', e); }
  }

  _gain(v) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  _osc(type, freq, dest, vol, duration, attack=0.01, pitchEnd=null) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this._gain(0);
    o.connect(g); g.connect(dest);
    o.type = type;
    o.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (pitchEnd) o.frequency.exponentialRampToValueAtTime(pitchEnd, this.ctx.currentTime + duration);
    g.gain.setValueAtTime(0, this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    o.start();
    o.stop(this.ctx.currentTime + duration + 0.01);
  }

  _noise(dest, vol, duration) {
    if (!this.ctx) return;
    const buf  = this.ctx.createBuffer(1, this.ctx.sampleRate * duration, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this._gain(vol);
    src.connect(g); g.connect(dest);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    src.start(); src.stop(this.ctx.currentTime + duration);
  }

  // ── Sound effects ──────────────────────────────────────────────
  jump() {
    this._osc('square', 220, this.sfxBus, 0.22, 0.18, 0.005, 520);
    this._osc('sine',   330, this.sfxBus, 0.12, 0.12, 0.005, 660);
  }

  doubleJump() {
    this._osc('square', 440, this.sfxBus, 0.22, 0.18, 0.005, 880);
    this._osc('sine',   660, this.sfxBus, 0.15, 0.15, 0.005, 1100);
  }

  land() {
    this._noise(this.sfxBus, 0.08, 0.06);
    this._osc('sine', 80, this.sfxBus, 0.15, 0.08, 0.001, 40);
  }

  shoot() {
    this._osc('sawtooth', 600, this.sfxBus, 0.18, 0.15, 0.003, 200);
    this._osc('square',   400, this.sfxBus, 0.10, 0.12, 0.003, 150);
  }

  enemyHit() {
    this._osc('square', 300, this.sfxBus, 0.20, 0.10, 0.003, 180);
    this._noise(this.sfxBus, 0.06, 0.05);
  }

  enemyDie() {
    this._osc('square',  200, this.sfxBus, 0.25, 0.3, 0.003, 50);
    this._osc('sawtooth',400, this.sfxBus, 0.15, 0.2, 0.003, 80);
    this._noise(this.sfxBus, 0.12, 0.15);
  }

  stomp() {
    this._osc('sine',   100, this.sfxBus, 0.3, 0.12, 0.002, 50);
    this._noise(this.sfxBus, 0.15, 0.08);
  }

  playerHurt() {
    this._osc('square', 160, this.sfxBus, 0.35, 0.4, 0.003, 80);
    this._noise(this.sfxBus, 0.2, 0.2);
  }

  collectCrystal() {
    this._osc('sine', 880,  this.sfxBus, 0.15, 0.12, 0.005, 1320);
    this._osc('sine', 1100, this.sfxBus, 0.10, 0.10, 0.005, 1760);
  }

  collectPowerup() {
    [440,550,660,880].forEach((f,i) => {
      setTimeout(() => this._osc('sine', f, this.sfxBus, 0.20, 0.18, 0.005), i * 60);
    });
  }

  bossHit() {
    this._osc('sawtooth', 120, this.sfxBus, 0.35, 0.25, 0.002, 60);
    this._noise(this.sfxBus, 0.20, 0.15);
  }

  explosion() {
    this._noise(this.sfxBus, 0.45, 0.5);
    this._osc('sawtooth', 80, this.sfxBus, 0.35, 0.4, 0.002, 30);
  }

  levelComplete() {
    [523,659,784,1047].forEach((f,i) => setTimeout(() => this._osc('sine', f, this.sfxBus, 0.25, 0.3, 0.005), i * 100));
  }

  gameOver() {
    [440,330,220,165].forEach((f,i) => setTimeout(() => this._osc('square', f, this.sfxBus, 0.25, 0.35, 0.005), i * 150));
  }

  // ── Procedural music ───────────────────────────────────────────
  startMusic(theme = 0) {
    if (!this.ctx || this._musicPlaying && this._musicTheme === theme) return;
    this.stopMusic();
    this._musicPlaying = true;
    this._musicTheme   = theme;
    this._beat = 0;
    this._nextBeatTime = this.ctx.currentTime + 0.05;
    this._scheduleMusic();
  }

  stopMusic() {
    this._musicPlaying = false;
    this._musicNodes.forEach(n => { try { n.stop(); } catch(e){} });
    this._musicNodes = [];
  }

  _scheduleMusic() {
    if (!this._musicPlaying) return;
    const SEC_PER_BEAT = 60 / this._bpm;
    const now = this.ctx.currentTime;
    while (this._nextBeatTime < now + 0.3) {
      this._playBeat(this._beat, this._nextBeatTime);
      this._beat++;
      this._nextBeatTime += SEC_PER_BEAT;
    }
    setTimeout(() => this._scheduleMusic(), 100);
  }

  // Theme 0 = level1, theme 1 = level2, theme 2 = boss
  _playBeat(beat, t) {
    const theme = this._musicTheme;
    const b = beat % 16;
    const b8 = beat % 8;

    // Bass patterns
    const bassNote = theme === 2
      ? [55,55,55,82,55,55,65,55,55,55,55,82,55,55,73,55][b]
      : theme === 1
      ? [65,65,65,82,65,65,73,65,65,65,65,82,65,65,98,65][b]
      : [110,110,110,147,110,110,131,110,110,110,110,147,110,110,165,110][b];

    if (bassNote) {
      const dur = 60 / this._bpm * 0.9;
      this._schedOsc('triangle', bassNote, this.musicBus, 0.3, t, dur);
    }

    // Melody patterns (every 2 beats)
    if (b % 2 === 0) {
      const melodies = theme === 2
        ? [220,196,220,246,196,220,196,174]
        : theme === 1
        ? [330,294,330,370,294,330,370,294]
        : [440,494,523,440,494,440,392,440];
      const mf = melodies[b8 >> 1];
      if (mf) this._schedOsc('square', mf, this.musicBus, 0.12, t, 60 / this._bpm * 1.8);
    }

    // Hi-hat every beat
    if (b % 2 === 0) this._schedNoise(this.musicBus, 0.04, t, 0.04);

    // Kick on 0 and 8
    if (b === 0 || b === 8) {
      this._schedOsc('sine', 80, this.musicBus, 0.45, t, 0.12);
    }
    // Snare on 4 and 12
    if (b === 4 || b === 12) {
      this._schedNoise(this.musicBus, 0.18, t, 0.08);
    }
  }

  _schedOsc(type, freq, dest, vol, when, dur) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this._gain(0);
    o.connect(g); g.connect(dest);
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.start(when); o.stop(when + dur + 0.01);
    this._musicNodes.push(o);
  }

  _schedNoise(dest, vol, when, dur) {
    if (!this.ctx) return;
    const buf  = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this._gain(vol);
    src.connect(g); g.connect(dest);
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.start(when); src.stop(when + dur);
    this._musicNodes.push(src);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
}


// ===================== Camera.js =====================



class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this._tx = 0;
    this._ty = 0;
    this._shakeAmt = 0;
    this._shakeDecay = 8;
    this._ox = 0; // shake offset
    this._oy = 0;
  }

  follow(player, worldW, worldH) {
    // Target: player center minus half viewport, with leading
    const lead = player.vx * 0.08;
    this._tx = clamp(player.x + player.w / 2 - W / 2 + lead, 0, Math.max(0, worldW - W));
    this._ty = clamp(player.y + player.h / 2 - H / 2,        0, Math.max(0, worldH - H));
  }

  update(dt) {
    // Smooth follow
    this.x = lerp(this.x, this._tx, 1 - Math.exp(-10 * dt));
    this.y = lerp(this.y, this._ty, 1 - Math.exp(-8  * dt));

    // Screen shake decay
    if (this._shakeAmt > 0) {
      this._shakeAmt = Math.max(0, this._shakeAmt - this._shakeDecay * dt);
      this._ox = (Math.random() * 2 - 1) * this._shakeAmt;
      this._oy = (Math.random() * 2 - 1) * this._shakeAmt * 0.6;
    } else {
      this._ox = 0; this._oy = 0;
    }
  }

  shake(amt) { this._shakeAmt = Math.min(this._shakeAmt + amt, 24); }

  // Transform context to world space
  apply(ctx) {
    ctx.translate(-(this.x + this._ox), -(this.y + this._oy));
  }

  // Screen → world
  toWorld(sx, sy) {
    return { x: sx + this.x + this._ox, y: sy + this.y + this._oy };
  }

  // World → screen (for culling)
  onScreen(wx, wy, ww, wh) {
    const sx = wx - this.x - this._ox;
    const sy = wy - this.y - this._oy;
    return sx + ww > -32 && sx < W + 32 && sy + wh > -32 && sy < H + 32;
  }
}


// ===================== Particles.js =====================


class Particle {
  constructor(x, y, vx, vy, life, size, color, layer = 'front', gravity = 0) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life;
    this.size = size; this.color = color;
    this.layer = layer;
    this.gravity = gravity;
    this.dead = false;
  }

  update(dt) {
    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  render(ctx) {
    const t = this.life / this.maxLife;
    ctx.globalAlpha = t * t;
    ctx.fillStyle = this.color;
    const s = this.size * (0.4 + 0.6 * t);
    ctx.fillRect(this.x - s / 2, this.y - s / 2, s, s);
    ctx.globalAlpha = 1;
  }
}

class ParticleSystem {
  constructor() {
    this._behind = [];
    this._front  = [];
  }

  _add(p) {
    if (p.layer === 'behind') this._behind.push(p);
    else this._front.push(p);
  }

  update(dt) {
    for (const arr of [this._behind, this._front]) {
      for (const p of arr) p.update(dt);
    }
    this._behind = this._behind.filter(p => !p.dead);
    this._front  = this._front.filter(p => !p.dead);
  }

  renderBehind(ctx) { for (const p of this._behind) p.render(ctx); }
  renderFront (ctx) { for (const p of this._front)  p.render(ctx); }

  // ── Spawn helpers ──────────────────────────────────────────────
  dust(x, y, dir = 0) {
    for (let i = 0; i < 5; i++) {
      this._add(new Particle(
        x + rnd(-6, 6), y,
        rnd(-80, 80) + dir * 40, rnd(-120, -20),
        rnd(0.2, 0.4), rnd(4, 8),
        `hsl(${rndInt(180,220)},60%,75%)`,
        'behind', 200
      ));
    }
  }

  jumpDust(x, y) {
    for (let i = 0; i < 8; i++) {
      const ang = Math.PI + rnd(-0.6, 0.6);
      const spd = rnd(60, 180);
      this._add(new Particle(
        x, y,
        Math.cos(ang) * spd, Math.sin(ang) * spd,
        rnd(0.25, 0.45), rnd(5, 10),
        `hsl(${rndInt(180, 210)},70%,80%)`,
        'behind', 150
      ));
    }
  }

  landDust(x, y) {
    for (let i = 0; i < 10; i++) {
      const side = Math.random() > 0.5 ? 1 : -1;
      this._add(new Particle(
        x + rnd(-10, 10), y,
        rnd(40, 140) * side, rnd(-80, -20),
        rnd(0.2, 0.5), rnd(4, 9),
        `hsl(${rndInt(170, 220)},55%,70%)`,
        'behind', 180
      ));
    }
  }

  explosion(x, y, color = '#ff6600', count = 20) {
    for (let i = 0; i < count; i++) {
      const ang = rnd(0, Math.PI * 2);
      const spd = rnd(80, 320);
      this._add(new Particle(
        x, y,
        Math.cos(ang) * spd, Math.sin(ang) * spd,
        rnd(0.3, 0.7), rnd(4, 12),
        color, 'front', 200
      ));
    }
    // Sparks
    for (let i = 0; i < 10; i++) {
      const ang = rnd(0, Math.PI * 2);
      const spd = rnd(150, 500);
      this._add(new Particle(
        x, y,
        Math.cos(ang) * spd, Math.sin(ang) * spd - 100,
        rnd(0.4, 0.9), rnd(2, 5),
        '#ffffff', 'front', 300
      ));
    }
  }

  crystalSpark(x, y) {
    for (let i = 0; i < 12; i++) {
      const ang = rnd(0, Math.PI * 2);
      const spd = rnd(60, 220);
      this._add(new Particle(
        x, y,
        Math.cos(ang) * spd, Math.sin(ang) * spd - 60,
        rnd(0.3, 0.6), rnd(3, 7),
        `hsl(${rndInt(160,200)},100%,75%)`,
        'front', 120
      ));
    }
  }

  hurt(x, y) {
    for (let i = 0; i < 14; i++) {
      const ang = rnd(0, Math.PI * 2);
      const spd = rnd(60, 200);
      this._add(new Particle(
        x, y,
        Math.cos(ang) * spd, Math.sin(ang) * spd,
        rnd(0.3, 0.7), rnd(4, 9),
        `hsl(${rndInt(350, 30)},100%,65%)`,
        'front', 200
      ));
    }
  }

  projTrail(x, y, color) {
    this._add(new Particle(
      x, y,
      rnd(-20, 20), rnd(-20, 20),
      rnd(0.06, 0.12), rnd(3, 6),
      color, 'front', 0
    ));
  }

  // Slow drifting ambient mote for atmosphere
  ambientMote(x, y) {
    this._add(new Particle(
      x, y,
      rnd(-14, 14), rnd(-26, -8),
      rnd(2.0, 4.0), rnd(2, 5),
      `hsl(${rndInt(180, 210)},85%,72%)`,
      'behind', 0
    ));
  }

  bossSmoke(x, y) {
    for (let i = 0; i < 6; i++) {
      this._add(new Particle(
        x + rnd(-20, 20), y + rnd(-10, 10),
        rnd(-40, 40), rnd(-120, -40),
        rnd(0.6, 1.2), rnd(8, 18),
        `hsl(30,20%,${rndInt(40,65)}%)`,
        'front', 0
      ));
    }
  }
}


// ===================== Background.js =====================



// Each theme has 4 parallax layers, drawn programmatically
class Background {
  constructor() {
    this._stars = this._genStars(200);
    this._nebula = this._genNebula();
    this._buildings1 = this._genBuildings(12, 120, 240, 0);
    this._buildings2 = this._genBuildings(18, 60,  160, 0);
    this._boss_pillars = this._genPillars();
  }

  _genStars(n) {
    const stars = [];
    for (let i = 0; i < n; i++) {
      stars.push({
        x: rnd(0, W * 4),
        y: rnd(0, H * 0.85),
        r: rnd(0.5, 2.5),
        bright: rnd(0.4, 1.0),
        twinkle: rnd(0, Math.PI * 2)
      });
    }
    return stars;
  }

  _genNebula() {
    // Random cloud shapes stored as control-point blobs
    const blobs = [];
    for (let i = 0; i < 8; i++) {
      blobs.push({
        x: rnd(0, W * 4), y: rnd(-60, H * 0.7),
        rx: rnd(120, 320), ry: rnd(60, 160),
        hue: rndInt(200, 300),
        alpha: rnd(0.04, 0.1)
      });
    }
    return blobs;
  }

  _genBuildings(count, minH, maxH, seed) {
    const buildings = [];
    let x = -80;
    for (let i = 0; i < count; i++) {
      const w = rndInt(60, 160);
      const h = rndInt(minH, maxH);
      const windows = [];
      for (let wy = 12; wy < h - 10; wy += 18) {
        for (let wx = 6; wx < w - 6; wx += 14) {
          if (Math.random() > 0.35)
            windows.push({ x: wx, y: wy, lit: Math.random() > 0.45 });
        }
      }
      buildings.push({ x, w, h, windows, hue: rndInt(200, 250) });
      x += w + rndInt(0, 30);
    }
    return buildings;
  }

  _genPillars() {
    const p = [];
    for (let i = 0; i < 8; i++) {
      p.push({ x: i * 180 + rnd(-30, 30), w: rndInt(30, 60), h: rndInt(H * 0.3, H * 0.8) });
    }
    return p;
  }

  render(ctx, camera, worldW, theme = 0, time = 0) {
    const cx = camera.x;
    const cy = camera.y;

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    if (theme === 2) {
      // Boss arena: red/dark
      sky.addColorStop(0, '#1a0008');
      sky.addColorStop(0.6, '#2a0010');
      sky.addColorStop(1, '#0a0015');
    } else if (theme === 1) {
      sky.addColorStop(0, '#000820');
      sky.addColorStop(0.6, '#001840');
      sky.addColorStop(1, '#000010');
    } else {
      sky.addColorStop(0, '#020010');
      sky.addColorStop(0.5, '#050025');
      sky.addColorStop(1, '#000015');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Layer 0: Stars (parallax factor 0.05)
    this._drawStars(ctx, cx * 0.05, time);

    // Layer 1: Nebula clouds (factor 0.12)
    this._drawNebula(ctx, cx * 0.12, cy * 0.05, theme);

    // Layer 2: Far buildings (factor 0.25)
    this._drawBuildings(ctx, this._buildings1, cx * 0.25, time, theme, 0.6);

    // Layer 3: Near buildings (factor 0.55)
    this._drawBuildings(ctx, this._buildings2, cx * 0.55, time, theme, 0.9);

    if (theme === 2) {
      this._drawPillars(ctx, cx * 0.3);
    }
  }

  _drawStars(ctx, ox, time) {
    for (const s of this._stars) {
      const sx = ((s.x - ox) % (W * 1.5) + W * 1.5) % (W * 1.5);
      const twinkle = 0.5 + 0.5 * Math.sin(time * 2 + s.twinkle);
      ctx.globalAlpha = s.bright * (0.6 + 0.4 * twinkle);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx - s.r, s.y - s.r, s.r * 2, s.r * 2);
    }
    ctx.globalAlpha = 1;
  }

  _drawNebula(ctx, ox, oy, theme) {
    for (const b of this._nebula) {
      const bx = ((b.x - ox) % (W * 3) + W * 3) % (W * 3);
      const by = b.y - oy * 0.5;
      ctx.globalAlpha = b.alpha;
      const grad = ctx.createRadialGradient(bx, by, 0, bx, by, b.rx);
      const h = theme === 2 ? b.hue + 120 : b.hue;
      grad.addColorStop(0, `hsl(${h},60%,45%)`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(bx, by, b.rx, b.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawBuildings(ctx, buildings, ox, time, theme, alpha) {
    ctx.globalAlpha = alpha;
    const hue = theme === 2 ? 320 : theme === 1 ? 220 : 230;
    for (const b of buildings) {
      const bx = ((b.x - ox) % (W * 2.5) + W * 2.5) % (W * 2.5) - 100;
      const by = H - b.h;
      ctx.fillStyle = `hsl(${hue},30%,${theme === 2 ? 12 : 14}%)`;
      ctx.fillRect(bx, by, b.w, b.h);
      // Outline
      ctx.strokeStyle = `hsl(${hue},60%,25%)`;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, b.w, b.h);
      // Windows
      for (const w of b.windows) {
        if (w.lit) {
          const flicker = 0.7 + 0.3 * Math.sin(time * 4 + b.x + w.x);
          ctx.globalAlpha = alpha * 0.7 * flicker;
          ctx.fillStyle = theme === 2 ? '#ff4040' : '#00ffdd';
          ctx.fillRect(bx + w.x, by + w.y, 5, 5);
          ctx.globalAlpha = alpha;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawPillars(ctx, ox) {
    for (const p of this._boss_pillars) {
      const px = ((p.x - ox) % (W * 2) + W * 2) % (W * 2);
      const grad = ctx.createLinearGradient(px, H - p.h, px, H);
      grad.addColorStop(0, '#330000');
      grad.addColorStop(1, '#220020');
      ctx.fillStyle = grad;
      ctx.fillRect(px, H - p.h, p.w, p.h);
      ctx.strokeStyle = '#660020';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, H - p.h, p.w, p.h);
    }
  }
}


// ===================== Projectile.js =====================



class PlayerBolt {
  constructor(x, y, dir) {
    this.x   = x;
    this.y   = y;
    this.w   = 18;
    this.h   = 8;
    this.vx  = PROJ_SPEED * dir;
    this.vy  = 0;
    this.dir = dir;
    this.dead = false;
    this._time = 0;
    this._trail = [];
  }

  update(dt, game) {
    this._time += dt;
    this._trail.unshift({ x: this.x + this.w/2, y: this.y + this.h/2 });
    if (this._trail.length > 6) this._trail.pop();

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Bounds check
    if (this.x < -40 || this.x > game.level.worldW + 40 ||
        this.y < -40 || this.y > game.level.worldH + 40) {
      this.dead = true;
      return;
    }

    // Tile collision
    if (game.level.solidAt(this.x, this.y, this.w, this.h)) {
      game.particles.explosion(this.x + this.w/2, this.y + this.h/2, '#00ddff', 8);
      this.dead = true;
      return;
    }

    // Enemy hit
    for (const enemy of game.enemies) {
      if (enemy.dead || enemy.invincible > 0) continue;
      if (rectOverlap(this.x, this.y, this.w, this.h, enemy.x, enemy.y, enemy.w, enemy.h)) {
        enemy.takeDamage(1, game);
        game.particles.explosion(this.x + this.w/2, this.y + this.h/2, '#ff8800', 10);
        this.dead = true;
        return;
      }
    }

    // Boss hit
    if (game.boss && !game.boss.dead) {
      const b = game.boss;
      if (rectOverlap(this.x, this.y, this.w, this.h, b.x, b.y, b.w, b.h)) {
        b.takeDamage(1, game);
        game.particles.explosion(this.x + this.w/2, this.y + this.h/2, '#ff4400', 12);
        this.dead = true;
        return;
      }
    }

    // Trail particles occasionally
    if (this._time % 0.03 < dt) {
      game.particles.projTrail(this.x + this.w/2, this.y + this.h/2, '#00aaff');
    }
  }

  render(ctx) {
    // Tail glow
    for (let i = 0; i < this._trail.length; i++) {
      const t = 1 - i / this._trail.length;
      ctx.globalAlpha = t * 0.35;
      ctx.fillStyle = '#0088ff';
      const s = 6 * t;
      ctx.beginPath();
      ctx.arc(this._trail[i].x, this._trail[i].y, s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Core bolt
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;

    // Outer glow
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14);
    g.addColorStop(0, 'rgba(100,220,255,0.9)');
    g.addColorStop(0.5, 'rgba(0,120,255,0.5)');
    g.addColorStop(1, 'rgba(0,50,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bright core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

class EnemyBullet {
  constructor(x, y, vx, vy) {
    this.x   = x;
    this.y   = y;
    this.w   = 10;
    this.h   = 10;
    this.vx  = vx;
    this.vy  = vy;
    this.dead = false;
    this._time = 0;
  }

  update(dt, game) {
    this._time += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.x < -40 || this.x > game.level.worldW + 40 ||
        this.y < -40 || this.y > game.level.worldH + 40) {
      this.dead = true; return;
    }

    if (game.level.solidAt(this.x, this.y, this.w, this.h)) {
      game.particles.explosion(this.x, this.y, '#ff4400', 6);
      this.dead = true; return;
    }

    // Hit player
    const p = game.player;
    if (!p.invincible && rectOverlap(this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h)) {
      p.hurt(game);
      this.dead = true;
    }
  }

  render(ctx) {
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const pulse = 0.8 + 0.2 * Math.sin(this._time * 18);

    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 10 * pulse);
    g.addColorStop(0, 'rgba(255,200,0,1)');
    g.addColorStop(0.4, 'rgba(255,80,0,0.7)');
    g.addColorStop(1, 'rgba(200,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 10 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Boss shockwave (ground-level horizontal)
class Shockwave {
  constructor(x, y, dir, speed = 250) {
    this.x   = x;
    this.y   = y;
    this.w   = 28;
    this.h   = 28;
    this.vx  = speed * dir;
    this.vy  = 0;
    this.dead = false;
    this._time = 0;
  }

  update(dt, game) {
    this._time += dt;
    this.x += this.vx * dt;

    // Stop at walls
    if (game.level.solidAt(this.x, this.y, this.w, this.h)) {
      this.dead = true; return;
    }
    if (this._time > 3) { this.dead = true; return; }

    const p = game.player;
    if (!p.invincible && rectOverlap(this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h)) {
      p.hurt(game);
    }
  }

  render(ctx) {
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const pulse = 0.8 + 0.2 * Math.sin(this._time * 20);
    ctx.globalAlpha = 0.85;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18 * pulse);
    g.addColorStop(0, '#ff8800');
    g.addColorStop(0.5, '#ff4400');
    g.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 18 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}


// ===================== Collectible.js =====================



class Crystal {
  constructor(x, y) {
    this.x    = x * T + T * 0.3;
    this.y    = y * T + T * 0.25;
    this.w    = T * 0.4;
    this.h    = T * 0.5;
    this.dead = false;
    this._time = Math.random() * Math.PI * 2;
  }

  update(dt, game) {
    this._time += dt * 2.5;
    const p = game.player;
    if (rectOverlap(this.x - 4, this.y - 4, this.w + 8, this.h + 8, p.x, p.y, p.w, p.h)) {
      game.score += SC_CRYSTAL;
      game.audio.collectCrystal();
      game.particles.crystalSpark(this.x + this.w / 2, this.y + this.h / 2);
      game.addFloater(this.x + this.w / 2, this.y - 6, `+${SC_CRYSTAL}`, '#00ffcc');
      this.dead = true;
    }
  }

  render(ctx) {
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2 + Math.sin(this._time) * 3;
    const t = this._time;

    // Glow
    ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20);
    glow.addColorStop(0, '#00ffcc');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // Crystal shape
    ctx.fillStyle = `hsl(${170 + Math.sin(t) * 20},100%,65%)`;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx + 6, cy - 2);
    ctx.lineTo(cx + 5, cy + 8);
    ctx.lineTo(cx, cy + 12);
    ctx.lineTo(cx - 5, cy + 8);
    ctx.lineTo(cx - 6, cy - 2);
    ctx.closePath();
    ctx.fill();

    // Inner highlight
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx + 3, cy - 2);
    ctx.lineTo(cx, cy + 4);
    ctx.lineTo(cx - 3, cy - 2);
    ctx.closePath();
    ctx.fill();
  }
}

class PowerUp {
  constructor(x, y, type) {
    this.x    = x * T + T * 0.1;
    this.y    = y * T + T * 0.1;
    this.w    = T * 0.8;
    this.h    = T * 0.8;
    this.type = type; // 'doubleJump' | 'rapidFire' | 'shield' | 'life'
    this.dead = false;
    this._time = Math.random() * Math.PI * 2;
  }

  _color() {
    switch (this.type) {
      case 'doubleJump': return ['#aa44ff', '#dd88ff'];
      case 'rapidFire':  return ['#ffaa00', '#ffee00'];
      case 'shield':     return ['#0066ff', '#44aaff'];
      case 'life':       return ['#ff2244', '#ff88aa'];
      default:           return ['#ffffff', '#cccccc'];
    }
  }

  _icon() {
    switch (this.type) {
      case 'doubleJump': return '✦';
      case 'rapidFire':  return '⚡';
      case 'shield':     return '◈';
      case 'life':       return '♥';
      default:           return '?';
    }
  }

  update(dt, game) {
    this._time += dt * 2;
    const p = game.player;
    if (rectOverlap(this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h)) {
      this._apply(p, game);
      game.audio.collectPowerup();
      game.particles.crystalSpark(this.x + this.w / 2, this.y + this.h / 2);
      this.dead = true;
    }
  }

  _apply(p, game) {
    switch (this.type) {
      case 'doubleJump':
        p.canDoubleJump = true;
        p.powerUpTimer  = 20;
        p.activePowerUp = 'doubleJump';
        break;
      case 'rapidFire':
        p.rapidFire    = true;
        p.powerUpTimer  = 12;
        p.activePowerUp = 'rapidFire';
        break;
      case 'shield':
        p.shielded     = true;
        p.powerUpTimer  = 15;
        p.activePowerUp = 'shield';
        break;
      case 'life':
        game.lives = Math.min(game.lives + 1, 5);
        game.score += 200;
        break;
    }
  }

  render(ctx) {
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2 + Math.sin(this._time) * 4;
    const t = this._time;
    const [c1, c2] = this._color();

    // Rotating glow ring
    ctx.globalAlpha = 0.3 + 0.1 * Math.sin(t);
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 28);
    g.addColorStop(0, c1);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // Box
    const bx = cx - this.w / 2 + 2, by = cy - this.h / 2 + 2;
    const bw = this.w - 4, bh = this.h - 4;
    ctx.strokeStyle = c1;
    ctx.lineWidth = 2;
    ctx.shadowColor = c1;
    ctx.shadowBlur = 10;

    const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
    grad.addColorStop(0, c2 + '88');
    grad.addColorStop(1, c1 + '55');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 6);
    ctx.fill(); ctx.stroke();

    ctx.shadowBlur = 0;

    // Icon
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this._icon(), cx, cy);
  }
}


// ===================== Enemy.js =====================




// ── Base enemy ─────────────────────────────────────────────────────────────
class Enemy {
  constructor(tx, ty, w, h) {
    this.x    = tx * T + (T - w) / 2;
    this.y    = ty * T - h + T;
    this.w    = w;
    this.h    = h;
    this.vx   = 0;
    this.vy   = 0;
    this.dir  = 1;
    this.hp   = 1;
    this.dead = false;
    this.invincible = 0; // seconds of invincibility after hit
    this._time = rnd(0, Math.PI * 2);
    this._prevY = this.y;
    this.grounded = false;
  }

  takeDamage(dmg, game) {
    if (this.invincible > 0) return;
    this.hp -= dmg;
    this.invincible = 0.15;
    game.audio.enemyHit();
    game.camera.shake(4);
    if (this.hp <= 0) this._die(game);
  }

  _die(game) {
    this.dead = true;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    // Stomp kills score higher than shots
    const base = this._stomped ? SC_STOMP : SC_SHOOT;
    game.addKill(base, cx, cy - 20, this._deathColor());
    game.audio.enemyDie();
    game.particles.explosion(cx, cy, this._deathColor(), 18);
    game.camera.shake(7);
  }

  _deathColor() { return '#ff6600'; }

  _applyGravity(dt) {
    this.vy = Math.min(this.vy + 2400 * dt, 900);
  }

  _resolveY(level) {
    this._prevY = this.y;
    this.grounded = false;
    this.y += this.vy;
    // Simple tile ground check at feet
    const cx = this.x + this.w / 2;
    const ty = Math.floor((this.y + this.h) / T);
    const tx = Math.floor(cx / T);
    const tile = level.getTile(tx, ty);
    const tileBelow = level.getTile(tx, ty + 1);
    if (tile === 1 || tile === 2) {
      this.y  = ty * T - this.h;
      this.vy = 0;
      this.grounded = true;
    }
  }

  _edgeCheck(level) {
    // Turn around at platform edge
    const frontX = this.dir > 0 ? this.x + this.w + 2 : this.x - 2;
    const footY  = this.y + this.h + 4;
    const tx = Math.floor(frontX / T);
    const ty = Math.floor(footY / T);
    const tileAhead = level.getTile(Math.floor(frontX / T), Math.floor(this.y / T));
    const tileBelow = level.getTile(tx, ty);
    if (tileAhead === 1 || tileBelow === 0) {
      this.dir = -this.dir;
      this.x  += this.dir * 2;
    }
  }

  _checkPlayerStomp(game) {
    const p = game.player;
    if (!rectOverlap(this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h)) return false;

    // Stomp: player falling + feet above enemy mid
    if (p.vy > 0 && p.y + p.h < this.y + this.h * 0.6) {
      this._stomped = true;          // flag so _die awards stomp score
      this.takeDamage(1, game);
      this._stomped = false;
      p.stompBounce();
      game.audio.stomp();
      game.camera.shake(5);
      return true;
    }

    // Side collision → hurt player
    if (!p.invincible) {
      p.hurt(game);
    }
    return false;
  }

  // dt-stepped resolve for X
  _moveX(level, dt) {
    this.x += this.vx * dt;
    // Wall check
    const tx0 = Math.floor(this.x / T);
    const tx1 = Math.floor((this.x + this.w - 1) / T);
    const ty0 = Math.floor(this.y / T);
    const ty1 = Math.floor((this.y + this.h - 1) / T);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (level.getTile(tx, ty) !== 1) continue;
        const tileX = tx * T;
        if (this.vx > 0 && this.x + this.w > tileX) {
          this.x = tileX - this.w; this.vx = 0; this.dir = -1;
        } else if (this.vx < 0 && this.x < tileX + T) {
          this.x = tileX + T; this.vx = 0; this.dir = 1;
        }
      }
    }
  }

  _moveY(level, dt) {
    this._prevY = this.y;
    this.y += this.vy * dt;
    this.grounded = false;

    const tx0 = Math.floor(this.x / T);
    const tx1 = Math.floor((this.x + this.w - 1) / T);
    const ty0 = Math.floor(this.y / T);
    const ty1 = Math.floor((this.y + this.h - 1) / T);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tile = level.getTile(tx, ty);
        if (tile === 0) continue;
        const tileY = ty * T;
        if (tile === 1 || tile === 2) {
          if (this.vy > 0 && this.y + this.h > tileY && this._prevY + this.h <= tileY + 1) {
            this.y = tileY - this.h; this.vy = 0; this.grounded = true;
          }
          if (tile === 1 && this.vy < 0 && this.y < tileY + T && this._prevY >= tileY + T) {
            this.y = tileY + T; this.vy = 0;
          }
        }
      }
    }
  }

  render(ctx) {} // overridden
}

// ── Crawler: patrols ground ────────────────────────────────────────────────
class Crawler extends Enemy {
  constructor(tx, ty) {
    super(tx, ty, 34, 28);
    this.vx = CRAWLER_SPEED;
    this._wobble = 0;
  }
  _deathColor() { return '#44ff44'; }

  update(dt, game) {
    this._time += dt * 3;
    this.invincible = Math.max(0, this.invincible - dt);

    this._applyGravity(dt);
    this._moveX(game.level, dt);
    this._moveY(game.level, dt);
    this._edgeCheck(game.level);
    this.vx = CRAWLER_SPEED * this.dir;

    this._checkPlayerStomp(game);

    // Fall off edge check
    if (this.y > game.level.worldH + 200) this.dead = true;
  }

  render(ctx) {
    if (this.dead) return;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const bob = Math.sin(this._time) * 2;
    const flash = this.invincible > 0 ? 0.6 : 1;

    ctx.globalAlpha = flash;

    // Shadow
    ctx.globalAlpha = 0.15 * flash;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(cx, this.y + this.h + 3, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = flash;

    // Body blob
    const bg = ctx.createRadialGradient(cx - 4, cy - 4 + bob, 2, cx, cy + bob, 18);
    bg.addColorStop(0, '#88ff66');
    bg.addColorStop(0.6, '#44cc22');
    bg.addColorStop(1, '#225511');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.ellipse(cx, cy + bob, 17, 15, 0, 0, Math.PI * 2); ctx.fill();

    // Spots
    ctx.fillStyle = 'rgba(0,100,0,0.35)';
    ctx.beginPath(); ctx.arc(cx - 5, cy + bob + 3, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 6, cy + bob + 2, 3, 0, Math.PI * 2); ctx.fill();

    // Eyes
    const eyeDir = this.dir;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(cx + eyeDir * 5, cy - 4 + bob, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + eyeDir * -2, cy - 4 + bob, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#001a00';
    ctx.beginPath(); ctx.arc(cx + eyeDir * 6, cy - 4 + bob, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + eyeDir * -1, cy - 4 + bob, 2, 0, Math.PI * 2); ctx.fill();

    // Legs (4 small blobs)
    ctx.fillStyle = '#33aa11';
    for (let i = 0; i < 4; i++) {
      const lx = cx - 12 + i * 8;
      const ly = this.y + this.h - 2 + Math.sin(this._time + i * 1.2) * 3;
      ctx.beginPath(); ctx.ellipse(lx, ly, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
    }

    ctx.globalAlpha = 1;
  }
}

// ── Bouncer: bouncing ball ──────────────────────────────────────────────────
class Bouncer extends Enemy {
  constructor(tx, ty) {
    super(tx, ty, 32, 32);
    this.vx = BOUNCER_SPEED;
    this._bounceTimer = 0;
    this.hp = 2;
    this._rot = 0;
  }
  _deathColor() { return '#ff8800'; }

  update(dt, game) {
    this._time += dt * 4;
    this.invincible = Math.max(0, this.invincible - dt);

    this._bounceTimer -= dt;
    if (this._bounceTimer <= 0 && this.grounded) {
      this.vy = -620;
      this._bounceTimer = 0.5 + rnd(0, 0.3);
      game.audio.land(); // reuse land sound
    }

    this._applyGravity(dt);
    this._moveX(game.level, dt);
    this._moveY(game.level, dt);
    this._edgeCheck(game.level);
    this.vx = BOUNCER_SPEED * this.dir;
    this._rot += this.vx * dt * 0.04;

    this._checkPlayerStomp(game);
    if (this.y > game.level.worldH + 200) this.dead = true;
  }

  render(ctx) {
    if (this.dead) return;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const flash = this.invincible > 0 ? 0.55 : 1;

    ctx.globalAlpha = flash;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this._rot);

    // Body
    const bg = ctx.createRadialGradient(-5, -5, 2, 0, 0, 16);
    bg.addColorStop(0, '#ffcc44');
    bg.addColorStop(0.6, '#ff6600');
    bg.addColorStop(1, '#aa2200');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();

    // Spikes
    ctx.fillStyle = '#cc4400';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(-4, -20);
      ctx.lineTo(4, -20);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Eyes (angry)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(-5, -3, 4, 4.5, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(5, -3, 4, 4.5, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#220000';
    ctx.beginPath(); ctx.arc(-4, -2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(6, -2, 2, 0, Math.PI * 2); ctx.fill();

    // Angry eyebrows
    ctx.strokeStyle = '#440000';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-9,-7); ctx.lineTo(-2,-5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(9,-7); ctx.lineTo(2,-5); ctx.stroke();

    // HP indicator
    ctx.restore();
    if (this.hp > 1) {
      ctx.fillStyle = '#ffff00';
      ctx.beginPath(); ctx.arc(cx, cy - 24, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('2', cx, cy - 24);
    }

    ctx.globalAlpha = 1;
  }
}

// ── Shooter: turret enemy ─────────────────────────────────────────────────
class Shooter extends Enemy {
  constructor(tx, ty) {
    super(tx, ty, 30, 38);
    this.vx = 0;
    this.hp = 3;
    this._shootTimer = 1.5 + rnd(0, 1);
    this._alertTimer = 0; // warning before shooting
    this._alert = false;
    this._range = 380; // detection range px
  }
  _deathColor() { return '#cc44ff'; }

  update(dt, game) {
    this._time += dt * 2;
    this.invincible = Math.max(0, this.invincible - dt);

    this._applyGravity(dt);
    this._moveY(game.level, dt);

    const p = game.player;
    const dx = (p.x + p.w/2) - (this.x + this.w/2);
    const dy = Math.abs((p.y + p.h/2) - (this.y + this.h/2));
    const inRange = Math.abs(dx) < this._range && dy < 120;

    if (inRange) {
      this.dir = dx > 0 ? 1 : -1;
      this._shootTimer -= dt;
      if (this._shootTimer <= 0.4 && !this._alert) {
        this._alert = true;
        this._alertTimer = 0.4;
      }
      if (this._alertTimer > 0) this._alertTimer -= dt;

      if (this._shootTimer <= 0) {
        this._shootTimer = 2 + rnd(0, 1);
        this._alert = false;
        // Fire at player
        const ox = this.x + (this.dir > 0 ? this.w + 2 : -12);
        const oy = this.y + this.h * 0.3;
        const speed = 230;
        const vx = this.dir * speed;
        // Slight aim toward player
        const dist = Math.sqrt(dx*dx + dy*dy);
        const vy = (p.y + p.h/2 - oy) / Math.max(dist, 1) * speed * 0.6;
        game.projectiles.push(new EnemyBullet(ox, oy, vx, vy));
        game.audio.shoot();
      }
    } else {
      this._alert = false;
    }

    this._checkPlayerStomp(game);
    if (this.y > game.level.worldH + 200) this.dead = true;
  }

  render(ctx) {
    if (this.dead) return;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const flash = this.invincible > 0 ? 0.5 : 1;

    ctx.globalAlpha = flash;

    // Body
    const bg = ctx.createLinearGradient(this.x, this.y, this.x + this.w, this.y + this.h);
    bg.addColorStop(0, '#8844cc');
    bg.addColorStop(1, '#441188');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(this.x + 2, this.y + 2, this.w - 4, this.h - 4, 5);
    ctx.fill();

    // Armour plates
    ctx.fillStyle = '#6633aa';
    ctx.fillRect(this.x + 4, this.y + 4, this.w - 8, 10);
    ctx.fillRect(this.x + 4, this.y + this.h - 14, this.w - 8, 10);

    // Cannon
    const cannonX = this.dir > 0 ? this.x + this.w - 2 : this.x + 2;
    const cannonW = 14 * this.dir;
    ctx.fillStyle = '#331155';
    ctx.fillRect(cannonX, this.y + this.h * 0.3 - 5, cannonW, 10);
    // Cannon tip glow (alert)
    if (this._alert) {
      const glow = 0.5 + 0.5 * Math.sin(this._alertTimer * 30);
      ctx.fillStyle = `rgba(255,150,0,${glow})`;
      ctx.beginPath();
      ctx.arc(cannonX + cannonW, this.y + this.h * 0.3, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Eye (single, helmet visor)
    ctx.fillStyle = '#220044';
    ctx.fillRect(this.x + 4, this.y + 8, this.w - 8, 12);
    const eyeGlow = 0.7 + 0.3 * Math.sin(this._time * 4);
    ctx.fillStyle = `rgba(200,100,255,${eyeGlow})`;
    ctx.fillRect(this.x + 6, this.y + 10, this.w - 12, 8);

    // HP bar
    const barW = (this.w - 4) * (this.hp / 3);
    ctx.fillStyle = '#220022';
    ctx.fillRect(this.x + 2, this.y - 10, this.w - 4, 5);
    ctx.fillStyle = '#cc44ff';
    ctx.fillRect(this.x + 2, this.y - 10, barW, 5);

    ctx.globalAlpha = 1;
  }
}


// ===================== Boss.js =====================




const BOSS_W = 96;
const BOSS_H = 84;
const MAX_HP = 20;

class Boss {
  constructor(tx, ty) {
    this.x    = tx * T - BOSS_W / 2;
    this.y    = ty * T - BOSS_H + T;
    this.w    = BOSS_W;
    this.h    = BOSS_H;
    this.vx   = 0;
    this.vy   = 0;
    this.dir  = -1;
    this.hp   = MAX_HP;
    this.dead = false;
    this.grounded = false;
    this._prevY = this.y;

    this.invincible = 0;
    this.phase = 1; // 1, 2, or 3

    // Attack timers
    this._stompTimer  = 3.0;
    this._shotTimer   = 4.0;
    this._jumpTimer   = 6.0;
    this._stunTimer   = 0; // briefly stunned after landing slam

    // Animation
    this._time    = 0;
    this._walkAnim = 0;
    this._hitFlash = 0;
    this._roarTimer = 0;

    // Intro sequence
    this._intro = true;
    this._introTimer = 2.5;
    this._roarTimer = 2.0;
    this._entered = false;
  }

  get phase1() { return this.hp > 13; }
  get phase2() { return this.hp > 6 && this.hp <= 13; }
  get phase3() { return this.hp <= 6; }
  get currentPhase() { return this.phase1 ? 1 : this.phase2 ? 2 : 3; }

  takeDamage(dmg, game) {
    if (this.invincible > 0 || this._intro) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.invincible = 0.1;
    this._hitFlash  = 0.12;
    game.score += SC_BOSS_HIT;
    game.audio.bossHit();
    game.camera.shake(8);
    game.hitStop(0.04);
    game.flash('#ff6622', 0.12);
    game.particles.explosion(this.x + this.w/2, this.y + this.h/2, '#ff4400', 10);

    // Phase transition
    const newPhase = this.currentPhase;
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      game.camera.shake(18);
      game.hitStop(0.12);
      game.flash('#ffaa33', 0.4);
      game.audio.explosion();
      game.particles.explosion(this.x + this.w/2, this.y + this.h/2, '#ff8800', 30);
    }

    if (this.hp <= 0) this._die(game);
  }

  _die(game) {
    this.dead = true;
    game.audio.explosion();
    game.camera.shake(20);
    game.hitStop(0.3);
    game.flash('#ffffff', 0.7);
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        game.particles.explosion(
          this.x + rnd(0, this.w), this.y + rnd(0, this.h),
          ['#ff4400','#ff8800','#ffcc00'][rndInt(0,2)], 25
        );
      }, i * 200);
    }
    // Trigger win after delay
    setTimeout(() => { game.triggerWin(); }, 1500);
  }

  update(dt, game) {
    this._time += dt;
    this.invincible = Math.max(0, this.invincible - dt);
    this._hitFlash  = Math.max(0, this._hitFlash  - dt);

    if (this.dead) return;

    // Intro sequence
    if (this._intro) {
      this._introTimer -= dt;
      this._roarTimer  -= dt;
      if (this._roarTimer > 0) {
        game.camera.shake(4 * (this._roarTimer / 2));
        if (Math.random() < 0.3) {
          game.particles.bossSmoke(this.x + this.w/2, this.y);
        }
      }
      if (this._introTimer <= 0) this._intro = false;

      // Boss drops in during intro
      this._applyGravity(dt);
      this._moveY(game.level, dt);
      return;
    }

    // Stun (after slam landing)
    if (this._stunTimer > 0) {
      this._stunTimer -= dt;
      return;
    }

    // Phase-based speed
    const speed = this.phase === 1 ? 90 : this.phase === 2 ? 130 : 170;

    // Walk toward player
    const p = game.player;
    const dx = (p.x + p.w/2) - (this.x + this.w/2);
    this.dir = dx > 0 ? 1 : -1;
    this.vx  = speed * this.dir;

    // Attack timers
    this._stompTimer -= dt;
    this._walkAnim   += dt * 6;

    if (this.phase >= 2) {
      this._shotTimer -= dt;
    }
    if (this.phase === 3) {
      this._jumpTimer -= dt;
    }

    // Stomp attack
    if (this._stompTimer <= 0 && this.grounded) {
      this._doStomp(game);
      this._stompTimer = this.phase === 3 ? 1.8 : 2.8;
    }

    // Shoot attack (phase 2+)
    if (this.phase >= 2 && this._shotTimer <= 0) {
      this._doShoot(game);
      this._shotTimer = this.phase === 3 ? 1.5 : 2.5;
    }

    // Jump slam (phase 3)
    if (this.phase === 3 && this._jumpTimer <= 0 && this.grounded) {
      this._doJumpSlam(game);
      this._jumpTimer = 3.5;
    }

    // Gravity + movement
    const wasGrounded = this.grounded;
    this._applyGravity(dt);
    this._moveX(game.level, dt);
    this._moveY(game.level, dt);

    // Jump-slam landing
    if (!wasGrounded && this.grounded && this._pendingSlam) {
      this._pendingSlam = false;
      this._doStomp(game);
    }

    // Smoke trail in phase 3
    if (this.phase === 3 && Math.random() < 0.3) {
      game.particles.bossSmoke(this.x + this.w/2, this.y + this.h);
    }

    // Player contact
    if (!p.invincible && rectOverlap(this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h)) {
      p.hurt(game);
    }
  }

  _doStomp(game) {
    game.camera.shake(14);
    game.audio.explosion();
    // Shockwave left and right
    const sy = this.y + this.h - 20;
    game.projectiles.push(new Shockwave(this.x + this.w/2, sy,  1, 240));
    game.projectiles.push(new Shockwave(this.x + this.w/2, sy, -1, 240));
    game.particles.landDust(this.x + this.w/2, this.y + this.h);
    this._stunTimer = 0.5;
  }

  _doShoot(game) {
    const ox = this.x + (this.dir > 0 ? this.w + 4 : -14);
    const oy = this.y + 20;
    const p  = game.player;
    // Fire spread of 3 bullets in phase 3
    const count = this.phase === 3 ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.3;
      const ang = Math.atan2(p.y + p.h/2 - oy, p.x + p.w/2 - ox) + spread;
      game.projectiles.push(new EnemyBullet(ox, oy, Math.cos(ang)*260, Math.sin(ang)*260));
    }
    game.audio.shoot();
  }

  _doJumpSlam(game) {
    this.vy = -700;
    this.grounded = false;
    game.camera.shake(6);
    // On landing (handled in _moveY), create 3 shockwaves
    this._pendingSlam = true;
  }

  _applyGravity(dt) {
    this.vy = Math.min(this.vy + 2200 * dt, 900);
  }

  _moveX(level, dt) {
    this.x += this.vx * dt;
    const tx0 = Math.floor(this.x / T);
    const tx1 = Math.floor((this.x + this.w - 1) / T);
    const ty0 = Math.floor(this.y / T);
    const ty1 = Math.floor((this.y + this.h - 1) / T);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (level.getTile(tx, ty) !== 1) continue;
        const tileX = tx * T;
        if (this.vx > 0 && this.x + this.w > tileX) {
          this.x = tileX - this.w; this.vx = 0; this.dir = -1;
        } else if (this.vx < 0 && this.x < tileX + T) {
          this.x = tileX + T; this.vx = 0; this.dir = 1;
        }
      }
    }
  }

  _moveY(level, dt) {
    this._prevY = this.y;
    this.y += this.vy * dt;
    this.grounded = false;

    const tx0 = Math.floor(this.x / T);
    const tx1 = Math.floor((this.x + this.w - 1) / T);
    const ty0 = Math.floor(this.y / T);
    const ty1 = Math.floor((this.y + this.h - 1) / T);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tile = level.getTile(tx, ty);
        if (tile !== 1) continue;
        const tileY = ty * T;
        if (this.vy > 0 && this.y + this.h > tileY && this._prevY + this.h <= tileY + 1) {
          this.y = tileY - this.h; this.vy = 0; this.grounded = true;
        }
        if (this.vy < 0 && this.y < tileY + T && this._prevY >= tileY + T) {
          this.y = tileY + T; this.vy = 0;
        }
      }
    }
  }

  render(ctx) {
    if (this.dead) return;
    const flash = this._hitFlash > 0;
    if (flash && Math.floor(this._hitFlash * 25) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }

    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const walk = Math.sin(this._walkAnim) * 3;

    // Draw phase-colored aura
    const phaseHue = this.phase === 1 ? 220 : this.phase === 2 ? 30 : 0;
    ctx.globalAlpha = 0.2;
    const aura = ctx.createRadialGradient(cx, cy, 10, cx, cy, 70);
    aura.addColorStop(0, `hsl(${phaseHue},100%,60%)`);
    aura.addColorStop(1, 'transparent');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(cx, cy, 70, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(cx, cy + walk);
    if (this.dir < 0) ctx.scale(-1, 1);

    // Legs (4 mechanical legs)
    ctx.fillStyle = '#333355';
    for (let i = 0; i < 4; i++) {
      const lx = -40 + i * 26;
      const legPhase = Math.sin(this._walkAnim + i * 1.2) * 8;
      ctx.fillRect(lx, 28, 12, 22 + legPhase);
      // Foot
      ctx.fillStyle = '#555577';
      ctx.fillRect(lx - 4, 48 + legPhase, 20, 8);
      ctx.fillStyle = '#333355';
    }

    // Body
    const bodyGrad = ctx.createLinearGradient(-40, -32, 40, 32);
    bodyGrad.addColorStop(0, '#444466');
    bodyGrad.addColorStop(0.5, '#222244');
    bodyGrad.addColorStop(1, '#111133');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-44, -28, 88, 60, 12);
    ctx.fill();

    // Armour plates
    ctx.fillStyle = '#333355';
    ctx.fillRect(-44, -28, 88, 14); // top plate
    ctx.fillRect(-44, 18, 88, 14);  // bottom plate

    // Rivets
    ctx.fillStyle = '#555588';
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath(); ctx.arc(i * 12, -22, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(i * 12, 24, 3, 0, Math.PI * 2); ctx.fill();
    }

    // Shoulder cannons (phase 2+)
    if (this.phase >= 2) {
      ctx.fillStyle = '#442200';
      ctx.fillRect(28, -38, 28, 14);
      ctx.fillStyle = '#331100';
      ctx.beginPath(); ctx.arc(56, -31, 8, 0, Math.PI * 2); ctx.fill();
      // Glow
      const cg = 0.5 + 0.5 * Math.sin(this._time * 8);
      ctx.fillStyle = `rgba(255,${this.phase === 3 ? 50 : 100},0,${cg})`;
      ctx.beginPath(); ctx.arc(56, -31, 5, 0, Math.PI * 2); ctx.fill();
    }

    // Head
    const headGrad = ctx.createRadialGradient(-6, -46, 4, 0, -44, 24);
    headGrad.addColorStop(0, '#555577');
    headGrad.addColorStop(1, '#222244');
    ctx.fillStyle = headGrad;
    ctx.beginPath(); ctx.roundRect(-24, -60, 48, 36, 8); ctx.fill();

    // Visor
    ctx.fillStyle = '#110022';
    ctx.fillRect(-20, -54, 40, 16);
    // Eye (one big glowing eye)
    const eyeGlow = 0.6 + 0.4 * Math.sin(this._time * 6);
    const eyeHue = this.phase === 3 ? 0 : this.phase === 2 ? 30 : 200;
    ctx.fillStyle = `hsla(${eyeHue},100%,60%,${eyeGlow})`;
    ctx.fillRect(-16, -52, 32, 12);
    ctx.fillStyle = `hsla(${eyeHue},100%,80%,0.9)`;
    ctx.beginPath(); ctx.arc(0, -46, 5, 0, Math.PI * 2); ctx.fill();

    ctx.restore();

    // HP bar above boss
    const barW = this.w * 1.2;
    const barX = this.x + this.w/2 - barW/2;
    const barY = this.y - 22;
    ctx.fillStyle = '#330000';
    ctx.fillRect(barX, barY, barW, 10);
    const hpFrac = this.hp / MAX_HP;
    const barColor = hpFrac > 0.5 ? '#00ff44' : hpFrac > 0.25 ? '#ffaa00' : '#ff2200';
    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, barW * hpFrac, 10);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, 10);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MECH-REX', cx, barY - 4);

    ctx.globalAlpha = 1;
  }
}


// ===================== Player.js =====================




class Player {
  constructor(tx, ty) {
    this.x = tx * T;
    this.y = ty * T;
    this.w = PW;
    this.h = PH;
    this.vx = 0;
    this.vy = 0;

    this.grounded      = false;
    this.facingRight   = true;
    this._coyote       = 0;  // coyote time counter
    this._jumpBuf      = 0;  // jump buffer counter
    this._jumpHeld     = 0;  // how long jump has been held
    this._wasGrounded  = false;
    this._prevY        = 0;

    this.invincible    = false;
    this._invTimer     = 0;

    // Power-ups
    this.canDoubleJump = false;
    this._hasJumped2   = false;
    this.rapidFire     = false;
    this.shielded      = false;
    this.powerUpTimer  = 0;
    this.activePowerUp = null;

    this._shootTimer   = 0;

    // Animation
    this._animTime     = 0;
    this._animFrame    = 0;
    this._shootAnim    = 0;
    this._hurtFlash    = 0;
    this._landAnim     = 0;
    this._deathAnim    = 0;

    this.dead          = false;
    this._dying        = false;

    // Speed afterimage trail
    this._ghosts       = [];
    this._ghostTimer   = 0;
  }

  hurt(game) {
    if (this.invincible || this._dying) return;

    if (this.shielded) {
      this.shielded = false;
      this.powerUpTimer = 0;
      this.activePowerUp = null;
      game.audio.collectPowerup();
      game.particles.explosion(this.x + this.w/2, this.y + this.h/2, '#0066ff', 12);
      game.camera.shake(6);
      return;
    }

    game.lives--;
    game.audio.playerHurt();
    game.camera.shake(12);
    game.particles.hurt(this.x + this.w/2, this.y + this.h/2);

    this.invincible = true;
    this._invTimer  = INVINCIBLE_T;
    this._hurtFlash = 0;
    this.vy = -300; // small knockup
    this.vx = this.facingRight ? -150 : 150;

    if (game.lives <= 0) {
      this._dying = true;
      this._deathAnim = 0;
    }
  }

  update(dt, game) {
    const inp = game.input;

    if (this._dying) {
      this._deathAnim += dt;
      this.vy += GRAVITY * dt;
      this.y  += this.vy * dt;
      if (this._deathAnim > 1.5) {
        this.dead = true;
      }
      return;
    }

    this._prevY = this.y;

    // Power-up timer
    if (this.powerUpTimer > 0) {
      this.powerUpTimer -= dt;
      if (this.powerUpTimer <= 0) {
        this.powerUpTimer  = 0;
        this.canDoubleJump = false;
        this.rapidFire     = false;
        this.shielded      = false;
        this.activePowerUp = null;
      }
    }

    // Invincibility
    if (this.invincible) {
      this._invTimer  -= dt;
      this._hurtFlash += dt;
      if (this._invTimer <= 0) this.invincible = false;
    }

    // Shoot cooldown
    this._shootTimer = Math.max(0, this._shootTimer - dt);

    // ── Horizontal movement ────────────────────────────────────────
    const spd = PLAYER_SPEED * (this.rapidFire ? 1.4 : 1);
    if (inp.left()) {
      this.vx = clamp(this.vx - PLAYER_ACCEL * dt, -spd, spd);
      this.facingRight = false;
    } else if (inp.right()) {
      this.vx = clamp(this.vx + PLAYER_ACCEL * dt, -spd, spd);
      this.facingRight = true;
    } else {
      // Decelerate
      if (Math.abs(this.vx) < 20) this.vx = 0;
      else this.vx -= sign(this.vx) * PLAYER_DECEL * dt;
    }

    // ── Jump input ────────────────────────────────────────────────
    if (inp.jumpPressed()) this._jumpBuf = JUMP_BUF_T;
    if (this._jumpBuf > 0) this._jumpBuf -= dt;

    const canJump = this.grounded || this._coyote > 0;

    if (this._jumpBuf > 0 && canJump) {
      this.vy = JUMP_VEL;
      this._jumpBuf  = 0;
      this._coyote   = 0;
      this._jumpHeld = 0;
      this._hasJumped2 = false;
      game.audio.jump();
      game.particles.jumpDust(this.x + this.w/2, this.y + this.h);
    } else if (inp.jumpPressed() && !canJump && this.canDoubleJump && !this._hasJumped2) {
      // Double jump
      this.vy = JUMP_VEL * 0.9;
      this._hasJumped2 = true;
      game.audio.doubleJump();
      game.particles.explosion(this.x + this.w/2, this.y + this.h, '#aa44ff', 10);
    }

    // Jump hold (variable height)
    if (inp.jump() && this.vy < 0) {
      this._jumpHeld += dt;
      if (this._jumpHeld < JUMP_HOLD_MAX) {
        this.vy += GRAVITY * (JUMP_HOLD_REDUCE - 1) * dt;
      }
    } else if (inp.jumpReleased()) {
      this._jumpHeld = JUMP_HOLD_MAX; // prevent further hold
    }

    // ── Shooting ──────────────────────────────────────────────────
    const cd = this.rapidFire ? SHOOT_CD_RAPID : SHOOT_CD;
    if (inp.shoot() && this._shootTimer <= 0) {
      this._shootTimer = cd;
      this._shootAnim  = 0.12;
      const bx = this.facingRight ? this.x + this.w : this.x - 20;
      const by = this.y + this.h * 0.35;
      game.projectiles.push(new PlayerBolt(bx, by, this.facingRight ? 1 : -1));
      game.audio.shoot();
    }

    // ── Gravity ───────────────────────────────────────────────────
    this.vy = clamp(this.vy + GRAVITY * dt, -9999, MAX_FALL);

    // ── Coyote time ───────────────────────────────────────────────
    if (this.grounded) this._coyote = COYOTE_T;
    else if (this._coyote > 0) this._coyote -= dt;

    const wasGrounded = this.grounded;
    this.grounded = false;

    // ── Move & collide (X then Y) ─────────────────────────────────
    this.x += this.vx * dt;
    this._resolveX(game.level);

    this.y += this.vy * dt;
    this._resolveY(game.level, wasGrounded, dt);

    // Clamping to world
    this.x = clamp(this.x, 0, game.level.worldW - this.w);
    if (this.y > game.level.worldH + 100) {
      // fell into pit
      this.hurt(game);
      this.x = game._spawnX;
      this.y = game._spawnY;
      this.vx = 0; this.vy = 0;
    }

    // Land effect
    if (!wasGrounded && this.grounded && this.vy >= -1) {
      this._landAnim = 0.15;
      game.audio.land();
      game.particles.landDust(this.x + this.w/2, this.y + this.h);
    }

    // ── Animation ─────────────────────────────────────────────────
    this._animTime += dt;
    this._shootAnim = Math.max(0, this._shootAnim - dt * 2);
    this._landAnim  = Math.max(0, this._landAnim  - dt * 4);

    if (this.grounded && Math.abs(this.vx) > 20) {
      const rate = Math.abs(this.vx) / PLAYER_SPEED;
      if (this._animTime > 0.1 / rate) {
        this._animTime = 0;
        this._animFrame = (this._animFrame + 1) % 4;
      }
    } else if (!this.grounded) {
      this._animFrame = 4; // jump/fall frame
    } else {
      this._animFrame = 0;
    }

    // Speed afterimage trail — spawn ghosts when moving fast
    if (Math.abs(this.vx) > PLAYER_SPEED * 0.82) {
      this._ghostTimer -= dt;
      if (this._ghostTimer <= 0) {
        this._ghostTimer = 0.045;
        this._ghosts.push({ x: this.x, y: this.y, life: 0.28, max: 0.28 });
      }
    }
    for (const g of this._ghosts) g.life -= dt;
    this._ghosts = this._ghosts.filter(g => g.life > 0);
  }

  _resolveX(level) {
    const tx0 = Math.floor(this.x / T);
    const tx1 = Math.floor((this.x + this.w - 1) / T);
    const ty0 = Math.floor(this.y / T);
    const ty1 = Math.floor((this.y + this.h - 1) / T);

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tile = level.getTile(tx, ty);
        if (tile !== 1) continue; // only solid
        const tileX = tx * T;
        // Moving right → hit left side of tile
        if (this.vx > 0 && this.x + this.w > tileX && this.x < tileX) {
          this.x  = tileX - this.w;
          this.vx = 0;
        }
        // Moving left → hit right side of tile
        if (this.vx < 0 && this.x < tileX + T && this.x + this.w > tileX + T) {
          this.x  = tileX + T;
          this.vx = 0;
        }
      }
    }
  }

  _resolveY(level, wasGrounded, dt = 0) {
    const tx0 = Math.floor(this.x / T);
    const tx1 = Math.floor((this.x + this.w - 1) / T);
    const ty0 = Math.floor(this.y / T);
    const ty1 = Math.floor((this.y + this.h - 1) / T);

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tile = level.getTile(tx, ty);
        if (tile === 0) continue;

        const tileY = ty * T;

        if (tile === 1) {
          // Solid: both directions
          if (this.vy > 0 && this.y + this.h > tileY && this._prevY + this.h <= tileY + 1) {
            this.y       = tileY - this.h;
            this.vy      = 0;
            this.grounded = true;
          }
          if (this.vy < 0 && this.y < tileY + T && this._prevY >= tileY + T) {
            this.y  = tileY + T;
            this.vy = 0;
          }
        } else if (tile === 2) {
          // One-way: only land from above
          if (this.vy > 0 && this.y + this.h > tileY && this._prevY + this.h <= tileY + 2) {
            this.y       = tileY - this.h;
            this.vy      = 0;
            this.grounded = true;
          }
        } else if (tile === 3) {
          // Spike → hurt (handled via spike check elsewhere, or here)
          // We call hurt from game loop, but mark grounded = false
        }
      }
    }

    // Moving platforms (mp.w is already in pixels)
    for (const mp of level.movingPlatforms) {
      if (this.vy >= 0 &&
          this.x + this.w > mp.x && this.x < mp.x + mp.w &&
          this.y + this.h > mp.y && this._prevY + this.h <= mp.y + 4) {
        this.y       = mp.y - this.h;
        this.vy      = 0;
        this.grounded = true;
        // Carry player with horizontal movement
        if (mp.axis === 'x') this.x += mp.vx * dt;
      }
    }
  }

  // Called when player stomp-lands on enemy
  stompBounce() { this.vy = STOMP_BOUNCE; }

  render(ctx) {
    if (this._dying) {
      this._renderDying(ctx);
      return;
    }

    // Speed afterimages (drawn behind the body)
    for (const g of this._ghosts) {
      const a = (g.life / g.max) * 0.4;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#00ddff';
      ctx.beginPath();
      ctx.roundRect(g.x + 2, g.y + 8, this.w - 4, this.h - 14, 8);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Invincibility blink
    if (this.invincible && Math.floor(this._hurtFlash * 12) % 2 === 0) return;

    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;

    // Squash/stretch
    const landSq   = this._landAnim / 0.15;
    const scaleX   = 1 + landSq * 0.25;
    const scaleY   = 1 - landSq * 0.2;
    const jumpStr  = !this.grounded && this.vy < 0 ? 0.12 : 0;
    const totalSX  = scaleX + jumpStr * -0.1;
    const totalSY  = scaleY + jumpStr * 0.12;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(totalSX, totalSY);
    if (!this.facingRight) ctx.scale(-1, 1);

    this._drawBody(ctx);

    ctx.restore();

    // Shield aura
    if (this.shielded) {
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.006);
      ctx.globalAlpha = 0.35 * pulse;
      const sg = ctx.createRadialGradient(cx, cy, 10, cx, cy, 32);
      sg.addColorStop(0, '#4488ff');
      sg.addColorStop(1, 'transparent');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(cx, cy, 32, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#88aaff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 * pulse;
      ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  _drawBody(ctx) {
    const f = this._animFrame;
    const shoot = this._shootAnim > 0;

    // Body shadow
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, PH/2 + 4, PW/2 + 2, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Aura glow
    const aura = ctx.createRadialGradient(0, 0, 4, 0, 0, 28);
    aura.addColorStop(0, 'rgba(0,200,255,0.22)');
    aura.addColorStop(1, 'rgba(0,100,255,0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();

    // Legs (animated)
    ctx.fillStyle = '#006699';
    const legY = PH/2 - 4;
    const legOff = [0, 6, 0, -6][f % 4];
    ctx.fillRect(-14, legY + legOff,     10, 12); // left leg
    ctx.fillRect(  4, legY - legOff,     10, 12); // right leg

    // Body
    const bodyGrad = ctx.createLinearGradient(-PW/2, -PH/2, PW/2, PH/2);
    bodyGrad.addColorStop(0, '#00ddff');
    bodyGrad.addColorStop(0.5, '#0099cc');
    bodyGrad.addColorStop(1, '#005588');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-PW/2 + 2, -PH/2 + 8, PW - 4, PH - 14, 8);
    ctx.fill();

    // Chest highlight
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(-4, -PH/2 + 18, 8, 12, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Arms
    ctx.fillStyle = '#0088bb';
    const armY = -PH/2 + 20;
    if (shoot) {
      // Right arm extended forward (shoot)
      ctx.fillRect(PW/2 - 2, armY - 3, 18, 8);
      // Energy ball at tip
      ctx.fillStyle = '#00ffff';
      ctx.beginPath(); ctx.arc(PW/2 + 16, armY + 1, 5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillRect(PW/2 - 2, armY, 10, 7);
    }
    ctx.fillStyle = '#0088bb';
    ctx.fillRect(-PW/2 - 8, armY, 10, 7); // left arm

    // Head
    const headGrad = ctx.createRadialGradient(-3, -PH/2 - 2, 3, 0, -PH/2, 14);
    headGrad.addColorStop(0, '#44eeff');
    headGrad.addColorStop(1, '#007799');
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(0, -PH/2 + 4, 14, 0, Math.PI * 2);
    ctx.fill();

    // Helmet ridge
    ctx.fillStyle = '#00aabb';
    ctx.fillRect(-6, -PH/2 - 4, 12, 6);
    ctx.beginPath(); ctx.arc(0, -PH/2 - 4, 6, Math.PI, 0); ctx.fill();

    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(5, -PH/2 + 2, 4.5, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-5, -PH/2 + 2, 3.5, 4, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#001133';
    ctx.beginPath(); ctx.arc(6, -PH/2 + 3, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-4.5, -PH/2 + 3, 2, 0, Math.PI * 2); ctx.fill();

    // Eye glow
    ctx.fillStyle = 'rgba(100,220,255,0.8)';
    ctx.beginPath(); ctx.arc(7, -PH/2 + 1, 1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-3.5, -PH/2 + 1, 0.8, 0, Math.PI * 2); ctx.fill();

    // Energy core (chest)
    const t = Date.now() * 0.003;
    ctx.fillStyle = `hsl(${190 + Math.sin(t)*20},100%,65%)`;
    ctx.beginPath(); ctx.arc(0, -4, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(-1, -5, 2, 0, Math.PI * 2); ctx.fill();
  }

  _renderDying(ctx) {
    const t = Math.min(this._deathAnim / 1.5, 1);
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    ctx.globalAlpha = 1 - t;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * Math.PI * 4);
    ctx.scale(1 - t * 0.5, 1 - t * 0.5);
    this._drawBody(ctx);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}


// ===================== Level.js =====================






class MovingPlatform {
  constructor(data) {
    const { tx, ty, w, speed, range, axis } = data;
    this.w     = w * T;
    this.h     = T;
    this.x     = tx * T;
    this.y     = ty * T;
    this._ox   = this.x;
    this._oy   = this.y;
    this.speed = speed;
    this.range = range * T;
    this.axis  = axis;
    this._dir  = 1;
    this._t    = 0;
    this.vx    = 0;
    this.vy    = 0;
  }

  update(dt) {
    const prev = this.axis === 'x' ? this.x : this.y;
    this._t += this.speed * dt * this._dir;
    if (Math.abs(this._t) >= this.range) {
      this._dir = -this._dir;
      this._t = Math.sign(this._t) * this.range;
    }
    if (this.axis === 'x') {
      this.x  = this._ox + this._t;
      this.vx = (this.x - prev) / dt;
      this.vy = 0;
    } else {
      this.y  = this._oy + this._t;
      this.vy = (this.y - prev) / dt;
      this.vx = 0;
    }
  }

  render(ctx) {
    const grd = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
    grd.addColorStop(0, '#44ffaa');
    grd.addColorStop(1, '#007733');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.roundRect(this.x + 2, this.y + 2, this.w - 4, this.h - 4, 4);
    ctx.fill();

    ctx.strokeStyle = '#88ffcc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(this.x + 2, this.y + 2, this.w - 4, this.h - 4, 4);
    ctx.stroke();

    // Animated energy pulse
    const t = Date.now() * 0.002;
    ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t + this.x * 0.01);
    ctx.fillStyle = '#aaffdd';
    ctx.fillRect(this.x + 2, this.y + 2, this.w - 4, 4);
    ctx.globalAlpha = 1;
  }
}

class Level {
  constructor(data) {
    this.data      = data;
    this.tileW     = data.tileW;
    this.tileH     = data.tileH;
    this.worldW    = data.tileW * T;
    this.worldH    = data.tileH * T;

    // Build tile map
    this._tiles = new Uint8Array(this.tileW * this.tileH);
    for (const { x, y, type } of data.tiles) {
      if (x >= 0 && x < this.tileW && y >= 0 && y < this.tileH)
        this._tiles[y * this.tileW + x] = type;
    }

    this.movingPlatforms = (data.movingPlatforms || []).map(d => new MovingPlatform(d));

    // Exit flag position
    this.exitX = data.exit ? data.exit.tx * T + T / 2 : -9999;
    this.exitY = data.exit ? data.exit.ty * T : -9999;
  }

  static buildEntities(data) {
    const enemies     = [];
    const collectibles = [];
    let boss = null;

    for (const e of (data.enemies || [])) {
      switch (e.type) {
        case 'crawler': enemies.push(new Crawler(e.tx, e.ty)); break;
        case 'bouncer': enemies.push(new Bouncer(e.tx, e.ty)); break;
        case 'shooter': enemies.push(new Shooter(e.tx, e.ty)); break;
      }
    }
    for (const c of (data.crystals || []))  collectibles.push(new Crystal(c.tx, c.ty));
    for (const p of (data.powerUps || []))  collectibles.push(new PowerUp(p.tx, p.ty, p.type));
    if (data.boss) boss = new Boss(data.boss.tx, data.boss.ty);

    return { enemies, collectibles, boss };
  }

  getTile(tx, ty) {
    if (tx < 0 || tx >= this.tileW || ty < 0 || ty >= this.tileH) return 0;
    return this._tiles[ty * this.tileW + tx];
  }

  // Returns true if any solid/spike tile covers the rect
  solidAt(rx, ry, rw, rh) {
    const tx0 = Math.floor(rx / T);
    const tx1 = Math.floor((rx + rw - 1) / T);
    const ty0 = Math.floor(ry / T);
    const ty1 = Math.floor((ry + rh - 1) / T);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.getTile(tx, ty);
        if (t === 1) return true;
      }
    }
    return false;
  }

  // Check spikes
  spikeAt(rx, ry, rw, rh) {
    const tx0 = Math.floor(rx / T);
    const tx1 = Math.floor((rx + rw - 1) / T);
    const ty0 = Math.floor(ry / T);
    const ty1 = Math.floor((ry + rh - 1) / T);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (this.getTile(tx, ty) === 3) return true;
      }
    }
    return false;
  }

  update(dt) {
    for (const mp of this.movingPlatforms) mp.update(dt);
  }

  render(ctx, camera) {
    // Visible tile range
    const x0 = Math.max(0, Math.floor(camera.x / T) - 1);
    const x1 = Math.min(this.tileW - 1, Math.ceil((camera.x + 960) / T) + 1);
    const y0 = Math.max(0, Math.floor(camera.y / T) - 1);
    const y1 = Math.min(this.tileH - 1, Math.ceil((camera.y + 540) / T) + 1);

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const tile = this.getTile(tx, ty);
        if (tile === 0) continue;
        const px = tx * T;
        const py = ty * T;

        if (tile === 1) this._drawSolid(ctx, px, py, tx, ty);
        else if (tile === 2) this._drawOneway(ctx, px, py);
        else if (tile === 3) this._drawSpike(ctx, px, py);
      }
    }

    // Moving platforms
    for (const mp of this.movingPlatforms) mp.render(ctx);

    // Exit flag
    if (this.data.exit) this._drawExit(ctx, this.data.exit.tx, this.data.exit.ty);
  }

  _drawSolid(ctx, px, py, tx, ty) {
    // Check if top face exposed
    const topOpen = this.getTile(tx, ty - 1) !== 1;

    // Base fill
    const g = ctx.createLinearGradient(px, py, px, py + T);
    g.addColorStop(0, topOpen ? '#1a4a6a' : '#0f2a3a');
    g.addColorStop(1, '#0a1f2e');
    ctx.fillStyle = g;
    ctx.fillRect(px, py, T, T);

    // Top edge highlight (only if top is exposed)
    if (topOpen) {
      ctx.fillStyle = '#2a7aac';
      ctx.fillRect(px, py, T, 3);
      // Corner cap
      ctx.fillStyle = '#3a9acc';
      ctx.fillRect(px, py, 3, 3);
      ctx.fillRect(px + T - 3, py, 3, 3);
    }

    // Grid line
    ctx.strokeStyle = 'rgba(40,90,130,0.5)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(px, py, T, T);

    // Occasional crystal veins
    if ((tx + ty * 3) % 7 === 0) {
      ctx.strokeStyle = 'rgba(0,180,220,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 8, py + 2);
      ctx.lineTo(px + T - 8, py + T - 4);
      ctx.stroke();
    }
  }

  _drawOneway(ctx, px, py) {
    // Semi-transparent energy shelf
    ctx.globalAlpha = 0.85;
    const g = ctx.createLinearGradient(px, py + 6, px, py + T);
    g.addColorStop(0, '#00ff99');
    g.addColorStop(0.3, '#007744');
    g.addColorStop(1, 'rgba(0,50,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px, py + 6, T, T - 6);

    ctx.fillStyle = '#66ffbb';
    ctx.fillRect(px, py + 6, T, 3);

    // Pulse dots
    const t = Date.now() * 0.003;
    for (let i = 0; i < 3; i++) {
      const glow = 0.4 + 0.3 * Math.sin(t + i * 2 + px * 0.01);
      ctx.fillStyle = `rgba(200,255,220,${glow})`;
      ctx.beginPath();
      ctx.arc(px + 8 + i * 16, py + 8, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawSpike(ctx, px, py) {
    const count = 3;
    const sw = T / count;
    for (let i = 0; i < count; i++) {
      const sg = ctx.createLinearGradient(px + i * sw, py + 4, px + i * sw + sw/2, py + T);
      sg.addColorStop(0, '#cc1144');
      sg.addColorStop(1, '#440011');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(px + i * sw + 2, py + T);
      ctx.lineTo(px + i * sw + sw / 2, py + 4);
      ctx.lineTo(px + i * sw + sw - 2, py + T);
      ctx.closePath();
      ctx.fill();

      // Edge highlight
      ctx.strokeStyle = '#ff4466';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  _drawExit(ctx, tx, ty) {
    const px = tx * T + T / 2;
    const py = ty * T;
    const t = Date.now() * 0.003;

    // Pole
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(px - 2, py - 60, 4, 60);

    // Flag
    ctx.fillStyle = `hsl(${50 + Math.sin(t) * 15},100%,55%)`;
    ctx.beginPath();
    ctx.moveTo(px + 2, py - 60);
    ctx.lineTo(px + 28, py - 48 + Math.sin(t * 2) * 4);
    ctx.lineTo(px + 2, py - 36);
    ctx.closePath();
    ctx.fill();

    // Glow
    ctx.globalAlpha = 0.3 + 0.15 * Math.sin(t);
    const glow = ctx.createRadialGradient(px, py - 40, 0, px, py - 40, 40);
    glow.addColorStop(0, '#ffcc00');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(px, py - 40, 40, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}


// ===================== LevelData.js =====================
// Level data — coordinates are in tile units unless noted
// Tile types: 1=solid, 2=one-way platform, 3=spike

// Helper: fill a row of tiles
function row(type, x0, x1, y) {
  const tiles = [];
  for (let x = x0; x <= x1; x++) tiles.push({ x, y, type });
  return tiles;
}

// ── LEVEL 1 — Crystal Caverns ─────────────────────────────────────────────
const LEVEL1 = {
  name: 'Crystal Caverns',
  bgTheme: 0,
  musicTheme: 0,
  tileW: 66,
  tileH: 14,

  tiles: [
    // Ground rows 12–13
    ...row(1,  0,  8, 12), ...row(1,  0,  8, 13),
    ...row(1, 11, 20, 12), ...row(1, 11, 20, 13),
    ...row(1, 22, 32, 12), ...row(1, 22, 32, 13),
    ...row(1, 35, 45, 12), ...row(1, 35, 45, 13),
    ...row(1, 47, 59, 12), ...row(1, 47, 59, 13),
    ...row(1, 61, 65, 12), ...row(1, 61, 65, 13),

    // Floating one-way platforms
    ...row(2,  4,  6,  9),
    ...row(2, 12, 14,  8),
    ...row(2, 17, 19,  9),
    ...row(2, 23, 25,  8),
    ...row(2, 28, 30,  6),
    ...row(2, 36, 38,  9),
    ...row(2, 41, 43,  7),
    ...row(2, 49, 51,  8),
    ...row(2, 55, 57,  7),
    ...row(2, 63, 65,  9),

    // Spikes in gaps
    { x:  9, y: 12, type: 3 },
    { x: 10, y: 12, type: 3 },
    { x: 21, y: 12, type: 3 },
    { x: 33, y: 12, type: 3 },
    { x: 34, y: 12, type: 3 },
    { x: 46, y: 12, type: 3 },
    { x: 60, y: 12, type: 3 },
  ],

  movingPlatforms: [
    { tx: 20, ty: 8, w: 3, speed: 60, range: 2.5, axis: 'y' },
    { tx: 33, ty: 7, w: 3, speed: 80, range: 2.0, axis: 'y' },
  ],

  enemies: [
    { type: 'crawler', tx:  5, ty: 11 },
    { type: 'crawler', tx: 15, ty: 11 },
    { type: 'bouncer', tx: 26, ty: 11 },
    { type: 'shooter', tx: 40, ty: 11 },
    { type: 'crawler', tx: 53, ty: 11 },
  ],

  crystals: [
    { tx:  2, ty: 11 }, { tx:  3, ty: 11 },
    { tx:  4, ty:  8 }, { tx:  5, ty:  8 }, { tx:  6, ty:  8 },
    { tx: 12, ty:  7 }, { tx: 14, ty:  7 },
    { tx: 23, ty: 11 }, { tx: 27, ty: 11 },
    { tx: 28, ty:  5 }, { tx: 29, ty:  5 }, { tx: 30, ty:  5 },
    { tx: 37, ty: 11 }, { tx: 39, ty: 11 },
    { tx: 41, ty:  6 }, { tx: 43, ty:  6 },
    { tx: 50, ty: 11 }, { tx: 52, ty: 11 },
    { tx: 55, ty:  6 }, { tx: 57, ty:  6 },
    { tx: 62, ty: 11 }, { tx: 63, ty: 11 }, { tx: 64, ty: 11 },
  ],

  powerUps: [
    { type: 'doubleJump', tx: 29, ty: 5 },
    { type: 'rapidFire',  tx: 50, ty: 7 },
  ],

  playerStart: { tx: 2, ty: 11 },
  exit: { tx: 63, ty: 11 },
};

// ── LEVEL 2 — Neon Wastes ─────────────────────────────────────────────────
const LEVEL2 = {
  name: 'Neon Wastes',
  bgTheme: 1,
  musicTheme: 1,
  tileW: 80,
  tileH: 14,

  tiles: [
    // Ground — more gaps
    ...row(1,  0,  6, 12), ...row(1,  0,  6, 13),
    ...row(1,  9, 16, 12), ...row(1,  9, 16, 13),
    ...row(1, 19, 26, 12), ...row(1, 19, 26, 13),
    ...row(1, 29, 36, 12), ...row(1, 29, 36, 13),
    ...row(1, 39, 47, 12), ...row(1, 39, 47, 13),
    ...row(1, 51, 59, 12), ...row(1, 51, 59, 13),
    ...row(1, 62, 72, 12), ...row(1, 62, 72, 13),
    ...row(1, 74, 79, 12), ...row(1, 74, 79, 13),

    // Elevated platforms
    ...row(2,  3,  5, 10),
    ...row(2,  9, 11,  9),
    ...row(2, 14, 16,  7),
    ...row(2, 19, 21, 10),
    ...row(2, 24, 26,  8),
    ...row(2, 30, 32,  7),
    ...row(2, 35, 37,  9),
    ...row(2, 40, 42,  8),
    ...row(2, 45, 47,  6),
    ...row(2, 53, 55,  9),
    ...row(2, 57, 59,  7),
    ...row(2, 63, 65,  8),
    ...row(2, 68, 70,  6),
    ...row(2, 73, 75,  9),
    ...row(2, 77, 79,  7),

    // Wall sections (semi-enclosed area)
    ...row(1,  27, 27, 10), ...row(1, 27, 27, 11), // right wall of gap
    ...row(1,  48, 48, 10), ...row(1, 48, 48, 11),

    // Spikes
    { x:  7, y: 12, type: 3 }, { x:  8, y: 12, type: 3 },
    { x: 17, y: 12, type: 3 }, { x: 18, y: 12, type: 3 },
    { x: 27, y: 12, type: 3 }, { x: 28, y: 12, type: 3 },
    { x: 37, y: 12, type: 3 }, { x: 38, y: 12, type: 3 },
    { x: 48, y: 12, type: 3 }, { x: 49, y: 12, type: 3 }, { x: 50, y: 12, type: 3 },
    { x: 60, y: 12, type: 3 }, { x: 61, y: 12, type: 3 },
    { x: 72, y: 12, type: 3 }, { x: 73, y: 12, type: 3 },
  ],

  movingPlatforms: [
    { tx: 17, ty: 9, w: 3, speed: 90,  range: 3.0, axis: 'y' },
    { tx: 28, ty: 8, w: 3, speed: 110, range: 3.0, axis: 'y' },
    { tx: 38, ty: 8, w: 3, speed: 80,  range: 2.0, axis: 'x' },
    { tx: 49, ty: 8, w: 3, speed: 100, range: 3.5, axis: 'y' },
    { tx: 61, ty: 7, w: 3, speed: 130, range: 2.5, axis: 'y' },
    { tx: 72, ty: 8, w: 3, speed: 90,  range: 2.0, axis: 'x' },
  ],

  enemies: [
    { type: 'crawler', tx:  4, ty: 11 },
    { type: 'bouncer', tx: 12, ty: 11 },
    { type: 'shooter', tx: 22, ty: 11 },
    { type: 'crawler', tx: 31, ty: 11 },
    { type: 'bouncer', tx: 42, ty: 11 },
    { type: 'shooter', tx: 54, ty: 11 },
    { type: 'crawler', tx: 64, ty: 11 },
    { type: 'bouncer', tx: 75, ty: 11 },
  ],

  crystals: [
    { tx:  3, ty: 11 }, { tx:  5, ty: 11 },
    { tx:  3, ty:  9 }, { tx:  5, ty:  9 },
    { tx: 10, ty:  8 }, { tx: 11, ty:  8 },
    { tx: 15, ty:  6 }, { tx: 16, ty:  6 },
    { tx: 20, ty:  9 }, { tx: 21, ty:  9 },
    { tx: 25, ty:  7 }, { tx: 26, ty:  7 },
    { tx: 30, ty:  6 }, { tx: 32, ty:  6 },
    { tx: 36, ty:  8 },
    { tx: 41, ty:  7 }, { tx: 42, ty:  7 },
    { tx: 45, ty:  5 }, { tx: 46, ty:  5 },
    { tx: 54, ty:  8 }, { tx: 55, ty:  8 },
    { tx: 58, ty:  6 }, { tx: 59, ty:  6 },
    { tx: 64, ty:  7 }, { tx: 65, ty:  7 },
    { tx: 69, ty:  5 }, { tx: 70, ty:  5 },
    { tx: 74, ty:  8 }, { tx: 78, ty:  8 },
  ],

  powerUps: [
    { type: 'shield',     tx: 14, ty: 6 },
    { type: 'doubleJump', tx: 45, ty: 5 },
    { type: 'rapidFire',  tx: 68, ty: 5 },
    { type: 'life',       tx: 77, ty: 6 },
  ],

  playerStart: { tx: 2, ty: 11 },
  exit: { tx: 77, ty: 11 },
};

// ── LEVEL 3 — Boss Chamber ────────────────────────────────────────────────
const LEVEL3 = {
  name: 'Boss Chamber',
  bgTheme: 2,
  musicTheme: 2,
  tileW: 32,
  tileH: 14,

  tiles: [
    // Ground
    ...row(1,  0, 31, 12),
    ...row(1,  0, 31, 13),
    // Side walls
    ...row(1,  0,  0,  0), ...row(1,  0,  0,  1), ...row(1,  0,  0,  2),
    ...row(1,  0,  0,  3), ...row(1,  0,  0,  4), ...row(1,  0,  0,  5),
    ...row(1,  0,  0,  6), ...row(1,  0,  0,  7), ...row(1,  0,  0,  8),
    ...row(1,  0,  0,  9), ...row(1,  0,  0, 10), ...row(1,  0,  0, 11),
    ...row(1, 31, 31,  0), ...row(1, 31, 31,  1), ...row(1, 31, 31,  2),
    ...row(1, 31, 31,  3), ...row(1, 31, 31,  4), ...row(1, 31, 31,  5),
    ...row(1, 31, 31,  6), ...row(1, 31, 31,  7), ...row(1, 31, 31,  8),
    ...row(1, 31, 31,  9), ...row(1, 31, 31, 10), ...row(1, 31, 31, 11),

    // Platforms for dodging
    ...row(2,  3,  6,  8),
    ...row(2, 12, 14,  6),
    ...row(2, 17, 19,  6),
    ...row(2, 25, 28,  8),
    ...row(2,  8, 10,  9),
    ...row(2, 21, 23,  9),
  ],

  movingPlatforms: [],

  enemies: [],
  boss: { tx: 18, ty: 11 },

  crystals: [
    { tx:  4, ty:  7 }, { tx:  5, ty:  7 },
    { tx: 12, ty:  5 }, { tx: 14, ty:  5 },
    { tx: 17, ty:  5 }, { tx: 19, ty:  5 },
    { tx: 26, ty:  7 }, { tx: 27, ty:  7 },
    { tx:  9, ty:  8 }, { tx: 22, ty:  8 },
  ],

  powerUps: [
    { type: 'shield',    tx: 13, ty: 5 },
    { type: 'rapidFire', tx: 18, ty: 5 },
    { type: 'life',      tx:  5, ty: 7 },
  ],

  playerStart: { tx: 3, ty: 11 },
  exit: null,
};

const ALL_LEVELS = [LEVEL1, LEVEL2, LEVEL3];


// ===================== UI.js =====================


class UI {
  constructor() {
    this._transAlpha = 0; // for level transition fade
    this._transDir   = 0; // +1 fade in, -1 fade out
  }

  render(ctx, game) {
    switch (game.state) {
      case 'start':    this._drawStart(ctx, game); break;
      case 'playing':  this._drawHUD(ctx, game); break;
      case 'paused':   this._drawHUD(ctx, game); this._drawPause(ctx); break;
      case 'gameover': this._drawHUD(ctx, game); this._drawGameOver(ctx, game); break;
      case 'win':      this._drawHUD(ctx, game); this._drawWin(ctx, game); break;
      case 'transition': this._drawTransition(ctx, game); break;
      case 'bossIntro': this._drawBossIntro(ctx, game); break;
    }
  }

  update(dt, game) {
    if (game.state === 'transition') {
      this._transAlpha += dt * (this._transDir > 0 ? 2.5 : -2.5);
      this._transAlpha = Math.max(0, Math.min(1, this._transAlpha));
    }
  }

  startFadeIn()  { this._transDir = 1; this._transAlpha = 0; }
  startFadeOut() { this._transDir = -1; this._transAlpha = 1; }

  // ── HUD ────────────────────────────────────────────────────────
  _drawHUD(ctx, game) {
    // Background strip
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, 44);

    // Lives
    for (let i = 0; i < 5; i++) {
      const filled = i < game.lives;
      const hx = 14 + i * 28;
      ctx.fillStyle = filled ? '#ff2244' : 'rgba(255,34,68,0.2)';
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('♥', hx, 22);
    }

    // Score
    ctx.fillStyle = '#00ffcc';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${game.score.toString().padStart(7, '0')}`, W / 2, 22);

    // Level name
    ctx.fillStyle = 'rgba(180,200,255,0.7)';
    ctx.font = '12px monospace';
    ctx.fillText(game.level?.data.name || '', W / 2, 38);

    // Active power-up
    const p = game.player;
    if (p && p.activePowerUp && p.powerUpTimer > 0) {
      ctx.textAlign = 'right';
      const icons = { doubleJump:'✦ DOUBLE', rapidFire:'⚡ RAPID', shield:'◈ SHIELD' };
      const label = icons[p.activePowerUp] || p.activePowerUp;
      const frac  = p.powerUpTimer / 20;
      ctx.fillStyle = '#ffcc00';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(label, W - 14, 16);
      // Timer bar
      ctx.fillStyle = 'rgba(255,200,0,0.25)';
      ctx.fillRect(W - 120, 24, 106, 6);
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(W - 120, 24, 106 * Math.min(frac, 1), 6);
    }

    // Combo multiplier
    if (game.combo > 1 && game._comboTimer > 0) {
      const a = Math.min(game._comboTimer / 0.6, 1);
      const pop = 1 + Math.max(0, (game._comboTimer - 2.3) * 2); // brief pop on gain
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(W / 2, 72);
      ctx.scale(pop, pop);
      ctx.fillStyle = `hsl(${Math.min(40 + game.combo * 10, 140)},100%,60%)`;
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 6;
      ctx.fillText(`COMBO  x${game.combo}`, 0, 0);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Controls hint (first 5 seconds)
    if (game._hintTimer > 0) {
      ctx.globalAlpha = Math.min(game._hintTimer, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, H - 36, W, 36);
      ctx.fillStyle = '#aaccff';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('← → / A D = Move   SPACE / W = Jump   Z / J = Shoot   P = Pause', W/2, H - 18);
      ctx.globalAlpha = 1;
    }
  }

  // ── Start screen ───────────────────────────────────────────────
  _drawStart(ctx, game) {
    const t = Date.now() * 0.001;

    // Title glow
    ctx.globalAlpha = 0.15 + 0.05 * Math.sin(t * 2);
    const g = ctx.createRadialGradient(W/2, H/2, 20, W/2, H/2, 300);
    g.addColorStop(0, '#00aaff');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    // Title
    ctx.save();
    ctx.translate(W/2, H/2 - 80 + Math.sin(t * 1.5) * 6);
    const tg = ctx.createLinearGradient(-200, -40, 200, 40);
    tg.addColorStop(0, '#00ffcc');
    tg.addColorStop(0.5, '#00aaff');
    tg.addColorStop(1, '#aa44ff');
    ctx.fillStyle = tg;
    ctx.font = 'bold 72px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00aaff';
    ctx.shadowBlur = 30;
    ctx.fillText('NEBULA DASH', 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();

    // Subtitle
    ctx.fillStyle = 'rgba(180,220,255,0.8)';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A COSMIC ADVENTURE', W/2, H/2 - 20);

    // Press to start (blink)
    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = '#00ffcc';
      ctx.font = 'bold 20px monospace';
      ctx.fillText('▶  PRESS SPACE TO START  ◀', W/2, H/2 + 40);
    }

    // Controls
    ctx.fillStyle = 'rgba(150,180,220,0.7)';
    ctx.font = '13px monospace';
    ctx.fillText('← → Move   SPACE Jump   Z Shoot   P Pause', W/2, H/2 + 90);

    // Small character preview
    this._drawNovaPrev(ctx, W/2 - 200, H/2 + 20, t);

    // Version
    ctx.fillStyle = 'rgba(100,130,180,0.5)';
    ctx.font = '11px monospace';
    ctx.fillText('3 LEVELS  •  BOSS FIGHT  •  POWER-UPS', W/2, H - 20);
  }

  _drawNovaPrev(ctx, x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(0.7, 0.7);
    // Simple silhouette
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 36);
    glow.addColorStop(0, 'rgba(0,220,255,0.3)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, 36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#00ccee';
    ctx.beginPath(); ctx.roundRect(-18, -22, 36, 44, 8); ctx.fill();
    ctx.fillStyle = '#00aabb';
    ctx.beginPath(); ctx.arc(0, -26, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(5, -28, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ── Pause screen ───────────────────────────────────────────────
  _drawPause(ctx) {
    ctx.fillStyle = 'rgba(0,5,20,0.7)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#00ffcc';
    ctx.font = 'bold 52px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 20;
    ctx.fillText('PAUSED', W/2, H/2 - 20);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(180,220,255,0.7)';
    ctx.font = '18px monospace';
    ctx.fillText('Press P or ESC to resume', W/2, H/2 + 40);
  }

  // ── Game over ──────────────────────────────────────────────────
  _drawGameOver(ctx, game) {
    const t = Date.now() * 0.001;
    ctx.fillStyle = 'rgba(20,0,5,0.8)';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W/2, H/2 - 40 + Math.sin(t) * 4);
    const g = ctx.createLinearGradient(-200, -30, 200, 30);
    g.addColorStop(0, '#ff2244');
    g.addColorStop(1, '#ff6600');
    ctx.fillStyle = g;
    ctx.font = 'bold 64px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff2244';
    ctx.shadowBlur = 25;
    ctx.fillText('GAME OVER', 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();

    ctx.fillStyle = '#00ffcc';
    ctx.font = '22px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Score: ${game.score}`, W/2, H/2 + 30);

    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = 'rgba(200,220,255,0.9)';
      ctx.font = '18px monospace';
      ctx.fillText('Press SPACE to retry', W/2, H/2 + 75);
    }
  }

  // ── Win / Victory ──────────────────────────────────────────────
  _drawWin(ctx, game) {
    const t = Date.now() * 0.001;
    ctx.fillStyle = 'rgba(0,5,10,0.75)';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W/2, H/2 - 60 + Math.sin(t * 1.2) * 5);
    const g = ctx.createLinearGradient(-250, -40, 250, 40);
    g.addColorStop(0, '#00ffcc');
    g.addColorStop(0.5, '#44aaff');
    g.addColorStop(1, '#aa44ff');
    ctx.fillStyle = g;
    ctx.font = 'bold 56px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 30;
    ctx.fillText('VICTORY!', 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();

    ctx.fillStyle = '#ffcc00';
    ctx.font = '20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('The galaxy is saved!', W/2, H/2 - 4);

    ctx.fillStyle = '#00ffcc';
    ctx.font = '24px monospace';
    ctx.fillText(`Final Score: ${game.score}`, W/2, H/2 + 34);

    // Stars cascade
    for (let i = 0; i < 5; i++) {
      const sx = W/2 - 80 + i * 40;
      ctx.fillStyle = '#ffdd00';
      ctx.font = '28px sans-serif';
      ctx.fillText('★', sx, H/2 + 75);
    }

    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = 'rgba(200,220,255,0.9)';
      ctx.font = '16px monospace';
      ctx.fillText('Press SPACE to return to menu', W/2, H/2 + 120);
    }
  }

  // ── Level transition ───────────────────────────────────────────
  _drawTransition(ctx, game) {
    this._drawHUD(ctx, game);
    ctx.fillStyle = `rgba(0,5,20,${this._transAlpha})`;
    ctx.fillRect(0, 0, W, H);

    if (this._transAlpha > 0.5) {
      const next = game._nextLevelName || '';
      ctx.fillStyle = `rgba(0,255,200,${(this._transAlpha - 0.5) * 2})`;
      ctx.font = 'bold 36px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Level ${game.currentLevelIndex + 1}: ${next}`, W/2, H/2);
    }
  }

  // ── Boss intro ────────────────────────────────────────────────
  _drawBossIntro(ctx, game) {
    this._drawHUD(ctx, game);
    const t = Date.now() * 0.001;
    ctx.fillStyle = `rgba(20,0,0,${0.5 + 0.2 * Math.sin(t * 8)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ff2200';
    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff4400';
    ctx.shadowBlur = 20;
    ctx.fillText('⚠  BOSS APPROACHING  ⚠', W/2, H/2);
    ctx.shadowBlur = 0;
  }
}


// ===================== Game.js =====================











class Game {
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.input   = new Input();
    this.audio   = new Audio();
    this.camera  = new Camera();
    this.particles = new ParticleSystem();
    this.bg      = new Background();
    this.ui      = new UI();

    this.state   = 'start';
    this.lives   = PLAYER_LIVES;
    this.score   = 0;
    this.currentLevelIndex = 0;

    this.level        = null;
    this.player       = null;
    this.enemies      = [];
    this.projectiles  = [];
    this.collectibles = [];
    this.boss         = null;

    this._spawnX   = 0;
    this._spawnY   = 0;
    this._time     = 0;
    this._hintTimer = 0;

    this._transTimer  = 0;
    this._nextLevelName = '';
    this._audioInit   = false;

    this._bossIntroTimer = 0;
    this._wonLevel = false;

    // ── Juice state ──────────────────────────────────────────────
    this._hitStop   = 0;        // freeze-frame timer (seconds)
    this._flashAlpha = 0;       // full-screen flash alpha
    this._flashColor = '#ffffff';
    this.combo       = 0;       // kill combo multiplier
    this._comboTimer = 0;       // time left before combo resets
    this.floaters    = [];      // floating score popups
    this._ambientTimer = 0;     // ambient particle spawn timer
  }

  // ── Juice helpers ──────────────────────────────────────────────
  hitStop(t)        { this._hitStop = Math.max(this._hitStop, t); }
  flash(color, a)   { this._flashColor = color; this._flashAlpha = Math.max(this._flashAlpha, a); }
  addFloater(x, y, text, color) {
    this.floaters.push({ x, y, text, color, life: 0.9, max: 0.9 });
    if (this.floaters.length > 40) this.floaters.shift();
  }

  // Register a kill: applies combo multiplier, score, popup, juice
  addKill(base, x, y, color) {
    this.combo = Math.min(this.combo + 1, 99);
    this._comboTimer = 2.5;
    const pts = base * this.combo;
    this.score += pts;
    this.addFloater(x, y, (this.combo > 1 ? `x${this.combo} ` : '') + `+${pts}`, color);
    this.hitStop(0.06);
    this.flash(color, 0.22);
  }

  _ensureAudio() {
    if (!this._audioInit) {
      this.audio.init();
      this._audioInit = true;
    }
    this.audio.resume();
  }

  start() {
    this.lives = PLAYER_LIVES;
    this.score = 0;
    this.currentLevelIndex = 0;
    this.audio.stopMusic();
    this._loadLevel(0);   // sets state to 'playing' (or 'bossIntro' for boss levels)
    this.state = 'playing';
    this._hintTimer = 8;
  }

  _loadLevel(index) {
    const data = ALL_LEVELS[index];
    this.level  = new Level(data);
    const { enemies, collectibles, boss } = Level.buildEntities(data);
    this.enemies      = enemies;
    this.collectibles = collectibles;
    this.boss         = boss;
    this.projectiles  = [];

    const sp = data.playerStart;
    this._spawnX = sp.tx * T;
    this._spawnY = (sp.ty + 1) * T - 44;
    this.player  = new Player(sp.tx, sp.ty);

    this.camera.x  = 0;
    this.camera.y  = 0;
    this.camera._tx = 0;
    this.camera._ty = 0;

    this.particles = new ParticleSystem();
    this._wonLevel = false;
    this.floaters  = [];
    this.combo     = 0;
    this._comboTimer = 0;
    this._hitStop  = 0;
    this._flashAlpha = 0;

    // If boss level, show intro sequence then start music
    if (boss) {
      this._bossIntroTimer = 0;
      this.state = 'bossIntro';
      setTimeout(() => {
        if (this.state === 'bossIntro') {
          this.state = 'playing';
          this.audio.startMusic(data.musicTheme);
        }
      }, 3000);
    } else {
      this.audio.startMusic(data.musicTheme);
    }
  }

  update(dt) {
    const inp = this.input;
    this._time += dt;

    // Flash always decays so it fades even on game-over/win
    if (this._flashAlpha > 0) this._flashAlpha = Math.max(0, this._flashAlpha - dt * 5);

    this.ui.update(dt, this);

    switch (this.state) {
      case 'start':
        if (inp.confirm()) {
          this._ensureAudio();
          this.start();
        }
        break;

      case 'bossIntro':
        // Music started in _loadLevel; just wait for intro timer
        break;

      case 'playing':
        if (inp.pause()) { this.state = 'paused'; break; }
        this._hintTimer = Math.max(0, this._hintTimer - dt);
        this._updatePlaying(dt);
        break;

      case 'paused':
        if (inp.pause() || inp.confirm()) this.state = 'playing';
        break;

      case 'gameover':
        if (inp.confirm()) {
          this._ensureAudio();
          this.start();
        }
        break;

      case 'win':
        if (inp.confirm()) {
          this.audio.stopMusic();
          this.state = 'start';
        }
        break;

      case 'transition':
        this._transTimer -= dt;
        if (this._transTimer <= 0) {
          this.state = 'playing';
          this.audio.startMusic(ALL_LEVELS[this.currentLevelIndex].musicTheme);
        }
        break;
    }

    inp.clearFrame();
  }

  _updatePlaying(dt) {
    const level = this.level;

    // Hit-stop: freeze the world briefly for punchy impacts.
    // Camera keeps updating so screen-shake still animates.
    if (this._hitStop > 0) {
      this._hitStop -= dt;
      this.camera.update(dt);
      return;
    }

    // Combo decay
    if (this._comboTimer > 0) {
      this._comboTimer -= dt;
      if (this._comboTimer <= 0) this.combo = 0;
    }

    // Floating score popups
    for (const f of this.floaters) { f.y -= 45 * dt; f.life -= dt; }
    this.floaters = this.floaters.filter(f => f.life > 0);

    // Ambient drifting motes within the camera view
    this._ambientTimer -= dt;
    if (this._ambientTimer <= 0) {
      this._ambientTimer = 0.12;
      this.particles.ambientMote(
        this.camera.x + Math.random() * W,
        this.camera.y + Math.random() * H
      );
    }

    // Update level (moving platforms)
    level.update(dt);

    // Player
    this.player.update(dt, this);

    if (this.player.dead) {
      this._onPlayerDead();
      return;
    }

    // Spike check
    if (level.spikeAt(this.player.x, this.player.y, this.player.w, this.player.h)) {
      this.player.hurt(this);
    }

    // Enemies
    for (const e of this.enemies) {
      if (!e.dead) e.update(dt, this);
    }
    this.enemies = this.enemies.filter(e => !e.dead);

    // Boss
    if (this.boss && !this.boss.dead) {
      this.boss.update(dt, this);
    }

    // Projectiles
    for (const p of this.projectiles) p.update(dt, this);
    this.projectiles = this.projectiles.filter(p => !p.dead);

    // Collectibles
    for (const c of this.collectibles) {
      if (!c.dead) c.update(dt, this);
    }
    this.collectibles = this.collectibles.filter(c => !c.dead);

    // Particles
    this.particles.update(dt);

    // Camera
    this.camera.follow(this.player, level.worldW, level.worldH);
    this.camera.update(dt);

    // Exit check (non-boss levels) — generous hitbox on the flag pole
    if (!this._wonLevel && level.data.exit) {
      const ex = level.exitX;
      const ey = level.exitY;
      const p = this.player;
      if (Math.abs(p.x + p.w / 2 - ex) < T * 1.5 && p.grounded) {
        this._wonLevel = true;
        this._levelComplete();
      }
    }
  }

  _onPlayerDead() {
    if (this.lives <= 0) {
      this.audio.stopMusic();
      this.audio.gameOver();
      this.state = 'gameover';
    } else {
      // Respawn at checkpoint without reloading level
      this.player = new Player(0, 0);
      this.player.x = this._spawnX;
      this.player.y = this._spawnY;
      if (!this.audio._musicPlaying) {
        this.audio.startMusic(ALL_LEVELS[this.currentLevelIndex].musicTheme);
      }
    }
  }

  _levelComplete() {
    this.audio.levelComplete();
    this.audio.stopMusic();
    this.score += 500;

    const nextIndex = this.currentLevelIndex + 1;
    if (nextIndex >= ALL_LEVELS.length) {
      // All levels done
      setTimeout(() => { this.state = 'win'; this.audio.levelComplete(); }, 1000);
      return;
    }

    // Transition to next level
    this.state = 'transition';
    this.ui.startFadeIn();
    this._nextLevelName = ALL_LEVELS[nextIndex].name;
    this._transTimer = 2.0;

    setTimeout(() => {
      this.currentLevelIndex = nextIndex;
      this._loadLevel(nextIndex);
      this.ui.startFadeOut();
      if (this.state !== 'bossIntro') this.state = 'transition';
      this._transTimer = 1.5;
    }, 1000);
  }

  triggerWin() {
    this._wonLevel = true;
    setTimeout(() => {
      this.state = 'win';
      this.audio.stopMusic();
      this.audio.levelComplete();
    }, 600);
  }

  render() {
    const ctx  = this.ctx;
    const cam  = this.camera;

    ctx.clearRect(0, 0, W, H);

    // Background (no camera transform)
    const bgTheme = this.level ? this.level.data.bgTheme : 0;
    this.bg.render(ctx, cam, this.level ? this.level.worldW : W, bgTheme, this._time);

    if (this.state === 'start' || this.state === 'gameover' || this.state === 'win') {
      this.ui.render(ctx, this);
      return;
    }

    // World-space rendering
    ctx.save();
    cam.apply(ctx);

    // Level tiles
    this.level.render(ctx, cam);

    // Collectibles
    for (const c of this.collectibles) if (!c.dead) c.render(ctx);

    // Particles (behind entities)
    this.particles.renderBehind(ctx);

    // Enemies
    for (const e of this.enemies) if (!e.dead) e.render(ctx);

    // Boss
    if (this.boss && !this.boss.dead) this.boss.render(ctx);

    // Projectiles
    for (const p of this.projectiles) if (!p.dead) p.render(ctx);

    // Player
    if (this.player) this.player.render(ctx);

    // Particles (front)
    this.particles.renderFront(ctx);

    // Floating score popups (world space, above everything)
    for (const f of this.floaters) {
      const a = Math.min(f.life / f.max, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      ctx.fillText(f.text, f.x, f.y);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // ── Post-processing (screen space) ───────────────────────────
    // Vignette for depth
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,12,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // Impact flash
    if (this._flashAlpha > 0) {
      ctx.globalAlpha = this._flashAlpha;
      ctx.fillStyle = this._flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // UI overlay (screen space)
    this.ui.render(ctx, this);
  }
}


// ===================== main.js =====================



// ── Canvas setup & scaling ────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
canvas.width  = W;
canvas.height = H;

function resize() {
  const scaleX = window.innerWidth  / W;
  const scaleY = window.innerHeight / H;
  const scale  = Math.min(scaleX, scaleY);
  canvas.style.width  = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
}
resize();
window.addEventListener('resize', resize);

// ── Game loop ─────────────────────────────────────────────────────────────
const game = new Game(canvas);
// Expose for debugging / automated smoke tests
if (typeof window !== 'undefined') window.NebulaGame = game;

let lastTime = 0;
const MAX_DT  = 1 / 30; // cap delta at ~30fps to prevent spiral of death

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, MAX_DT);
  lastTime = timestamp;

  game.update(dt);
  game.render();

  requestAnimationFrame(loop);
}

requestAnimationFrame(ts => {
  lastTime = ts;
  requestAnimationFrame(loop);
});


})();