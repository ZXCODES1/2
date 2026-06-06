import { T, SC_BOSS_HIT } from './constants.js';
import { rectOverlap, rnd, rndInt } from './utils.js';
import { EnemyBullet, Shockwave } from './Projectile.js';

const BOSS_W = 96;
const BOSS_H = 84;
const MAX_HP = 20;

// Minion spawned by boss in phase 4
class BossMinion {
  constructor(x, y) {
    this.x = x - 14;
    this.y = y - 36;
    this.w = 28;
    this.h = 36;
    this.vx = 0;
    this.vy = 0;
    this.hp = 2;
    this.dead = false;
    this.invincible = 0;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this._time = Math.random() * Math.PI * 2;
    this._stomped = false;
  }

  takeDamage(dmg, game) {
    if (this.invincible > 0) return;
    this.hp -= dmg;
    this.invincible = 0.12;
    game.audio.enemyHit();
    if (this.hp <= 0) {
      this.dead = true;
      game.addKill(120, this.x + this.w/2, this.y, '#ff44aa');
      game.audio.enemyDie();
      game.particles.explosion(this.x + this.w/2, this.y + this.h/2, '#ff44aa', 14);
    }
  }

  update(dt, game) {
    this._time += dt;
    this.invincible = Math.max(0, this.invincible - dt);

    const p = game.player;
    const dx = (p.x + p.w/2) - (this.x + this.w/2);
    this.dir = dx > 0 ? 1 : -1;
    this.vx = 160 * this.dir;

    this.vy = Math.min(this.vy + 2400 * dt, 900);
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const ty = Math.floor((this.y + this.h) / T);
    const tx = Math.floor((this.x + this.w/2) / T);
    const tile = game.level.getTile(tx, ty);
    if (tile === 1 || tile === 2) {
      this.y  = ty * T - this.h;
      this.vy = 0;
    }

    // Clamp to world
    this.x = Math.max(0, Math.min(this.x, game.level.worldW - this.w));

    if (!p.invincible && !p._dying) {
      const hit = p.x < this.x + this.w && p.x + p.w > this.x &&
                  p.y < this.y + this.h && p.y + p.h > this.y;
      if (hit) {
        if (p.vy > 50 && p.y + p.h < this.y + 24) {
          this._stomped = true;
          this.takeDamage(1, game);
          p.stompBounce();
        } else {
          p.hurt(game);
        }
      }
    }

    if (this.y > game.level.worldH + 200) this.dead = true;
  }

  render(ctx) {
    const cx = this.x + this.w/2;
    const cy = this.y + this.h/2;
    const pulse = 0.7 + 0.3 * Math.sin(this._time * 8);

    ctx.save();
    ctx.translate(cx, cy);
    if (this.dir < 0) ctx.scale(-1, 1);

    // Glow
    ctx.globalAlpha = 0.3 * pulse;
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
    g.addColorStop(0, '#ff44aa');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // Body
    ctx.fillStyle = '#55001a';
    ctx.beginPath(); ctx.roundRect(-12, -16, 24, 32, 4); ctx.fill();
    // Head
    ctx.fillStyle = '#880033';
    ctx.beginPath(); ctx.roundRect(-10, -22, 20, 16, 4); ctx.fill();
    // Eye
    ctx.fillStyle = `rgba(255,80,0,${pulse})`;
    ctx.beginPath(); ctx.arc(2, -15, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffff00';
    ctx.beginPath(); ctx.arc(3, -16, 2, 0, Math.PI * 2); ctx.fill();
    // Legs
    ctx.fillStyle = '#440022';
    ctx.fillRect(-8, 14, 7, 12);
    ctx.fillRect(2, 14, 7, 12);

    ctx.restore();
  }
}

export class Boss {
  constructor(tx, ty) {
    this.x    = tx * T - BOSS_W/2;
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
    this.phase      = 1; // 1-4

    // Attack timers
    this._stompTimer    = 3.0;
    this._shotTimer     = 4.0;
    this._jumpTimer     = 6.0;
    this._hellTimer     = 5.0; // bullet hell (phase 2+)
    this._laserTimer    = 8.0; // laser charge+fire (phase 3+)
    this._teleportTimer = 6.0; // teleport (phase 4)
    this._minionTimer   = 8.0; // minion spawn (phase 4)
    this._stunTimer     = 0;

    // Laser state machine
    this._laserState = null; // null | 'charge' | 'fire'
    this._laserCD    = 0;    // countdown within state
    this._laserY     = 0;
    this._laserX0    = 0;
    this._laserX1    = 3000;

    // Animation
    this._time      = 0;
    this._walkAnim  = 0;
    this._hitFlash  = 0;
    this._enrageFlash = 0;

    // Intro sequence
    this._intro      = true;
    this._introTimer = 2.5;
    this._roarTimer  = 2.0;

    this._pendingSlam = false;
    this._bulletHellRot = 0;
  }

