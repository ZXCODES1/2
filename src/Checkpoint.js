import { T } from './constants.js';
import { rectOverlap } from './utils.js';

const SAVE_KEY = 'nebulaDash_checkpoint';

export function saveCheckpoint(game, checkpointId) {
  try {
    const data = {
      levelIndex:   game.currentLevelIndex,
      score:        game.score,
      lives:        game.lives,
      checkpointId,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (_) { /* incognito / storage full */ }
}

export function loadCheckpoint() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

export function clearCheckpoint() {
  try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
}

export class Checkpoint {
  constructor(tx, ty, id) {
    this.x    = tx * T;
    this.y    = ty * T - T;            // stands 1 tile tall, sits on the tile row
    this.w    = T * 0.6;
    this.h    = T * 1.6;
    this.id   = id;
    this._triggered = false;
    this._time = Math.random() * Math.PI * 2;
    this._activateAnim = 0;
  }

  update(dt, game) {
    this._time += dt * 2;
    if (this._activateAnim > 0) this._activateAnim = Math.max(0, this._activateAnim - dt * 2);

    if (!this._triggered) {
      const p = game.player;
      if (rectOverlap(this.x - 8, this.y, this.w + 16, this.h, p.x, p.y, p.w, p.h)) {
        this._triggered = true;
        this._activateAnim = 1;

        // Update spawn point
        game._spawnX = this.x;
        game._spawnY = this.y;

        // Persist to localStorage
        saveCheckpoint(game, this.id);

        // Juice
        game.audio.collectPowerup();
        game.particles.explosion(this.x + this.w/2, this.y + this.h/2, '#00ffcc', 20);
        game.addFloater(this.x + this.w/2, this.y - 10, '✓ CHECKPOINT', '#00ffcc');
        game.camera.shake(4);
        game.flash('#00ffcc', 0.18);
      }
    }
  }

  render(ctx) {
    const cx   = this.x + this.w/2;
    const t    = this._time;
    const act  = this._triggered;
    const pop  = this._activateAnim;
    const color = act ? '#00ffcc' : '#888888';
    const gAlpha = act ? 0.35 + 0.15 * Math.sin(t) : 0.12;

    // Pillar glow
    ctx.globalAlpha = gAlpha;
    const glow = ctx.createRadialGradient(cx, this.y + this.h/2, 4, cx, this.y + this.h/2, 36);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, this.y + this.h/2, 36, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // Pillar shaft
    const shaftGrad = ctx.createLinearGradient(this.x, 0, this.x + this.w, 0);
    shaftGrad.addColorStop(0, act ? '#005533' : '#333333');
    shaftGrad.addColorStop(0.5, act ? '#00aa66' : '#555555');
    shaftGrad.addColorStop(1, act ? '#005533' : '#333333');
    ctx.fillStyle = shaftGrad;
    ctx.fillRect(this.x + this.w * 0.2, this.y + 12, this.w * 0.6, this.h - 12);

    // Base platform
    ctx.fillStyle = act ? '#00664d' : '#444444';
    ctx.beginPath();
    ctx.roundRect(this.x, this.y + this.h - 10, this.w, 10, 3);
    ctx.fill();

    // Top orb
    const orbY   = this.y + 8 + (act ? Math.sin(t) * 4 : 0);
    const orbR   = act ? 10 + pop * 6 : 8;
    const orbAlpha = act ? 0.9 : 0.4;
    ctx.globalAlpha = orbAlpha;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(cx, orbY, orbR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx - 3, orbY - 3, orbR * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // Orbiting sparks when active
    if (act) {
      for (let i = 0; i < 3; i++) {
        const a  = t * 2 + (i / 3) * Math.PI * 2;
        const sx = cx + Math.cos(a) * 16;
        const sy = orbY + Math.sin(a) * 7;
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = '#00ffcc';
        ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Label
    ctx.fillStyle = act ? 'rgba(0,255,200,0.8)' : 'rgba(150,150,150,0.5)';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SAVE', cx, this.y + this.h - 4);
  }
}
