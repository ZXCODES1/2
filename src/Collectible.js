import { T, SC_CRYSTAL } from './constants.js';
import { rectOverlap } from './utils.js';

export class Crystal {
  constructor(x, y) {
    this.x    = x * T + T * 0.3;
    this.y    = y * T + T * 0.25;
    this.w    = T * 0.4;
    this.h    = T * 0.5;
    this.dead = false;
    this._time = Math.random() * Math.PI * 2;
    this.vx   = 0;
    this.vy   = 0;
  }

  update(dt, game) {
    this._time += dt * 2.5;
    const p = game.player;

    // Magnet power-up: attract toward player
    if (p.power.magnet > 0) {
      const px   = p.x + p.w/2;
      const py   = p.y + p.h/2;
      const cx   = this.x + this.w/2;
      const cy   = this.y + this.h/2;
      const dist = Math.hypot(px - cx, py - cy);
      const RANGE = 180;
      if (dist < RANGE && dist > 1) {
        const pull = (1 - dist / RANGE) * 500;
        this.vx += (px - cx) / dist * pull * dt;
        this.vy += (py - cy) / dist * pull * dt;
      }
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.85;
    this.vy *= 0.85;

    if (rectOverlap(this.x - 4, this.y - 4, this.w + 8, this.h + 8, p.x, p.y, p.w, p.h)) {
      game.score += SC_CRYSTAL;
      game.audio.collectCrystal();
      game.particles.crystalSpark(this.x + this.w/2, this.y + this.h/2);
      game.addFloater(this.x + this.w/2, this.y - 6, `+${SC_CRYSTAL}`, '#00ffcc');
      this.dead = true;
    }
  }

  render(ctx) {
    const cx = this.x + this.w/2;
    const cy = this.y + this.h/2 + Math.sin(this._time) * 3;
    const t  = this._time;

    ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20);
    glow.addColorStop(0, '#00ffcc');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = `hsl(${170 + Math.sin(t)*20},100%,65%)`;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx + 6, cy - 2);
    ctx.lineTo(cx + 5, cy + 8);
    ctx.lineTo(cx, cy + 12);
    ctx.lineTo(cx - 5, cy + 8);
    ctx.lineTo(cx - 6, cy - 2);
    ctx.closePath();
    ctx.fill();

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

export class PowerUp {
  constructor(x, y, type) {
    this.x    = x * T + T * 0.1;
    this.y    = y * T + T * 0.1;
    this.w    = T * 0.8;
    this.h    = T * 0.8;
    this.type = type;
    this.dead = false;
    this._time = Math.random() * Math.PI * 2;
  }

  _color() {
    switch (this.type) {
      case 'doubleJump': return ['#aa44ff', '#dd88ff'];
      case 'rapidFire':  return ['#ffaa00', '#ffee00'];
      case 'shield':     return ['#0066ff', '#44aaff'];
      case 'spread':     return ['#00ff88', '#88ffcc'];
      case 'magnet':     return ['#ff44ff', '#ff88ff'];
      case 'speed':      return ['#ffee00', '#ffffff'];
      case 'nuke':       return ['#ff2200', '#ff8800'];
      case 'life':       return ['#ff2244', '#ff88aa'];
      default:           return ['#ffffff', '#cccccc'];
    }
  }

  _icon() {
    switch (this.type) {
      case 'doubleJump': return '✦';
      case 'rapidFire':  return '⚡';
      case 'shield':     return '◈';
      case 'spread':     return '✷';
      case 'magnet':     return '⊕';
      case 'speed':      return '▶▶';
      case 'nuke':       return '☢';
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
      game.particles.crystalSpark(this.x + this.w/2, this.y + this.h/2);
      game.addFloater(this.x + this.w/2, this.y - 10,
        this.type.toUpperCase() + (this.type !== 'nuke' && this.type !== 'life' ? '!' : ' ★'), '#ffcc00');
      this.dead = true;
    }
  }

  _apply(p, game) {
    switch (this.type) {
      case 'doubleJump':
        p.power.doubleJump = 22;
        break;
      case 'rapidFire':
        p.power.rapidFire = 14;
        break;
      case 'shield':
        p.power.shield = 18;
        break;
      case 'spread':
        p.power.spread = 16;
        break;
      case 'magnet':
        p.power.magnet = 14;
        break;
      case 'speed':
        p.power.speed = 10;
        break;
      case 'nuke':
        // Kill all on-screen enemies instantly
        for (const e of game.enemies) {
          if (!e.dead) e.takeDamage(999, game);
        }
        game.flash('#ffffff', 1.0);
        game.hitStop(0.4);
        game.camera.shake(24);
        game.particles.explosion(p.x + p.w/2, p.y + p.h/2, '#ffaa00', 40);
        break;
      case 'life':
        game.lives = Math.min(game.lives + 1, 5);
        game.score += 200;
        game.flash('#ff4488', 0.25);
        break;
    }
  }

  render(ctx) {
    const cx = this.x + this.w/2;
    const cy = this.y + this.h/2 + Math.sin(this._time) * 4;
    const t  = this._time;
    const [c1, c2] = this._color();

    // Spinning outer ring
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.8);
    ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t);
    for (let i = 0; i < 6; i++) {
      const a  = (i / 6) * Math.PI * 2;
      const rx = Math.cos(a) * 20;
      const ry = Math.sin(a) * 20;
      ctx.fillStyle = c1;
      ctx.beginPath(); ctx.arc(rx, ry, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // Glow
    ctx.globalAlpha = 0.3 + 0.1 * Math.sin(t);
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 28);
    g.addColorStop(0, c1);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // Box
    const bx = cx - this.w/2 + 2, by = cy - this.h/2 + 2;
    const bw = this.w - 4,        bh = this.h - 4;
    ctx.strokeStyle = c1;
    ctx.lineWidth = 2;
    ctx.shadowColor = c1;
    ctx.shadowBlur = 12;

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
    ctx.font = this.type === 'speed' ? 'bold 14px sans-serif' : 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this._icon(), cx, cy);
  }
}