  takeDamage(dmg, game) {
    if (this.invincible > 0 || this._intro) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.invincible = 0.1;
    this._hitFlash  = 0.12;
    game.score += SC_BOSS_HIT;
    game.audio.bossHit();
    game.camera.shake(8);
    game.hitStop(0.04);
    game.flash('#ff6622', 0.15);
    game.particles.explosion(this.x + this.w/2, this.y + this.h/2, '#ff4400', 10);

    // Phase transition
    const newPhase = this.hp <= 3 ? 4 : this.hp <= 8 ? 3 : this.hp <= 14 ? 2 : 1;
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      game.camera.shake(22);
      game.hitStop(0.18);
      game.flash(newPhase === 4 ? '#ff0000' : '#ffaa33', 0.55);
      game.audio.explosion();
      game.particles.explosion(this.x + this.w/2, this.y + this.h/2, '#ff8800', 35);
      game.addFloater(this.x + this.w/2, this.y - 30,
        newPhase === 4 ? '☠ ENRAGE!' : `PHASE ${newPhase}`, '#ff4400');
      // Reset attack timers tighter per phase
      this._stompTimer = 0.5;
      this._shotTimer  = 0.5;
    }

    if (this.hp <= 0) this._die(game);
  }

  _die(game) {
    this.dead = true;
    game._slowMo = 0.2; // dramatic slow-motion
    game.audio.explosion();
    game.camera.shake(28);
    game.hitStop(0.35);
    game.flash('#ffffff', 0.9);
    for (let i = 0; i < 8; i++) {
      setTimeout(() => {
        if (!game.particles) return;
        game.particles.explosion(
          this.x + rnd(0, this.w),
          this.y + rnd(0, this.h),
          ['#ff4400','#ff8800','#ffcc00','#ffffff'][rndInt(0,3)], 28
        );
        game.camera.shake(12);
      }, i * 180);
    }
    setTimeout(() => { game.triggerWin(); }, 2200);
  }

