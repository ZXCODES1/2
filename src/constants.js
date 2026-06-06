// Virtual canvas resolution
export const W = 960;
export const H = 540;
export const T = 48; // tile size px

// Physics
export const GRAVITY          = 2000;   // px/s²
export const MAX_FALL         = 900;    // px/s
export const JUMP_VEL         = -720;   // initial jump velocity
export const JUMP_HOLD_REDUCE = 0.35;   // gravity multiplier while holding jump
export const JUMP_HOLD_MAX    = 0.22;   // max seconds to hold jump
export const PLAYER_SPEED     = 300;    // px/s run speed
export const PLAYER_ACCEL     = 3000;
export const PLAYER_DECEL     = 3500;
export const COYOTE_T         = 0.1;    // seconds grace after leaving edge
export const JUMP_BUF_T       = 0.12;   // jump-buffer window

// Player dimensions
export const PW = 36;
export const PH = 44;
export const PLAYER_LIVES       = 3;
export const INVINCIBLE_T       = 2.0;
export const SHOOT_CD           = 0.28;
export const SHOOT_CD_RAPID     = 0.1;
export const PROJ_SPEED         = 580;
export const STOMP_BOUNCE       = -550;

// Enemy constants
export const CRAWLER_SPEED   = 80;
export const BOUNCER_SPEED   = 110;
export const SHOOTER_SPEED   = 40;
export const ENEMY_PROJ_SPD  = 230;

// Score
export const SC_CRYSTAL = 10;
export const SC_STOMP   = 100;
export const SC_SHOOT   = 150;
export const SC_BOSS_HIT = 50;

// Dash
export const DASH_CD   = 1.4;   // cooldown seconds after a dash
export const DASH_DUR  = 0.16;  // active dash duration seconds
export const DASH_SPD  = 880;   // dash velocity px/s

// Tile types
export const TILE_EMPTY  = 0;
export const TILE_SOLID  = 1;
export const TILE_ONEWAY = 2;
export const TILE_SPIKE  = 3;
