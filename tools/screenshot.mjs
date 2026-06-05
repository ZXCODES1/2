// Render real gameplay frames to PNG using @napi-rs/canvas (no browser needed).
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createCanvas } from '@napi-rs/canvas';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const W = 960, H = 540;
const realCanvas = createCanvas(W, H);
const realCtx = realCanvas.getContext('2d');

// ── Minimal DOM / Web Audio mocks (canvas is REAL) ───────────────────────
const noop = () => {};
const audioParam = { value: 0, setValueAtTime: noop, linearRampToValueAtTime: noop, exponentialRampToValueAtTime: noop };
class AudioContextMock {
  constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.destination = {}; }
  createGain() { return { gain: { ...audioParam }, connect: noop }; }
  createOscillator() { return { type: '', frequency: { ...audioParam }, connect: noop, start: noop, stop: noop }; }
  createBuffer() { return { getChannelData: () => new Float32Array(16) }; }
  createBufferSource() { return { buffer: null, connect: noop, start: noop, stop: noop }; }
  resume() {}
}
const canvasMock = { width: W, height: H, style: {}, getContext: () => realCtx, addEventListener: noop };

globalThis.window = globalThis;
globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
globalThis.addEventListener = noop;
globalThis.requestAnimationFrame = () => 0;
globalThis.AudioContext = AudioContextMock;
globalThis.webkitAudioContext = AudioContextMock;
globalThis.document = { getElementById: (id) => (id === 'canvas' ? canvasMock : null), addEventListener: noop };

// ── Load bundle ──────────────────────────────────────────────────────────
(0, eval)(readFileSync(join(root, 'dist', 'bundle.js'), 'utf8'));
const game = globalThis.NebulaGame;

const DT = 1 / 60;
const shots = join(root, 'screenshots');
mkdirSync(shots, { recursive: true });

function save(name) {
  writeFileSync(join(shots, name), realCanvas.toBuffer('image/png'));
  console.log('  saved', name);
}
function hold(input, keys) { for (const k of keys) { input._keys[k] = true; input._pressed[k] = true; } }
function run(n, setInput) { for (let i = 0; i < n; i++) { if (setInput) setInput(game.input, i); game.update(DT); game.render(); } }

// 1) Title screen
run(30);
save('01-title.png');

// 2) Level 1 mid-action (move right, jump, shoot)
game.start();
run(220, (inp, i) => {
  hold(inp, ['ArrowRight']);
  if (i % 45 < 9) hold(inp, ['Space']);
  if (i % 12 === 0) hold(inp, ['KeyZ']);
});
save('02-level1.png');

// 3) Further in level 1 with a combo going
run(260, (inp, i) => {
  hold(inp, ['ArrowRight']);
  if (i % 50 < 9) hold(inp, ['Space']);
  if (i % 8 === 0) hold(inp, ['KeyZ']);
});
save('03-level1-action.png');

// 4) Level 2
game.currentLevelIndex = 1; game._loadLevel(1); game.state = 'playing';
run(240, (inp, i) => {
  hold(inp, ['ArrowRight']);
  if (i % 40 < 9) hold(inp, ['Space']);
  if (i % 10 === 0) hold(inp, ['KeyZ']);
});
save('04-level2.png');

// 5) Boss fight (phase 2/3, lots of action)
game.currentLevelIndex = 2; game._loadLevel(2); game.state = 'playing';
if (game.boss) game.boss._intro = false;
run(200, (inp, i) => {
  hold(inp, [i % 2 ? 'ArrowRight' : 'ArrowLeft']);
  if (i % 30 < 6) hold(inp, ['Space']);
  if (i % 6 === 0) hold(inp, ['KeyZ']);
  if (game.boss && i % 25 === 0) game.boss.takeDamage(1, game); // push into later phases
});
save('05-boss.png');

console.log('Done.');
