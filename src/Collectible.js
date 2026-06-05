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
  }

  update(dt, game) {
    this._time += dt * 2.5;
    const p = game.player;
    if (rectOverlap(this.x - 4, this.y - 4, this.w + 8, this.h + 8, p.x, p.y, p.w, p.h)) {
      game.score += SC_CRYSTAL;
      game.audio.collectCrystal();
      game.particles.crystalSpark(this.x + this.w / 2, this.y + this.h / 2);
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

export class PowerUp {
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
