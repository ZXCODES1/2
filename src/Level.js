import { T, TILE_SOLID, TILE_ONEWAY, TILE_SPIKE } from './constants.js';
import { drawRoundRect } from './utils.js';
import { Crystal, PowerUp } from './Collectible.js';
import { Crawler, Bouncer, Shooter, Flyer } from './Enemy.js';
import { Boss } from './Boss.js';
import { Checkpoint } from './Checkpoint.js';

export class MovingPlatform {
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

export class Level {
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
        case 'flyer':   enemies.push(new Flyer(e.tx, e.ty));   break;
      }
    }
    for (const c of (data.crystals || []))  collectibles.push(new Crystal(c.tx, c.ty));
    for (const p of (data.powerUps || []))  collectibles.push(new PowerUp(p.tx, p.ty, p.type));
    if (data.boss) boss = new Boss(data.boss.tx, data.boss.ty);

    const checkpoints = (data.checkpoints || []).map((cp, i) => new Checkpoint(cp.tx, cp.ty, i));
    return { enemies, collectibles, boss, checkpoints };
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