  update(dt, game) {
    this._time += dt;
    this.invincible = Math.max(0, this.invincible - dt);
    this._hitFlash  = Math.max(0, this._hitFlash  - dt);

    if (this.dead) return;

    // Intro sequence: boss drops in dramatically
    if (this._intro) {
      this._introTimer -= dt;
      this._roarTimer  -= dt;
      if (this._roarTimer > 0) {
        game.camera.shake(4 * (this._roarTimer / 2));
        if (Math.random() < 0.3) game.particles.bossSmoke(this.x + this.w/2, this.y);
      }
      if (this._introTimer <= 0) this._intro = false;
      this._applyGravity(dt);
      this._moveY(game.level, dt);
      return;
    }

    if (this._stunTimer > 0) { this._stunTimer -= dt; return; }

    // Tick all laser state
    this._updateLaser(dt, game);

    // Phase-based speed
    const speed = [0, 90, 130, 160, 200][this.phase] ?? 200;

    // Walk toward player (or teleport in phase 4 — walk is slower between ports)
    const p = game.player;
    const dx = (p.x + p.w/2) - (this.x + this.w/2);
    this.dir = dx > 0 ? 1 : -1;
    this.vx  = speed * this.dir;

    this._walkAnim += dt * (6 + this.phase);

    // Attack timer countdowns (faster in higher phases)
    const pace = this.phase === 4 ? 0.55 : this.phase === 3 ? 0.72 : 1.0;
    this._stompTimer  -= dt;
    this._shotTimer   -= dt;
    this._hellTimer   -= dt;
    this._laserTimer  -= dt;
    this._jumpTimer   -= dt;
    if (this.phase === 4) {
      this._teleportTimer -= dt;
      this._minionTimer   -= dt;
    }

    // Stomp attack (all phases)
    if (this._stompTimer <= 0 && this.grounded) {
      this._doStomp(game);
      this._stompTimer = (2.8 - (this.phase - 1) * 0.45) * pace;
    }

    // Targeted shoot (all phases, escalating spread)
    if (this._shotTimer <= 0) {
      this._doShoot(game);
      this._shotTimer = (2.5 - (this.phase - 1) * 0.35) * pace;
    }

    // Bullet hell ring (phase 2+)
    if (this.phase >= 2 && this._hellTimer <= 0 && this._laserState === null) {
      this._doBulletHell(game);
      this._hellTimer = (4.0 - (this.phase - 2) * 0.6) * pace;
    }

    // Laser (phase 3+)
    if (this.phase >= 3 && this._laserTimer <= 0 && this._laserState === null) {
      this._startLaser(game);
      this._laserTimer = (7.0 - (this.phase - 3) * 1.5) * pace;
    }

    // Jump slam (phase 2+)
    if (this.phase >= 2 && this._jumpTimer <= 0 && this.grounded) {
      this._doJumpSlam(game);
      this._jumpTimer = (4.0 - (this.phase - 2) * 0.5) * pace;
    }

    // Teleport (phase 4)
    if (this.phase === 4 && this._teleportTimer <= 0) {
      this._doTeleport(game);
      this._teleportTimer = 4.5;
    }

    // Minion spawn (phase 4)
    if (this.phase === 4 && this._minionTimer <= 0) {
      this._spawnMinions(game);
      this._minionTimer = 7.0;
    }

    // Physics
    const wasGrounded = this.grounded;
    this._applyGravity(dt);
    this._moveX(game.level, dt);
    this._moveY(game.level, dt);

    if (!wasGrounded && this.grounded && this._pendingSlam) {
      this._pendingSlam = false;
      this._doStomp(game);
    }

    // Phase 3+ smoke trail
    if (this.phase >= 3 && Math.random() < 0.3) {
      game.particles.bossSmoke(this.x + this.w/2, this.y + this.h);
    }

    // Enrage pulse
    if (this.phase === 4) this._enrageFlash = (this._enrageFlash + dt * 6) % (Math.PI * 2);

    // Player contact
    if (!p.invincible && !p._dying &&
        rectOverlap(this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h)) {
      p.hurt(game);
    }

    // Laser damage check
    if (this._laserState === 'fire') {
      const laserTop = this._laserY - 14;
      const laserBot = this._laserY + 14;
      if (!p.invincible && p.y < laserBot && p.y + p.h > laserTop) {
        p.hurt(game);
      }
    }
  }

  // ── Attack methods ─────────────────────────────────────────────
  _doStomp(game) {
    game.camera.shake(16);
    game.audio.explosion();
    game.flash('#ff8800', 0.12);
    const sy = this.y + this.h - 20;
    const spd = 240 + this.phase * 30;
    game.projectiles.push(new Shockwave(this.x + this.w/2, sy,  1, spd));
    game.projectiles.push(new Shockwave(this.x + this.w/2, sy, -1, spd));
    if (this.phase >= 3) {
      // Extra angled shockwaves
      game.projectiles.push(new Shockwave(this.x + this.w/2, sy,  1, spd * 0.6));
      game.projectiles.push(new Shockwave(this.x + this.w/2, sy, -1, spd * 0.6));
    }
    game.particles.landDust(this.x + this.w/2, this.y + this.h);
    this._stunTimer = 0.4;
  }

  _doShoot(game) {
    const ox  = this.x + (this.dir > 0 ? this.w + 4 : -14);
    const oy  = this.y + 24;
    const p   = game.player;
    // Phase 1: 1 shot. Phase 2: 3-way. Phase 3: 5-way. Phase 4: 7-way ring toward player.
    const count = this.phase === 4 ? 7 : this.phase === 3 ? 5 : this.phase === 2 ? 3 : 1;
    const baseAng = Math.atan2(p.y + p.h/2 - oy, p.x + p.w/2 - ox);
    const totalSpread = this.phase >= 3 ? 1.1 : 0.5;
    const spd = 240 + (this.phase - 1) * 38;
    for (let i = 0; i < count; i++) {
      const ang = count === 1 ? baseAng : baseAng + (i/(count-1) - 0.5) * totalSpread;
      game.projectiles.push(new EnemyBullet(ox, oy, Math.cos(ang)*spd, Math.sin(ang)*spd));
    }
    game.audio.shoot();
  }

