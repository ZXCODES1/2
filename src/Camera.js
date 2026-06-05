import { W, H } from './constants.js';
import { clamp, lerp } from './utils.js';

export class Camera {
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
