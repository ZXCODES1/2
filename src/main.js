import { W, H } from './constants.js';
import { Game } from './Game.js';

// ── Canvas setup & scaling ────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
canvas.width  = W;
canvas.height = H;

function resize() {
  const scaleX = window.innerWidth  / W;
  const scaleY = window.innerHeight / H;
  const scale  = Math.min(scaleX, scaleY);
  canvas.style.width  = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
}
resize();
window.addEventListener('resize', resize);

// ── Game loop ─────────────────────────────────────────────────────────────
const game = new Game(canvas);

let lastTime = 0;
const MAX_DT  = 1 / 30; // cap delta at ~30fps to prevent spiral of death

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, MAX_DT);
  lastTime = timestamp;

  game.update(dt);
  game.render();

  requestAnimationFrame(loop);
}

requestAnimationFrame(ts => {
  lastTime = ts;
  requestAnimationFrame(loop);
});