  _doBulletHell(game) {
    const cx  = this.x + this.w/2;
    const cy  = this.y + this.h/2;
    const cnt = this.phase >= 4 ? 18 : this.phase === 3 ? 14 : 10;
    const spd = 200 + (this.phase - 2) * 45;
    for (let i = 0; i < cnt; i++) {
      const ang = (i / cnt) * Math.PI * 2 + this._bulletHellRot;
      game.projectiles.push(new EnemyBullet(cx, cy, Math.cos(ang)*spd, Math.sin(ang)*spd));
    }
    this._bulletHellRot += 0.37;
    game.audio.explosion();
    game.flash('#ff2200', 0.1);
    game.particles.explosion(cx, cy, '#ff4400', 12);
  }

  _startLaser(game) {
    this._laserState = 'charge';
    this._laserCD    = 1.2;
    this._laserY     = game.player.y + game.player.h/2;
    this._laserX0    = 0;
    this._laserX1    = game.level.worldW;
    game.camera.shake(5);
  }

  _updateLaser(dt, game) {
    if (!this._laserState) return;
    this._laserCD -= dt;

    if (this._laserState === 'charge') {
      // Track player Y during charge
      const p = game.player;
      this._laserY = this._laserY * 0.95 + (p.y + p.h/2) * 0.05;
      if (this._laserCD <= 0) {
        this._laserState = 'fire';
        this._laserCD    = 0.55;
        game.camera.shake(16);
        game.flash('#ff0000', 0.4);
        game.audio.explosion();
      }
    } else if (this._laserState === 'fire') {
      if (this._laserCD <= 0) {
        this._laserState = null;
      }
    }
  }

  _doJumpSlam(game) {
    this.vy = -720;
    this.grounded = false;
    game.camera.shake(8);
    this._pendingSlam = true;
  }

  _doTeleport(game) {
    const level = game.level;
    // Flash at old position
    game.particles.explosion(this.x + this.w/2, this.y + this.h/2, '#aa00ff', 22);
    game.flash('#aa00ff', 0.2);
    game.audio.doubleJump(); // reuse sound for warp effect

    // Pick new position near ground on opposite side
    const newX = this.dir > 0
      ? rnd(level.worldW * 0.05, level.worldW * 0.35)
      : rnd(level.worldW * 0.55, level.worldW * 0.88);
    this.x = newX;
    this.vy = 0;

    // Flash at new position
    game.particles.explosion(this.x + this.w/2, this.y + this.h/2, '#ff00ff', 22);
    game.camera.shake(10);
    this.invincible = 0.5;
  }

