// Level data — coordinates are in tile units unless noted
// Tile types: 1=solid, 2=one-way platform, 3=spike

// Helper: fill a row of tiles
function row(type, x0, x1, y) {
  const tiles = [];
  for (let x = x0; x <= x1; x++) tiles.push({ x, y, type });
  return tiles;
}

// ── LEVEL 1 — Crystal Caverns ─────────────────────────────────────────────
export const LEVEL1 = {
  name: 'Crystal Caverns',
  bgTheme: 0,
  musicTheme: 0,
  tileW: 66,
  tileH: 14,

  tiles: [
    // Ground rows 12–13
    ...row(1,  0,  8, 12), ...row(1,  0,  8, 13),
    ...row(1, 11, 20, 12), ...row(1, 11, 20, 13),
    ...row(1, 22, 32, 12), ...row(1, 22, 32, 13),
    ...row(1, 35, 45, 12), ...row(1, 35, 45, 13),
    ...row(1, 47, 59, 12), ...row(1, 47, 59, 13),
    ...row(1, 61, 65, 12), ...row(1, 61, 65, 13),

    // Floating one-way platforms
    ...row(2,  4,  6,  9),
    ...row(2, 12, 14,  8),
    ...row(2, 17, 19,  9),
    ...row(2, 23, 25,  8),
    ...row(2, 28, 30,  6),
    ...row(2, 36, 38,  9),
    ...row(2, 41, 43,  7),
    ...row(2, 49, 51,  8),
    ...row(2, 55, 57,  7),
    ...row(2, 63, 65,  9),

    // Spikes in gaps
    { x:  9, y: 12, type: 3 },
    { x: 10, y: 12, type: 3 },
    { x: 21, y: 12, type: 3 },
    { x: 33, y: 12, type: 3 },
    { x: 34, y: 12, type: 3 },
    { x: 46, y: 12, type: 3 },
    { x: 60, y: 12, type: 3 },
  ],

  movingPlatforms: [
    { tx: 20, ty: 8, w: 3, speed: 60, range: 2.5, axis: 'y' },
    { tx: 33, ty: 7, w: 3, speed: 80, range: 2.0, axis: 'y' },
  ],

  enemies: [
    { type: 'crawler', tx:  5, ty: 11 },
    { type: 'crawler', tx: 15, ty: 11 },
    { type: 'bouncer', tx: 26, ty: 11 },
    { type: 'shooter', tx: 40, ty: 11 },
    { type: 'crawler', tx: 53, ty: 11 },
  ],

  crystals: [
    { tx:  2, ty: 11 }, { tx:  3, ty: 11 },
    { tx:  4, ty:  8 }, { tx:  5, ty:  8 }, { tx:  6, ty:  8 },
    { tx: 12, ty:  7 }, { tx: 14, ty:  7 },
    { tx: 23, ty: 11 }, { tx: 27, ty: 11 },
    { tx: 28, ty:  5 }, { tx: 29, ty:  5 }, { tx: 30, ty:  5 },
    { tx: 37, ty: 11 }, { tx: 39, ty: 11 },
    { tx: 41, ty:  6 }, { tx: 43, ty:  6 },
    { tx: 50, ty: 11 }, { tx: 52, ty: 11 },
    { tx: 55, ty:  6 }, { tx: 57, ty:  6 },
    { tx: 62, ty: 11 }, { tx: 63, ty: 11 }, { tx: 64, ty: 11 },
  ],

  powerUps: [
    { type: 'doubleJump', tx: 29, ty: 5 },
    { type: 'rapidFire',  tx: 50, ty: 7 },
  ],

  playerStart: { tx: 2, ty: 11 },
  exit: { tx: 63, ty: 11 },
};

