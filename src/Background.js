import { W, H } from './constants.js';
import { rnd, rndInt } from './utils.js';

// Each theme has 4 parallax layers, drawn programmatically
export class Background {
  constructor() {
    this._stars = this._genStars(200);
    this._nebula = this._genNebula();
    this._buildings1 = this._genBuildings(12, 120, 240, 0);
    this._buildings2 = this._genBuildings(18, 60,  160, 0);
    this._boss_pillars = this._genPillars();
  }

  _genStars(n) {
    const stars = [];
    for (let i = 0; i < n; i++) {
      stars.push({
        x: rnd(0, W * 4),
        y: rnd(0, H * 0.85),
        r: rnd(0.5, 2.5),
        bright: rnd(0.4, 1.0),
        twinkle: rnd(0, Math.PI * 2)
      });
    }
    return stars;
  }

  _genNebula() {
    // Random cloud shapes stored as control-point blobs
    const blobs = [];
    for (let i = 0; i < 8; i++) {
      blobs.push({
        x: rnd(0, W * 4), y: rnd(-60, H * 0.7),
        rx: rnd(120, 320), ry: rnd(60, 160),
        hue: rndInt(200, 300),
        alpha: rnd(0.04, 0.1)
      });
    }
    return blobs;
  }

  _genBuildings(count, minH, maxH, seed) {
    const buildings = [];
    let x = -80;
    for (let i = 0; i < count; i++) {
      const w = rndInt(60, 160);
      const h = rndInt(minH, maxH);
      const windows = [];
      for (let wy = 12; wy < h - 10; wy += 18) {
        for (let wx = 6; wx < w - 6; wx += 14) {
          if (Math.random() > 0.35)
            windows.push({ x: wx, y: wy, lit: Math.random() > 0.45 });
        }
      }
      buildings.push({ x, w, h, windows, hue: rndInt(200, 250) });
      x += w + rndInt(0, 30);
    }
    return buildings;
  }

  _genPillars() {
    const p = [];
    for (let i = 0; i < 8; i++) {
      p.push({ x: i * 180 + rnd(-30, 30), w: rndInt(30, 60), h: rndInt(H * 0.3, H * 0.8) });
    }
    return p;
  }

  render(ctx, camera, worldW, theme = 0, time = 0) {
    const cx = camera.x;
    const cy = camera.y;

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    if (theme === 2) {
      // Boss arena: red/dark
      sky.addColorStop(0, '#1a0008');
      sky.addColorStop(0.6, '#2a0010');
      sky.addColorStop(1, '#0a0015');
    } else if (theme === 1) {
      sky.addColorStop(0, '#000820');
      sky.addColorStop(0.6, '#001840');
      sky.addColorStop(1, '#000010');
    } else {
      sky.addColorStop(0, '#020010');
      sky.addColorStop(0.5, '#050025');
      sky.addColorStop(1, '#000015');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Layer 0: Stars (parallax factor 0.05)
    this._drawStars(ctx, cx * 0.05, time);

    // Layer 1: Nebula clouds (factor 0.12)
    this._drawNebula(ctx, cx * 0.12, cy * 0.05, theme);

    // Layer 2: Far buildings (factor 0.25)
    this._drawBuildings(ctx, this._buildings1, cx * 0.25, time, theme, 0.6);

    // Layer 3: Near buildings (factor 0.55)
    this._drawBuildings(ctx, this._buildings2, cx * 0.55, time, theme, 0.9);

    if (theme === 2) {
      this._drawPillars(ctx, cx * 0.3);
    }
  }

  _drawStars(ctx, ox, time) {
    for (const s of this._stars) {
      const sx = ((s.x - ox) % (W * 1.5) + W * 1.5) % (W * 1.5);
      const twinkle = 0.5 + 0.5 * Math.sin(time * 2 + s.twinkle);
      ctx.globalAlpha = s.bright * (0.6 + 0.4 * twinkle);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx - s.r, s.y - s.r, s.r * 2, s.r * 2);
    }
    ctx.globalAlpha = 1;
  }

  _drawNebula(ctx, ox, oy, theme) {
    for (const b of this._nebula) {
      const bx = ((b.x - ox) % (W * 3) + W * 3) % (W * 3);
      const by = b.y - oy * 0.5;
      ctx.globalAlpha = b.alpha;
      const grad = ctx.createRadialGradient(bx, by, 0, bx, by, b.rx);
      const h = theme === 2 ? b.hue + 120 : b.hue;
      grad.addColorStop(0, `hsl(${h},60%,45%)`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(bx, by, b.rx, b.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawBuildings(ctx, buildings, ox, time, theme, alpha) {
    ctx.globalAlpha = alpha;
    const hue = theme === 2 ? 320 : theme === 1 ? 220 : 230;
    for (const b of buildings) {
      const bx = ((b.x - ox) % (W * 2.5) + W * 2.5) % (W * 2.5) - 100;
      const by = H - b.h;
      ctx.fillStyle = `hsl(${hue},30%,${theme === 2 ? 12 : 14}%)`;
      ctx.fillRect(bx, by, b.w, b.h);
      // Outline
      ctx.strokeStyle = `hsl(${hue},60%,25%)`;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, b.w, b.h);
      // Windows
      for (const w of b.windows) {
        if (w.lit) {
          const flicker = 0.7 + 0.3 * Math.sin(time * 4 + b.x + w.x);
          ctx.globalAlpha = alpha * 0.7 * flicker;
          ctx.fillStyle = theme === 2 ? '#ff4040' : '#00ffdd';
          ctx.fillRect(bx + w.x, by + w.y, 5, 5);
          ctx.globalAlpha = alpha;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawPillars(ctx, ox) {
    for (const p of this._boss_pillars) {
      const px = ((p.x - ox) % (W * 2) + W * 2) % (W * 2);
      const grad = ctx.createLinearGradient(px, H - p.h, px, H);
      grad.addColorStop(0, '#330000');
      grad.addColorStop(1, '#220020');
      ctx.fillStyle = grad;
      ctx.fillRect(px, H - p.h, p.w, p.h);
      ctx.strokeStyle = '#660020';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, H - p.h, p.w, p.h);
    }
  }
}
