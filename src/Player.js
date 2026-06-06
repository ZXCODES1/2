import {
  PW, PH, GRAVITY, MAX_FALL, JUMP_VEL, JUMP_HOLD_REDUCE, JUMP_HOLD_MAX,
  PLAYER_SPEED, PLAYER_ACCEL, PLAYER_DECEL, COYOTE_T, JUMP_BUF_T,
  INVINCIBLE_T, SHOOT_CD, SHOOT_CD_RAPID, STOMP_BOUNCE, T,
  DASH_CD, DASH_DUR, DASH_SPD, PROJ_SPEED
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

    this.grounded     = false;
    this.facingRight  = true;
    this._coyote      = 0;
    this._jumpBuf     = 0;
    this._jumpHeld    = 0;
    this._wasGrounded = false;
    this._prevY       = 0;

    this.invincible = false;
    this._invTimer  = 0;

    // Power-ups: name → remaining seconds (multiple active simultaneously)
    this.power = {};  // rapidFire | spread | shield | doubleJump | magnet | speed
    this._hasJumped2 = false;

    this._shootTimer = 0;

    // Dash — core ability, always available (Shift key)
    this._dashCD    = 0;
    this._dashTimer = 0;
    this.dashing    = false;
    this._dashDir   = 1;

    // Animation
    this._animTime  = 0;
    this._animFrame = 0;
    this._shootAnim = 0;
    this._hurtFlash = 0;
    this._landAnim  = 0;
    this._deathAnim = 0;

    this.dead   = false;
    this._dying = false;

    // Speed afterimage trail
    this._ghosts     = [];
    this._ghostTimer = 0;
  }

  hurt(game) {
    if (this.invincible || this._dying) return;

    if (this.power.shield > 0) {
      delete this.power.shield;
      game.audio.collectPowerup();
      game.particles.explosion(this.x + this.w/2, this.y + this.h/2, '#0066ff', 14);
      game.camera.shake(6);
      game.flash('#4488ff', 0.4);
      return;
    }

    game.lives--;
    game.audio.playerHurt();
    game.camera.shake(14);
    game.flash('#ff2222', 0.35);
    game.particles.hurt(this.x + this.w/2, this.y + this.h/2);

    this.invincible = true;
    this._invTimer  = INVINCIBLE_T;
    this._hurtFlash = 0;
    this.vy = -300;
    this.vx = this.facingRight ? -150 : 150;

    if (game.lives <= 0) {
      this._dying     = true;
      this._deathAnim = 0;
    }
  }

  update(dt, game) {
    const inp = game.input;

    if (this._dying) {
      this._deathAnim += dt;
      this.vy += GRAVITY * dt;
      this.y  += this.vy * dt;
      if (this._deathAnim > 1.5) this.dead = true;
      return;
    }

    this._prevY = this.y;

    // Decay all power-up timers simultaneously
    for (const key of Object.keys(this.power)) {
      this.power[key] -= dt;
      if (this.power[key] <= 0) delete this.power[key];
    }

    // Invincibility
    if (this.invincible) {
      this._invTimer  -= dt;
      this._hurtFlash += dt;
      if (this._invTimer <= 0) this.invincible = false;
    }

    // Shoot cooldown
    this._shootTimer = Math.max(0, this._shootTimer - dt);

    // ── Dash (Shift key, always available) ───────────────────────
    this._dashCD = Math.max(0, this._dashCD - dt);
    if (inp.dash() && this._dashCD <= 0 && this._dashTimer <= 0) {
      this._dashDir   = this.facingRight ? 1 : -1;
      this._dashTimer = DASH_DUR;
      this._dashCD    = DASH_CD;
      this.dashing    = true;
      this.invincible = true;
      this._invTimer  = Math.max(this._invTimer, DASH_DUR + 0.06);
      game.particles.explosion(this.x + this.w/2, this.y + this.h/2, '#00ddff', 10);
      game.flash('#00ddff', 0.08);
    }

    if (this._dashTimer > 0) {
      this._dashTimer -= dt;
      this.vy  = 0;
      this.vx  = this._dashDir * DASH_SPD;
      if (this._dashTimer <= 0) {
        this.dashing = false;
        this.vx = this._dashDir * 220;
      }
    }

    // ── Horizontal movement ───────────────────────────────────────
    if (!this.dashing) {
      const spd = PLAYER_SPEED * (this.power.speed > 0 ? 1.65 : this.power.rapidFire > 0 ? 1.3 : 1);
      if (inp.left()) {
        this.vx = clamp(this.vx - PLAYER_ACCEL * dt, -spd, spd);
        this.facingRight = false;
      } else if (inp.right()) {
        this.vx = clamp(this.vx + PLAYER_ACCEL * dt, -spd, spd);
        this.facingRight = true;
      } else {
        if (Math.abs(this.vx) < 20) this.vx = 0;
        else this.vx -= sign(this.vx) * PLAYER_DECEL * dt;
      }
    }

    // ── Jump input ────────────────────────────────────────────────
    if (inp.jumpPressed()) this._jumpBuf = JUMP_BUF_T;
    if (this._jumpBuf > 0) this._jumpBuf -= dt;

    const canJump = this.grounded || this._coyote > 0;

    if (this._jumpBuf > 0 && canJump) {
      this.vy = JUMP_VEL;
      this._jumpBuf    = 0;
      this._coyote     = 0;
      this._jumpHeld   = 0;
      this._hasJumped2 = false;
      game.audio.jump();
      game.particles.jumpDust(this.x + this.w/2, this.y + this.h);
    } else if (inp.jumpPressed() && !canJump && this.power.doubleJump > 0 && !this._hasJumped2) {
      this.vy = JUMP_VEL * 0.9;
      this._hasJumped2 = true;
      game.audio.doubleJump();
      game.particles.explosion(this.x + this.w/2, this.y + this.h, '#aa44ff', 10);
    }

    if (inp.jump() && this.vy < 0) {
      this._jumpHeld += dt;
      if (this._jumpHeld < JUMP_HOLD_MAX) {
        this.vy += GRAVITY * (JUMP_HOLD_REDUCE - 1) * dt;
      }
    } else if (inp.jumpReleased()) {
      this._jumpHeld = JUMP_HOLD_MAX;
    }

    // ── Shooting ──────────────────────────────────────────────────
    const cd = this.power.rapidFire > 0 ? SHOOT_CD_RAPID : SHOOT_CD;
    if (inp.shoot() && this._shootTimer <= 0) {
      this._shootTimer = cd;
      this._shootAnim  = 0.12;
      const bx  = this.facingRight ? this.x + this.w : this.x - 20;
      const by  = this.y + this.h * 0.35;
      const dir = this.facingRight ? 1 : -1;
      if (this.power.spread > 0) {
        for (let i = -1; i <= 1; i++) {
          game.projectiles.push(new PlayerBolt(bx, by, dir, i * 0.32 * PROJ_SPEED));
        }
      } else {
        game.projectiles.push(new PlayerBolt(bx, by, dir, 0));
      }
      game.audio.shoot();
    }

    // ── Gravity ───────────────────────────────────────────────────
    if (!this.dashing) {
      this.vy = clamp(this.vy + GRAVITY * dt, -9999, MAX_FALL);
    }

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

    // Clamp to world
    this.x = clamp(this.x, 0, game.level.worldW - this.w);
    if (this.y > game.level.worldH + 100) {
      this.hurt(game);
      this.x  = game._spawnX;
      this.y  = game._spawnY;
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
      this._animFrame = 4;
    } else {
      this._animFrame = 0;
    }

    // Ghost trail (speed afterimage + dash)
    if (this.dashing || Math.abs(this.vx) > PLAYER_SPEED * 0.82) {
      this._ghostTimer -= dt;
      if (this._ghostTimer <= 0) {
        this._ghostTimer = this.dashing ? 0.022 : 0.045;
        this._ghosts.push({ x: this.x, y: this.y, life: 0.28, max: 0.28, dash: this.dashing });
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
        if (tile !== 1) continue;
        const tileX = tx * T;
        if (this.vx > 0 && this.x + this.w > tileX && this.x < tileX) {
          this.x  = tileX - this.w; this.vx = 0;
        }
        if (this.vx < 0 && this.x < tileX + T && this.x + this.w > tileX + T) {
          this.x  = tileX + T; this.vx = 0;
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
          if (this.vy > 0 && this.y + this.h > tileY && this._prevY + this.h <= tileY + 1) {
            this.y = tileY - this.h; this.vy = 0; this.grounded = true;
          }
          if (this.vy < 0 && this.y < tileY + T && this._prevY >= tileY + T) {
            this.y = tileY + T; this.vy = 0;
          }
        } else if (tile === 2) {
          if (this.vy > 0 && this.y + this.h > tileY && this._prevY + this.h <= tileY + 2) {
            this.y = tileY - this.h; this.vy = 0; this.grounded = true;
          }
        }
      }
    }

    for (const mp of level.movingPlatforms) {
      if (this.vy >= 0 &&
          this.x + this.w > mp.x && this.x < mp.x + mp.w &&
          this.y + this.h > mp.y && this._prevY + this.h <= mp.y + 4) {
        this.y       = mp.y - this.h;
        this.vy      = 0;
        this.grounded = true;
        if (mp.axis === 'x') this.x += mp.vx * dt;
      }
    }
  }

  stompBounce() { this.vy = STOMP_BOUNCE; }

  render(ctx) {
    if (this._dying) { this._renderDying(ctx); return; }

    // Speed afterimages
    for (const g of this._ghosts) {
      const a = (g.life / g.max) * 0.42;
      ctx.globalAlpha = a;
      ctx.fillStyle = g.dash ? '#ff44ff' : '#00ddff';
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
    const landSq  = this._landAnim / 0.15;
    const scaleX  = 1 + landSq * 0.25;
    const scaleY  = 1 - landSq * 0.2;
    const jumpStr = !this.grounded && this.vy < 0 ? 0.12 : 0;
    const totalSX = scaleX + jumpStr * -0.1;
    const totalSY = scaleY + jumpStr * 0.12;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(totalSX, totalSY);
    if (!this.facingRight) ctx.scale(-1, 1);
    this._drawBody(ctx);
    ctx.restore();

    // Dash aura
    if (this.dashing) {
      ctx.globalAlpha = 0.5;
      const dg = ctx.createRadialGradient(cx, cy, 4, cx, cy, 36);
      dg.addColorStop(0, '#ff44ff');
      dg.addColorStop(1, 'transparent');
      ctx.fillStyle = dg;
      ctx.beginPath(); ctx.arc(cx, cy, 36, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Speed power aura
    if (this.power.speed > 0) {
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.01);
      ctx.globalAlpha = 0.28 * pulse;
      const sg = ctx.createRadialGradient(cx, cy, 6, cx, cy, 38);
      sg.addColorStop(0, '#ffee00');
      sg.addColorStop(1, 'transparent');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(cx, cy, 38, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Shield aura
    if (this.power.shield > 0) {
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

    // Magnet field
    if (this.power.magnet > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.008);
      ctx.globalAlpha = 0.18 * pulse;
      ctx.strokeStyle = '#ff44ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.arc(cx, cy, 160, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Dash cooldown indicator (small arc below player)
    if (this._dashCD > 0) {
      const frac = 1 - this._dashCD / DASH_CD;
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, this.y + this.h + 6, 10, -Math.PI/2, -Math.PI/2 + frac * Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  _drawBody(ctx) {
    const f     = this._animFrame;
    const shoot = this._shootAnim > 0;

    // Shadow
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

    // Legs
    ctx.fillStyle = '#006699';
    const legY   = PH/2 - 4;
    const legOff = [0, 6, 0, -6][f % 4];
    ctx.fillRect(-14, legY + legOff, 10, 12);
    ctx.fillRect(  4, legY - legOff, 10, 12);

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
      ctx.fillRect(PW/2 - 2, armY - 3, 18, 8);
      ctx.fillStyle = '#00ffff';
      ctx.beginPath(); ctx.arc(PW/2 + 16, armY + 1, 5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillRect(PW/2 - 2, armY, 10, 7);
    }
    ctx.fillStyle = '#0088bb';
    ctx.fillRect(-PW/2 - 8, armY, 10, 7);

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

    ctx.fillStyle = 'rgba(100,220,255,0.8)';
    ctx.beginPath(); ctx.arc(7, -PH/2 + 1, 1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-3.5, -PH/2 + 1, 0.8, 0, Math.PI * 2); ctx.fill();

    // Energy core
    const t = Date.now() * 0.003;
    ctx.fillStyle = `hsl(${190 + Math.sin(t)*20},100%,65%)`;
    ctx.beginPath(); ctx.arc(0, -4, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(-1, -5, 2, 0, Math.PI * 2); ctx.fill();
  }

  _renderDying(ctx) {
    const t  = Math.min(this._deathAnim / 1.5, 1);
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
