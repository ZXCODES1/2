// Headless smoke-test: mocks the canvas + DOM + Web Audio, then runs the
// game across every state (menu, play, boss fight, win, game-over) for
// thousands of frames to catch runtime errors without a real browser.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── Mock 2D canvas context ────────────────────────────────────────────────
const noop = () => {};
const gradient = { addColorStop: noop };
const ctxMock = new Proxy({}, {
  get(_, prop) {
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
    if (prop === 'measureText') return () => ({ width: 10 });
    if (prop === 'canvas') return canvasMock;
    return typeof prop === 'string' ? noop : undefined;
  },
  set() { return true; }, // swallow fillStyle/font/etc assignments
});

const canvasMock = {
  width: 0, height: 0, style: {},
  getContext: () => ctxMock,
  addEventListener: noop,
};

// ── Mock Web Audio ────────────────────────────────────────────────────────
const audioParam = { value: 0, setValueAtTime: noop, linearRampToValueAtTime: noop, exponentialRampToValueAtTime: noop };
class AudioContextMock {
  constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.destination = {}; }
  createGain()   { return { gain: { ...audioParam }, connect: noop }; }
  createOscillator() { return { type: '', frequency: { ...audioParam }, connect: noop, start: noop, stop: noop }; }
  createBuffer() { return { getChannelData: () => new Float32Array(16) }; }
  createBufferSource() { return { buffer: null, connect: noop, start: noop, stop: noop }; }
  resume() {}
}

// ── Install globals ───────────────────────────────────────────────────────
globalThis.window = globalThis;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.addEventListener = noop;
globalThis.requestAnimationFrame = () => 0; // don't auto-run the loop
globalThis.AudioContext = AudioContextMock;
globalThis.webkitAudioContext = AudioContextMock;
globalThis.document = {
  getElementById: (id) => (id === 'canvas' ? canvasMock : null),
  addEventListener: noop,
};

// ── Load the built bundle ─────────────────────────────────────────────────
const bundle = readFileSync(join(root, 'dist', 'bundle.js'), 'utf8');
// eslint-disable-next-line no-eval
(0, eval)(bundle);

const game = globalThis.NebulaGame;
if (!game) { console.error('✗ NebulaGame not exposed'); process.exit(1); }

const DT = 1 / 60;
let frames = 0;
const errors = [];

function step(setInput) {
  if (setInput) setInput(game.input);
  game.update(DT);
  game.render();
  frames++;
}

function phase(label, fn) {
  try { fn(); console.log(`✓ ${label}`); }
  catch (e) { errors.push(`${label}: ${e.stack || e}`); console.error(`✗ ${label}\n   ${e.message}`); }
}

// Helper to simulate held + pressed keys for one frame
function holdKeys(input, keys) {
  for (const k of keys) { input._keys[k] = true; input._pressed[k] = true; }
}

// 1) Start menu renders
phase('menu renders', () => { for (let i = 0; i < 10; i++) step(); });

// 2) Start the game directly (skip audio init path is fine)
phase('start level 1', () => { game.start(); step(); });

// 3) Play level 1: run right, jump, shoot for many frames
phase('play level 1 (1800 frames, move/jump/shoot)', () => {
  for (let i = 0; i < 1800; i++) {
    step(inp => {
      holdKeys(inp, ['ArrowRight']);
      if (i % 40 < 8) holdKeys(inp, ['Space']);       // periodic jumps
      if (i % 15 === 0) holdKeys(inp, ['KeyZ']);       // shoot
    });
    if (game.state !== 'playing' && game.state !== 'transition' && game.state !== 'bossIntro') break;
  }
});

// 4) Exercise player taking damage / respawn
phase('player hurt + respawn', () => {
  game.lives = 3;
  game.player.invincible = false;
  game.player.hurt(game);
  for (let i = 0; i < 60; i++) step();
});

// 5) Force-load the boss level and fight it
phase('boss level load', () => {
  game.lives = 5;
  game.currentLevelIndex = 2;
  game._loadLevel(2);
  game.state = 'playing';
  step();
  if (!game.boss) throw new Error('boss not created');
});

phase('boss fight (drive through all 3 phases + death)', () => {
  const boss = game.boss;
  boss._intro = false; // skip intro wait
  // Run frames while progressively damaging the boss to trigger phases & attacks
  for (let i = 0; i < 1200 && boss && !boss.dead; i++) {
    step(inp => {
      holdKeys(inp, [i % 2 ? 'ArrowRight' : 'ArrowLeft']);
      if (i % 30 < 6) holdKeys(inp, ['Space']);
      if (i % 10 === 0) holdKeys(inp, ['KeyZ']);
    });
    if (i % 50 === 0) boss.takeDamage(1, game); // ensure phase transitions + death
  }
  if (!boss.dead) throw new Error('boss did not die after 1200 frames');
});

// 6) Boss attacks fired directly (in case loop timing missed any)
phase('boss attack methods', () => {
  game._loadLevel(2);
  game.state = 'playing';
  const b = game.boss; b._intro = false;
  b._doStomp(game);
  b.phase = 2; b._doShoot(game);
  b.phase = 3; b._doShoot(game); b._doJumpSlam(game);
  for (let i = 0; i < 120; i++) step();
});

// 7) Render every UI state
phase('render all UI states', () => {
  for (const st of ['paused', 'gameover', 'win', 'transition', 'bossIntro', 'start']) {
    game.state = st;
    for (let i = 0; i < 5; i++) game.render();
  }
});

// 8) Level transition flow
phase('level transition flow', () => {
  game.start();
  game._levelComplete();
  for (let i = 0; i < 180; i++) step();
});

console.log(`\nRan ${frames} frames total.`);
if (errors.length) {
  console.error(`\n✗ SMOKE TEST FAILED with ${errors.length} error(s):\n` + errors.join('\n\n'));
  process.exit(1);
}
console.log('\n✓ SMOKE TEST PASSED — no runtime errors across all states.');
