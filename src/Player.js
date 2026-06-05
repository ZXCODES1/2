import {
  PW, PH, GRAVITY, MAX_FALL, JUMP_VEL, JUMP_HOLD_REDUCE, JUMP_HOLD_MAX,
  PLAYER_SPEED, PLAYER_ACCEL, PLAYER_DECEL, COYOTE_T, JUMP_BUF_T,
  INVINCIBLE_T, SHOOT_CD, SHOOT_CD_RAPID, STOMP_BOUNCE, T
} from './constants.js';
import { clamp, sign } from './utils.js';
import { PlayerBolt } from './Projectile.js';

export class Player {
  constructor(tx, ty) {
    this.x = tx * T;
    this.y = ty * T;
    this.w = PW;
    this.h = PH;
    this.vx = 0;
    this.vy = 0;

    this.grounded      = false;
    this.facingRight   = true;
    this._coyote       = 0;  // coyote time counter
    this._jumpBuf      = 0;  // jump buffer counter
    this._jumpHeld     = 0;  // how long jump has been held
    this._wasGrounded  = false;
    this._prevY        = 0;

    this.invincible    = false;
    this._invTimer     = 0;

    // Power-ups
    this.canDoubleJump = false;
    this._hasJumped2   = false;
    this.rapidFire     = false;
    this.shielded      = false;
    this.powerUpTimer  = 0;
    this.activePowerUp = null;

    this._shootTimer   = 0;

    // Animation
    this._animTime     = 0;
    this._animFrame    = 0;
    this._shootAnim    = 0;
    this._hurtFlash    = 0;
    this._landAnim     = 0;
    this._deathAnim    = 0;

    this.dead          = false;
    this._dying        = false;

    // Speed afterimage trail
    this._ghosts       = [];
    this._ghostTimer   = 0;
  }

  hurt(game) {
    if (this.invincible || this._dying) return;

    if (this.shielded) {
      this.shielded = false;
      this.powerUpTimer = 0;
      this.activePowerUp = null;
      game.audio.collectPowerup();
      game.particles.explosion(this.x + this.w/2, this.y + this.h/2, '#0066ff', 12);
      game.camera.shake(6);
      return;
    }

    game.lives--;
    game.audio.playerHurt();
    game.camera.shake(12);
    game.particles.hurt(this.x + this.w/2, this.y + this.h/2);

    this.invincible = true;
    this._invTimer  = INVINCIBLE_T;
    this._hurtFlash = 0;
    this.vy = -300; // small knockup
    this.vx = this.facingRight ? -150 : 150;

    if (game.lives <= 0) {
      this._dying = true;
      this._deathAnim = 0;
    }
  }

