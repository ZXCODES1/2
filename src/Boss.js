import { T, SC_BOSS_HIT } from './constants.js';
import { rectOverlap, rnd, rndInt } from './utils.js';
import { EnemyBullet, Shockwave } from './Projectile.js';

const BOSS_W = 96;
const BOSS_H = 84;
const MAX_HP = 20;

export class Boss {
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
