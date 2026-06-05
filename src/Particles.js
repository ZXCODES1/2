import { rnd, rndInt } from './utils.js';

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

export class ParticleSystem {
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