  update(dt, game) {
    const inp = game.input;

    if (this._dying) {
      this._deathAnim += dt;
      this.vy += GRAVITY * dt;
      this.y  += this.vy * dt;
      if (this._deathAnim > 1.5) {
        this.dead = true;
      }
      return;
    }

    this._prevY = this.y;

    // Power-up timer
    if (this.powerUpTimer > 0) {
      this.powerUpTimer -= dt;
      if (this.powerUpTimer <= 0) {
        this.powerUpTimer  = 0;
        this.canDoubleJump = false;
        this.rapidFire     = false;
        this.shielded      = false;
        this.activePowerUp = null;
      }
    }

    // Invincibility
    if (this.invincible) {
      this._invTimer  -= dt;
      this._hurtFlash += dt;
      if (this._invTimer <= 0) this.invincible = false;
    }

    // Shoot cooldown
    this._shootTimer = Math.max(0, this._shootTimer - dt);

    // ── Horizontal movement ────────────────────────────────────────
    const spd = PLAYER_SPEED * (this.rapidFire ? 1.4 : 1);
    if (inp.left()) {
      this.vx = clamp(this.vx - PLAYER_ACCEL * dt, -spd, spd);
      this.facingRight = false;
    } else if (inp.right()) {
      this.vx = clamp(this.vx + PLAYER_ACCEL * dt, -spd, spd);
      this.facingRight = true;
    } else {
      // Decelerate
      if (Math.abs(this.vx) < 20) this.vx = 0;
      else this.vx -= sign(this.vx) * PLAYER_DECEL * dt;
    }

    // ── Jump input ────────────────────────────────────────────────
    if (inp.jumpPressed()) this._jumpBuf = JUMP_BUF_T;
    if (this._jumpBuf > 0) this._jumpBuf -= dt;

    const canJump = this.grounded || this._coyote > 0;

    if (this._jumpBuf > 0 && canJump) {
      this.vy = JUMP_VEL;
      this._jumpBuf  = 0;
      this._coyote   = 0;
      this._jumpHeld = 0;
      this._hasJumped2 = false;
      game.audio.jump();
      game.particles.jumpDust(this.x + this.w/2, this.y + this.h);
    } else if (inp.jumpPressed() && !canJump && this.canDoubleJump && !this._hasJumped2) {
      // Double jump
      this.vy = JUMP_VEL * 0.9;
      this._hasJumped2 = true;
      game.audio.doubleJump();
      game.particles.explosion(this.x + this.w/2, this.y + this.h, '#aa44ff', 10);
    }

    // Jump hold (variable height)
    if (inp.jump() && this.vy < 0) {
      this._jumpHeld += dt;
      if (this._jumpHeld < JUMP_HOLD_MAX) {
        this.vy += GRAVITY * (JUMP_HOLD_REDUCE - 1) * dt;
      }
    } else if (inp.jumpReleased()) {
      this._jumpHeld = JUMP_HOLD_MAX; // prevent further hold
    }

    // ── Shooting ──────────────────────────────────────────────────
    const cd = this.rapidFire ? SHOOT_CD_RAPID : SHOOT_CD;
    if (inp.shoot() && this._shootTimer <= 0) {
      this._shootTimer = cd;
      this._shootAnim  = 0.12;
      const bx = this.facingRight ? this.x + this.w : this.x - 20;
      const by = this.y + this.h * 0.35;
      game.projectiles.push(new PlayerBolt(bx, by, this.facingRight ? 1 : -1));
      game.audio.shoot();
    }

    // ── Gravity ───────────────────────────────────────────────────
    this.vy = clamp(this.vy + GRAVITY * dt, -9999, MAX_FALL);

    // ── Coyote time ───────────────────────────────────────────────
    if (this.grounded) this._coyote = COYOTE_T;
    else if (this._coyote > 0) this._coyote -= dt;

    const wasGrounded = this.grounded;
    this.grounded = false;

    // ── Move & collide (X then Y) ─────────────────────────────────
    this.x += this.vx * dt;
    this._resolveX(game.level);

    this.y += this.vy * dt;
    this._resolveY(game.level, wasGrounded, dt);

    // Clamping to world
    this.x = clamp(this.x, 0, game.level.worldW - this.w);
    if (this.y > game.level.worldH + 100) {
      // fell into pit
      this.hurt(game);
      this.x = game._spawnX;
      this.y = game._spawnY;
      this.vx = 0; this.vy = 0;
    }

    // Land effect
    if (!wasGrounded && this.grounded && this.vy >= -1) {
      this._landAnim = 0.15;
      game.audio.land();
      game.particles.landDust(this.x + this.w/2, this.y + this.h);
    }

    // ── Animation ─────────────────────────────────────────────────
    this._animTime += dt;
    this._shootAnim = Math.max(0, this._shootAnim - dt * 2);
    this._landAnim  = Math.max(0, this._landAnim  - dt * 4);

    if (this.grounded && Math.abs(this.vx) > 20) {
      const rate = Math.abs(this.vx) / PLAYER_SPEED;
      if (this._animTime > 0.1 / rate) {
        this._animTime = 0;
        this._animFrame = (this._animFrame + 1) % 4;
      }
    } else if (!this.grounded) {
      this._animFrame = 4; // jump/fall frame
    } else {
      this._animFrame = 0;
    }

    // Speed afterimage trail — spawn ghosts when moving fast
    if (Math.abs(this.vx) > PLAYER_SPEED * 0.82) {
      this._ghostTimer -= dt;
      if (this._ghostTimer <= 0) {
        this._ghostTimer = 0.045;
        this._ghosts.push({ x: this.x, y: this.y, life: 0.28, max: 0.28 });
      }
    }
    for (const g of this._ghosts) g.life -= dt;
    this._ghosts = this._ghosts.filter(g => g.life > 0);
  }