// ── LEVEL 2 — Neon Wastes ─────────────────────────────────────────────────
export const LEVEL2 = {
  name: 'Neon Wastes',
  bgTheme: 1,
  musicTheme: 1,
  tileW: 80,
  tileH: 14,

  tiles: [
    // Ground — more gaps
    ...row(1,  0,  6, 12), ...row(1,  0,  6, 13),
    ...row(1,  9, 16, 12), ...row(1,  9, 16, 13),
    ...row(1, 19, 26, 12), ...row(1, 19, 26, 13),
    ...row(1, 29, 36, 12), ...row(1, 29, 36, 13),
    ...row(1, 39, 47, 12), ...row(1, 39, 47, 13),
    ...row(1, 51, 59, 12), ...row(1, 51, 59, 13),
    ...row(1, 62, 72, 12), ...row(1, 62, 72, 13),
    ...row(1, 74, 79, 12), ...row(1, 74, 79, 13),

    // Elevated platforms
    ...row(2,  3,  5, 10),
    ...row(2,  9, 11,  9),
    ...row(2, 14, 16,  7),
    ...row(2, 19, 21, 10),
    ...row(2, 24, 26,  8),
    ...row(2, 30, 32,  7),
    ...row(2, 35, 37,  9),
    ...row(2, 40, 42,  8),
    ...row(2, 45, 47,  6),
    ...row(2, 53, 55,  9),
    ...row(2, 57, 59,  7),
    ...row(2, 63, 65,  8),
    ...row(2, 68, 70,  6),
    ...row(2, 73, 75,  9),
    ...row(2, 77, 79,  7),

    // Wall sections (semi-enclosed area)
    ...row(1,  27, 27, 10), ...row(1, 27, 27, 11), // right wall of gap
    ...row(1,  48, 48, 10), ...row(1, 48, 48, 11),

    // Spikes
    { x:  7, y: 12, type: 3 }, { x:  8, y: 12, type: 3 },
    { x: 17, y: 12, type: 3 }, { x: 18, y: 12, type: 3 },
    { x: 27, y: 12, type: 3 }, { x: 28, y: 12, type: 3 },
    { x: 37, y: 12, type: 3 }, { x: 38, y: 12, type: 3 },
    { x: 48, y: 12, type: 3 }, { x: 49, y: 12, type: 3 }, { x: 50, y: 12, type: 3 },
    { x: 60, y: 12, type: 3 }, { x: 61, y: 12, type: 3 },
    { x: 72, y: 12, type: 3 }, { x: 73, y: 12, type: 3 },
  ],

  movingPlatforms: [
    { tx: 17, ty: 9, w: 3, speed: 90,  range: 3.0, axis: 'y' },
    { tx: 28, ty: 8, w: 3, speed: 110, range: 3.0, axis: 'y' },
    { tx: 38, ty: 8, w: 3, speed: 80,  range: 2.0, axis: 'x' },
    { tx: 49, ty: 8, w: 3, speed: 100, range: 3.5, axis: 'y' },
    { tx: 61, ty: 7, w: 3, speed: 130, range: 2.5, axis: 'y' },
    { tx: 72, ty: 8, w: 3, speed: 90,  range: 2.0, axis: 'x' },
  ],

  enemies: [
    { type: 'crawler', tx:  4, ty: 11 },
    { type: 'bouncer', tx: 12, ty: 11 },
    { type: 'shooter', tx: 22, ty: 11 },
    { type: 'crawler', tx: 31, ty: 11 },
    { type: 'bouncer', tx: 42, ty: 11 },
    { type: 'shooter', tx: 54, ty: 11 },
    { type: 'crawler', tx: 64, ty: 11 },
    { type: 'bouncer', tx: 75, ty: 11 },
  ],

  crystals: [
    { tx:  3, ty: 11 }, { tx:  5, ty: 11 },
    { tx:  3, ty:  9 }, { tx:  5, ty:  9 },
    { tx: 10, ty:  8 }, { tx: 11, ty:  8 },
    { tx: 15, ty:  6 }, { tx: 16, ty:  6 },
    { tx: 20, ty:  9 }, { tx: 21, ty:  9 },
    { tx: 25, ty:  7 }, { tx: 26, ty:  7 },
    { tx: 30, ty:  6 }, { tx: 32, ty:  6 },
    { tx: 36, ty:  8 },
    { tx: 41, ty:  7 }, { tx: 42, ty:  7 },
    { tx: 45, ty:  5 }, { tx: 46, ty:  5 },
    { tx: 54, ty:  8 }, { tx: 55, ty:  8 },
    { tx: 58, ty:  6 }, { tx: 59, ty:  6 },
    { tx: 64, ty:  7 }, { tx: 65, ty:  7 },
    { tx: 69, ty:  5 }, { tx: 70, ty:  5 },
    { tx: 74, ty:  8 }, { tx: 78, ty:  8 },
  ],

  powerUps: [
    { type: 'shield',     tx: 14, ty: 6 },
    { type: 'doubleJump', tx: 45, ty: 5 },
    { type: 'rapidFire',  tx: 68, ty: 5 },
    { type: 'life',       tx: 77, ty: 6 },
  ],

  playerStart: { tx: 2, ty: 11 },
  exit: { tx: 77, ty: 11 },
};

// ── LEVEL 3 — Boss Chamber ────────────────────────────────────────────────
export const LEVEL3 = {
  name: 'Boss Chamber',
  bgTheme: 2,
  musicTheme: 2,
  tileW: 32,
  tileH: 14,

  tiles: [
    // Ground
    ...row(1,  0, 31, 12),
    ...row(1,  0, 31, 13),
    // Side walls
    ...row(1,  0,  0,  0), ...row(1,  0,  0,  1), ...row(1,  0,  0,  2),
    ...row(1,  0,  0,  3), ...row(1,  0,  0,  4), ...row(1,  0,  0,  5),
    ...row(1,  0,  0,  6), ...row(1,  0,  0,  7), ...row(1,  0,  0,  8),
    ...row(1,  0,  0,  9), ...row(1,  0,  0, 10), ...row(1,  0,  0, 11),
    ...row(1, 31, 31,  0), ...row(1, 31, 31,  1), ...row(1, 31, 31,  2),
    ...row(1, 31, 31,  3), ...row(1, 31, 31,  4), ...row(1, 31, 31,  5),
    ...row(1, 31, 31,  6), ...row(1, 31, 31,  7), ...row(1, 31, 31,  8),
    ...row(1, 31, 31,  9), ...row(1, 31, 31, 10), ...row(1, 31, 31, 11),

    // Platforms for dodging
    ...row(2,  3,  6,  8),
    ...row(2, 12, 14,  6),
    ...row(2, 17, 19,  6),
    ...row(2, 25, 28,  8),
    ...row(2,  8, 10,  9),
    ...row(2, 21, 23,  9),
  ],

  movingPlatforms: [],

  enemies: [],
  boss: { tx: 18, ty: 11 },

  crystals: [
    { tx:  4, ty:  7 }, { tx:  5, ty:  7 },
    { tx: 12, ty:  5 }, { tx: 14, ty:  5 },
    { tx: 17, ty:  5 }, { tx: 19, ty:  5 },
    { tx: 26, ty:  7 }, { tx: 27, ty:  7 },
    { tx:  9, ty:  8 }, { tx: 22, ty:  8 },
  ],

  powerUps: [
    { type: 'shield',    tx: 13, ty: 5 },
    { type: 'rapidFire', tx: 18, ty: 5 },
    { type: 'life',      tx:  5, ty: 7 },
  ],

  playerStart: { tx: 3, ty: 11 },
  exit: null,
};

export const ALL_LEVELS = [LEVEL1, LEVEL2, LEVEL3];