  _spawnMinions(game) {
    const count = this.phase === 4 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const mx = this.x + this.w/2 + (i - 1) * 80;
      game.enemies.push(new BossMinion(mx, this.y + this.h));
    }
    game.particles.explosion(this.x + this.w/2, this.y + this.h/2, '#ff44aa', 16);
    game.audio.enemyDie(); // reuse for spawn sound
  }

  _applyGravity(dt) { this.vy = Math.min(this.vy + 2200 * dt, 900); }

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

    // Laser telegraph / fire (world-space, behind boss)
    this._renderLaser(ctx);

    const flash = this._hitFlash > 0;
    if (flash && Math.floor(this._hitFlash * 25) % 2 === 0) ctx.globalAlpha = 0.5;

    const cx   = this.x + this.w/2;
    const cy   = this.y + this.h/2;
    const walk = Math.sin(this._walkAnim) * 3;

    // Phase aura
    const phaseHue = this.phase === 1 ? 220 : this.phase === 2 ? 30 : this.phase === 3 ? 0 : 330;
    const enrPulse = this.phase === 4 ? 0.3 + 0.7 * Math.abs(Math.sin(this._enrageFlash)) : 0.2;
    ctx.globalAlpha = enrPulse;
    const aura = ctx.createRadialGradient(cx, cy, 10, cx, cy, 80);
    aura.addColorStop(0, `hsl(${phaseHue},100%,60%)`);
    aura.addColorStop(1, 'transparent');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(cx, cy, 80, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(cx, cy + walk);
    if (this.dir < 0) ctx.scale(-1, 1);

    // Legs
    ctx.fillStyle = '#333355';
    for (let i = 0; i < 4; i++) {
      const lx       = -40 + i * 26;
      const legPhase = Math.sin(this._walkAnim + i * 1.2) * 8;
      ctx.fillRect(lx, 28, 12, 22 + legPhase);
      ctx.fillStyle = '#555577';
      ctx.fillRect(lx - 4, 48 + legPhase, 20, 8);
      ctx.fillStyle = '#333355';
    }

    // Body (enrage flickers red)
    const bodyColor0 = this.phase === 4 ? `hsl(${350 + 10 * Math.sin(this._enrageFlash)},80%,25%)` : '#444466';
    const bodyGrad = ctx.createLinearGradient(-40, -32, 40, 32);
    bodyGrad.addColorStop(0, bodyColor0);
    bodyGrad.addColorStop(0.5, '#222244');
    bodyGrad.addColorStop(1, '#111133');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath(); ctx.roundRect(-44, -28, 88, 60, 12); ctx.fill();

    // Armour plates
    ctx.fillStyle = '#333355';
    ctx.fillRect(-44, -28, 88, 14);
    ctx.fillRect(-44, 18, 88, 14);

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
      const cg = 0.5 + 0.5 * Math.sin(this._time * 8);
      ctx.fillStyle = `rgba(255,${this.phase >= 3 ? 50 : 100},0,${cg})`;
      ctx.beginPath(); ctx.arc(56, -31, 5, 0, Math.PI * 2); ctx.fill();
    }

    // Phase 4: extra shoulder spikes
    if (this.phase === 4) {
      ctx.fillStyle = '#ff0033';
      for (let i = -1; i <= 1; i += 2) {
        ctx.save();
        ctx.translate(i * 44, -28);
        ctx.rotate(i * 0.4);
        ctx.fillRect(-4, -18, 8, 20);
        ctx.restore();
      }
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

    // Eye — color shifts with phase
    const eyeGlow = 0.6 + 0.4 * Math.sin(this._time * (6 + this.phase * 2));
    const eyeHue  = this.phase === 4 ? `hsl(0,100%,${50+30*eyeGlow}%)` :
                    this.phase === 3 ? '#ff4400' :
                    this.phase === 2 ? '#ff8800' : '#00aaff';
    ctx.fillStyle = eyeHue;
    ctx.fillRect(-16, -52, 32, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(0, -46, 5 * eyeGlow, 0, Math.PI * 2); ctx.fill();

    ctx.restore();

    // HP bar
    const barW  = this.w * 1.3;
    const barX  = this.x + this.w/2 - barW/2;
    const barY  = this.y - 28;
    ctx.fillStyle = '#330000';
    ctx.fillRect(barX, barY, barW, 12);
    const hpFrac  = this.hp / MAX_HP;
    const barColor = hpFrac > 0.5 ? '#00ff44' : hpFrac > 0.25 ? '#ffaa00' : '#ff2200';
    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, barW * hpFrac, 12);
    // Phase dividers
    for (const frac of [14/20, 8/20, 3/20]) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(barX + barW * frac - 1, barY, 2, 12);
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, 12);

    const bossLabel = this.phase === 4 ? '☠ MECH-REX ENRAGED' :
                      this.phase === 3 ? '⚡ MECH-REX' :
                      this.phase === 2 ? '🔥 MECH-REX' : 'MECH-REX';
    ctx.fillStyle = this.phase === 4 ? '#ff4444' : '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(bossLabel, this.x + this.w/2, barY - 5);

    ctx.globalAlpha = 1;
  }

  _renderLaser(ctx) {
    if (!this._laserState) return;
    const x0 = this._laserX0;
    const x1 = this._laserX1;
    const y  = this._laserY;

    if (this._laserState === 'charge') {
      const progress = 1 - this._laserCD / 1.2;
      ctx.globalAlpha = 0.15 + progress * 0.5;
      ctx.strokeStyle = '#ff2200';
      ctx.lineWidth = 2 + progress * 6;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Warning triangles
      for (let x = x0 + 40; x < x1; x += 120) {
        ctx.fillStyle = `rgba(255,80,0,${0.4 * progress})`;
        ctx.beginPath();
        ctx.moveTo(x, y - 14);
        ctx.lineTo(x + 10, y);
        ctx.lineTo(x - 10, y);
        ctx.closePath();
        ctx.fill();
      }
    } else if (this._laserState === 'fire') {
      const pulse = 0.85 + 0.15 * Math.sin(this._time * 30);
      // Outer glow
      ctx.globalAlpha = 0.5;
      const laserGrad = ctx.createLinearGradient(0, y - 22, 0, y + 22);
      laserGrad.addColorStop(0, 'transparent');
      laserGrad.addColorStop(0.5, '#ff2200');
      laserGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = laserGrad;
      ctx.fillRect(x0, y - 22, x1 - x0, 44);
      // Core beam
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ff6600';
      ctx.fillRect(x0, y - 10, x1 - x0, 20);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x0, y - 4, x1 - x0, 8);
    }

    ctx.globalAlpha = 1;
  }
}