  _resolveX(level) {
    const tx0 = Math.floor(this.x / T);
    const tx1 = Math.floor((this.x + this.w - 1) / T);
    const ty0 = Math.floor(this.y / T);
    const ty1 = Math.floor((this.y + this.h - 1) / T);

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tile = level.getTile(tx, ty);
        if (tile !== 1) continue; // only solid
        const tileX = tx * T;
        // Moving right → hit left side of tile
        if (this.vx > 0 && this.x + this.w > tileX && this.x < tileX) {
          this.x  = tileX - this.w;
          this.vx = 0;
        }
        // Moving left → hit right side of tile
        if (this.vx < 0 && this.x < tileX + T && this.x + this.w > tileX + T) {
          this.x  = tileX + T;
          this.vx = 0;
        }
      }
    }
  }

  _resolveY(level, wasGrounded, dt = 0) {
    const tx0 = Math.floor(this.x / T);
    const tx1 = Math.floor((this.x + this.w - 1) / T);
    const ty0 = Math.floor(this.y / T);
    const ty1 = Math.floor((this.y + this.h - 1) / T);

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tile = level.getTile(tx, ty);
        if (tile === 0) continue;

        const tileY = ty * T;

        if (tile === 1) {
          // Solid: both directions
          if (this.vy > 0 && this.y + this.h > tileY && this._prevY + this.h <= tileY + 1) {
            this.y       = tileY - this.h;
            this.vy      = 0;
            this.grounded = true;
          }
          if (this.vy < 0 && this.y < tileY + T && this._prevY >= tileY + T) {
            this.y  = tileY + T;
            this.vy = 0;
          }
        } else if (tile === 2) {
          // One-way: only land from above
          if (this.vy > 0 && this.y + this.h > tileY && this._prevY + this.h <= tileY + 2) {
            this.y       = tileY - this.h;
            this.vy      = 0;
            this.grounded = true;
          }
        } else if (tile === 3) {
          // Spike → hurt (handled via spike check elsewhere, or here)
          // We call hurt from game loop, but mark grounded = false
        }
      }
    }

    // Moving platforms (mp.w is already in pixels)
    for (const mp of level.movingPlatforms) {
      if (this.vy >= 0 &&
          this.x + this.w > mp.x && this.x < mp.x + mp.w &&
          this.y + this.h > mp.y && this._prevY + this.h <= mp.y + 4) {
        this.y       = mp.y - this.h;
        this.vy      = 0;
        this.grounded = true;
        // Carry player with horizontal movement
        if (mp.axis === 'x') this.x += mp.vx * dt;
      }
    }
  }

  // Called when player stomp-lands on enemy
  stompBounce() { this.vy = STOMP_BOUNCE; }

  render(ctx) {
    if (this._dying) {
      this._renderDying(ctx);
      return;
    }

    // Speed afterimages (drawn behind the body)
    for (const g of this._ghosts) {
      const a = (g.life / g.max) * 0.4;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#00ddff';
      ctx.beginPath();
      ctx.roundRect(g.x + 2, g.y + 8, this.w - 4, this.h - 14, 8);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Invincibility blink
    if (this.invincible && Math.floor(this._hurtFlash * 12) % 2 === 0) return;

    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;

    // Squash/stretch
    const landSq   = this._landAnim / 0.15;
    const scaleX   = 1 + landSq * 0.25;
    const scaleY   = 1 - landSq * 0.2;
    const jumpStr  = !this.grounded && this.vy < 0 ? 0.12 : 0;
    const totalSX  = scaleX + jumpStr * -0.1;
    const totalSY  = scaleY + jumpStr * 0.12;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(totalSX, totalSY);
    if (!this.facingRight) ctx.scale(-1, 1);

    this._drawBody(ctx);

    ctx.restore();

    // Shield aura
    if (this.shielded) {
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.006);
      ctx.globalAlpha = 0.35 * pulse;
      const sg = ctx.createRadialGradient(cx, cy, 10, cx, cy, 32);
      sg.addColorStop(0, '#4488ff');
      sg.addColorStop(1, 'transparent');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(cx, cy, 32, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#88aaff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 * pulse;
      ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  _drawBody(ctx) {
    const f = this._animFrame;
    const shoot = this._shootAnim > 0;

    // Body shadow
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, PH/2 + 4, PW/2 + 2, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Aura glow
    const aura = ctx.createRadialGradient(0, 0, 4, 0, 0, 28);
    aura.addColorStop(0, 'rgba(0,200,255,0.22)');
    aura.addColorStop(1, 'rgba(0,100,255,0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();

    // Legs (animated)
    ctx.fillStyle = '#006699';
    const legY = PH/2 - 4;
    const legOff = [0, 6, 0, -6][f % 4];
    ctx.fillRect(-14, legY + legOff,     10, 12); // left leg
    ctx.fillRect(  4, legY - legOff,     10, 12); // right leg

    // Body
    const bodyGrad = ctx.createLinearGradient(-PW/2, -PH/2, PW/2, PH/2);
    bodyGrad.addColorStop(0, '#00ddff');
    bodyGrad.addColorStop(0.5, '#0099cc');
    bodyGrad.addColorStop(1, '#005588');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-PW/2 + 2, -PH/2 + 8, PW - 4, PH - 14, 8);
    ctx.fill();

    // Chest highlight
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(-4, -PH/2 + 18, 8, 12, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Arms
    ctx.fillStyle = '#0088bb';
    const armY = -PH/2 + 20;
    if (shoot) {
      // Right arm extended forward (shoot)
      ctx.fillRect(PW/2 - 2, armY - 3, 18, 8);
      // Energy ball at tip
      ctx.fillStyle = '#00ffff';
      ctx.beginPath(); ctx.arc(PW/2 + 16, armY + 1, 5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillRect(PW/2 - 2, armY, 10, 7);
    }
    ctx.fillStyle = '#0088bb';
    ctx.fillRect(-PW/2 - 8, armY, 10, 7); // left arm

    // Head
    const headGrad = ctx.createRadialGradient(-3, -PH/2 - 2, 3, 0, -PH/2, 14);
    headGrad.addColorStop(0, '#44eeff');
    headGrad.addColorStop(1, '#007799');
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(0, -PH/2 + 4, 14, 0, Math.PI * 2);
    ctx.fill();

    // Helmet ridge
    ctx.fillStyle = '#00aabb';
    ctx.fillRect(-6, -PH/2 - 4, 12, 6);
    ctx.beginPath(); ctx.arc(0, -PH/2 - 4, 6, Math.PI, 0); ctx.fill();

    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(5, -PH/2 + 2, 4.5, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-5, -PH/2 + 2, 3.5, 4, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#001133';
    ctx.beginPath(); ctx.arc(6, -PH/2 + 3, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-4.5, -PH/2 + 3, 2, 0, Math.PI * 2); ctx.fill();

    // Eye glow
    ctx.fillStyle = 'rgba(100,220,255,0.8)';
    ctx.beginPath(); ctx.arc(7, -PH/2 + 1, 1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-3.5, -PH/2 + 1, 0.8, 0, Math.PI * 2); ctx.fill();

    // Energy core (chest)
    const t = Date.now() * 0.003;
    ctx.fillStyle = `hsl(${190 + Math.sin(t)*20},100%,65%)`;
    ctx.beginPath(); ctx.arc(0, -4, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(-1, -5, 2, 0, Math.PI * 2); ctx.fill();
  }

  _renderDying(ctx) {
    const t = Math.min(this._deathAnim / 1.5, 1);
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    ctx.globalAlpha = 1 - t;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * Math.PI * 4);
    ctx.scale(1 - t * 0.5, 1 - t * 0.5);
    this._drawBody(ctx);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
