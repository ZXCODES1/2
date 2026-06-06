import { W, H, T, PLAYER_LIVES } from './constants.js';
import { loadCheckpoint, clearCheckpoint } from './Checkpoint.js';
import { Input }    from './Input.js';
import { Audio }    from './Audio.js';
import { Camera }   from './Camera.js';
import { ParticleSystem } from './Particles.js';
import { Background } from './Background.js';
import { Player }   from './Player.js';
import { Level }    from './Level.js';
import { UI }       from './UI.js';
import { ALL_LEVELS } from './LevelData.js';

export class Game {
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
    this.checkpoints  = [];

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
    this._hitStop    = 0;
    this._flashAlpha = 0;
    this._flashColor = '#ffffff';
    this.combo       = 0;
    this._comboTimer = 0;
    this.floaters    = [];
    this._ambientTimer = 0;
    this._slowMo     = 1.0;    // slow-motion multiplier (1 = normal)
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
    // Check for saved checkpoint
    const cp = loadCheckpoint();
    if (cp && cp.levelIndex < ALL_LEVELS.length) {
      this.lives = cp.lives || PLAYER_LIVES;
      this.score = cp.score || 0;
      this.currentLevelIndex = cp.levelIndex;
      this.audio.stopMusic();
      this._loadLevel(cp.levelIndex);
      this.state = 'playing';
    } else {
      this.lives = PLAYER_LIVES;
      this.score = 0;
      this.currentLevelIndex = 0;
      this.audio.stopMusic();
      this._loadLevel(0);
      this.state = 'playing';
    }
    this._hintTimer = 8;
    this._slowMo = 1.0;
  }

  _loadLevel(index) {
    const data = ALL_LEVELS[index];
    this.level  = new Level(data);
    const { enemies, collectibles, boss, checkpoints } = Level.buildEntities(data);
    this.enemies      = enemies;
    this.collectibles = collectibles;
    this.boss         = boss;
    this.checkpoints  = checkpoints;
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

    // Slow-motion: recover back toward 1.0 over ~2s
    if (this._slowMo < 1.0) {
      this._slowMo = Math.min(1.0, this._slowMo + dt * 0.5);
    }
    dt *= this._slowMo;

    // Hit-stop: freeze the world briefly for punchy impacts.
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

    // Checkpoints
    for (const cp of this.checkpoints) cp.update(dt, this);

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
    clearCheckpoint(); // game beaten — wipe the save
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

    // Checkpoints (behind everything)
    for (const cp of this.checkpoints) cp.render(ctx);

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
