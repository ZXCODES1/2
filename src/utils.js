export const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp   = (a, b, t)  => a + (b - a) * t;
export const rnd    = (lo, hi)   => Math.random() * (hi - lo) + lo;
export const rndInt = (lo, hi)   => Math.floor(rnd(lo, hi + 1));
export const sign   = (v)        => (v > 0 ? 1 : v < 0 ? -1 : 0);

export function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// HSL helper
export function hsl(h, s, l, a = 1) {
  return `hsla(${h},${s}%,${l}%,${a})`;
}
