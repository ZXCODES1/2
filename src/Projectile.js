import { PROJ_SPEED, ENEMY_PROJ_SPD } from './constants.js';
import { rectOverlap } from './utils.js';

export class PlayerBolt {
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

export class EnemyBullet {
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
export class Shockwave {
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
