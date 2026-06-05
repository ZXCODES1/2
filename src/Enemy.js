import { T, SC_STOMP, SC_SHOOT, CRAWLER_SPEED, BOUNCER_SPEED, SHOOTER_SPEED } from './constants.js';
import { rectOverlap, rnd, rndInt } from './utils.js';
import { EnemyBullet } from './Projectile.js';

// ── Base enemy ─────────────────────────────────────────────────────────────
class Enemy {
  constructor(tx, ty, w, h) {
    this.x    = tx * T + (T - w) / 2;
    this.y    = ty * T - h + T;
    this.w    = w;
    this.h    = h;
    this.vx   = 0;
    this.vy   = 0;
    this.dir  = 1;
    this.hp   = 1;
    this.dead = false;
    this.invincible = 0; // seconds of invincibility after hit
    this._time = rnd(0, Math.PI * 2);
    this._prevY = this.y;
    this.grounded = false;
  }

  takeDamage(dmg, game) {
    if (this.invincible > 0) return;
    this.hp -= dmg;
    this.invincible = 0.15;
    game.audio.enemyHit();
    game.camera.shake(4);
    if (this.hp <= 0) this._die(game);
  }

  _die(game) {
    this.dead = true;
    game.score += SC_SHOOT;
    game.audio.enemyDie();
    game.particles.explosion(this.x + this.w/2, this.y + this.h/2, this._deathColor(), 18);
    game.camera.shake(6);
  }

  _deathColor() { return '#ff6600'; }

  _applyGravity(dt) {
    this.vy = Math.min(this.vy + 2400 * dt, 900);
  }

  _resolveY(level) {
    this._prevY = this.y;
    this.grounded = false;
    this.y += this.vy;
    // Simple tile ground check at feet
    const cx = this.x + this.w / 2;
    const ty = Math.floor((this.y + this.h) / T);
    const tx = Math.floor(cx / T);
    const tile = level.getTile(tx, ty);
    const tileBelow = level.getTile(tx, ty + 1);
    if (tile === 1 || tile === 2) {
      this.y  = ty * T - this.h;
      this.vy = 0;
      this.grounded = true;
    }
  }

  _edgeCheck(level) {
    // Turn around at platform edge
    const frontX = this.dir > 0 ? this.x + this.w + 2 : this.x - 2;
    const footY  = this.y + this.h + 4;
    const tx = Math.floor(frontX / T);
    const ty = Math.floor(footY / T);
    const tileAhead = level.getTile(Math.floor(frontX / T), Math.floor(this.y / T));
    const tileBelow = level.getTile(tx, ty);
    if (tileAhead === 1 || tileBelow === 0) {
      this.dir = -this.dir;
      this.x  += this.dir * 2;
    }
  }

  _checkPlayerStomp(game) {
    const p = game.player;
    if (!rectOverlap(this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h)) return false;

    // Stomp: player falling + feet above enemy mid
    if (p.vy > 0 && p.y + p.h < this.y + this.h * 0.6) {
      this.takeDamage(1, game);
      if (this.hp <= 0) game.score += SC_STOMP - SC_SHOOT; // bonus
      p.stompBounce();
      game.audio.stomp();
      game.camera.shake(5);
      return true;
    }

    // Side collision → hurt player
    if (!p.invincible) {
      p.hurt(game);
    }
    return false;
  }

  // dt-stepped resolve for X
  _moveX(level, dt) {
    this.x += this.vx * dt;
    // Wall check
    const tx0 = Math.floor(this.x / T);
    const tx1 = Math.floor((this.x + this.w - 1) / T);
    const ty0 = Math.floor(this.y / T);
    const ty1 = Math.floor((this.y + this.h - 1) / T);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (level.getTile(tx, ty) !== 1) continue;
        const tileX = tx * T;
        if (this.vx > 0 && this.x + this.w > tileX) {
          this.x = tileX - this.w; this.vx = 0; this.dir = -1;
        } else if (this.vx < 0 && this.x < tileX + T) {
          this.x = tileX + T; this.vx = 0; this.dir = 1;
        }
      }
    }
  }

  _moveY(level, dt) {
    this._prevY = this.y;
    this.y += this.vy * dt;
    this.grounded = false;

    const tx0 = Math.floor(this.x / T);
    const tx1 = Math.floor((this.x + this.w - 1) / T);
    const ty0 = Math.floor(this.y / T);
    const ty1 = Math.floor((this.y + this.h - 1) / T);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tile = level.getTile(tx, ty);
        if (tile === 0) continue;
        const tileY = ty * T;
        if (tile === 1 || tile === 2) {
          if (this.vy > 0 && this.y + this.h > tileY && this._prevY + this.h <= tileY + 1) {
            this.y = tileY - this.h; this.vy = 0; this.grounded = true;
          }
          if (tile === 1 && this.vy < 0 && this.y < tileY + T && this._prevY >= tileY + T) {
            this.y = tileY + T; this.vy = 0;
          }
        }
      }
    }
  }

  render(ctx) {} // overridden
}

// ── Crawler: patrols ground ────────────────────────────────────────────────
export class Crawler extends Enemy {
  constructor(tx, ty) {
    super(tx, ty, 34, 28);
    this.vx = CRAWLER_SPEED;
    this._wobble = 0;
  }
  _deathColor() { return '#44ff44'; }

  update(dt, game) {
    this._time += dt * 3;
    this.invincible = Math.max(0, this.invincible - dt);

    this._applyGravity(dt);
    this._moveX(game.level, dt);
    this._moveY(game.level, dt);
    this._edgeCheck(game.level);
    this.vx = CRAWLER_SPEED * this.dir;

    this._checkPlayerStomp(game);

    // Fall off edge check
    if (this.y > game.level.worldH + 200) this.dead = true;
  }

  render(ctx) {
    if (this.dead) return;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const bob = Math.sin(this._time) * 2;
    const flash = this.invincible > 0 ? 0.6 : 1;

    ctx.globalAlpha = flash;

    // Shadow
    ctx.globalAlpha = 0.15 * flash;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(cx, this.y + this.h + 3, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = flash;

    // Body blob
    const bg = ctx.createRadialGradient(cx - 4, cy - 4 + bob, 2, cx, cy + bob, 18);
    bg.addColorStop(0, '#88ff66');
    bg.addColorStop(0.6, '#44cc22');
    bg.addColorStop(1, '#225511');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.ellipse(cx, cy + bob, 17, 15, 0, 0, Math.PI * 2); ctx.fill();

    // Spots
    ctx.fillStyle = 'rgba(0,100,0,0.35)';
    ctx.beginPath(); ctx.arc(cx - 5, cy + bob + 3, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 6, cy + bob + 2, 3, 0, Math.PI * 2); ctx.fill();

    // Eyes
    const eyeDir = this.dir;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(cx + eyeDir * 5, cy - 4 + bob, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + eyeDir * -2, cy - 4 + bob, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#001a00';
    ctx.beginPath(); ctx.arc(cx + eyeDir * 6, cy - 4 + bob, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + eyeDir * -1, cy - 4 + bob, 2, 0, Math.PI * 2); ctx.fill();

    // Legs (4 small blobs)
    ctx.fillStyle = '#33aa11';
    for (let i = 0; i < 4; i++) {
      const lx = cx - 12 + i * 8;
      const ly = this.y + this.h - 2 + Math.sin(this._time + i * 1.2) * 3;
      ctx.beginPath(); ctx.ellipse(lx, ly, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
    }

    ctx.globalAlpha = 1;
  }
}

// ── Bouncer: bouncing ball ──────────────────────────────────────────────────
export class Bouncer extends Enemy {
  constructor(tx, ty) {
    super(tx, ty, 32, 32);
    this.vx = BOUNCER_SPEED;
    this._bounceTimer = 0;
    this.hp = 2;
    this._rot = 0;
  }
  _deathColor() { return '#ff8800'; }

  update(dt, game) {
    this._time += dt * 4;
    this.invincible = Math.max(0, this.invincible - dt);

    this._bounceTimer -= dt;
    if (this._bounceTimer <= 0 && this.grounded) {
      this.vy = -620;
      this._bounceTimer = 0.5 + rnd(0, 0.3);
      game.audio.land(); // reuse land sound
    }

    this._applyGravity(dt);
    this._moveX(game.level, dt);
    this._moveY(game.level, dt);
    this._edgeCheck(game.level);
    this.vx = BOUNCER_SPEED * this.dir;
    this._rot += this.vx * dt * 0.04;

    this._checkPlayerStomp(game);
    if (this.y > game.level.worldH + 200) this.dead = true;
  }

  render(ctx) {
    if (this.dead) return;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const flash = this.invincible > 0 ? 0.55 : 1;

    ctx.globalAlpha = flash;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this._rot);

    // Body
    const bg = ctx.createRadialGradient(-5, -5, 2, 0, 0, 16);
    bg.addColorStop(0, '#ffcc44');
    bg.addColorStop(0.6, '#ff6600');
    bg.addColorStop(1, '#aa2200');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();

    // Spikes
    ctx.fillStyle = '#cc4400';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(-4, -20);
      ctx.lineTo(4, -20);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Eyes (angry)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(-5, -3, 4, 4.5, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(5, -3, 4, 4.5, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#220000';
    ctx.beginPath(); ctx.arc(-4, -2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(6, -2, 2, 0, Math.PI * 2); ctx.fill();

    // Angry eyebrows
    ctx.strokeStyle = '#440000';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-9,-7); ctx.lineTo(-2,-5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(9,-7); ctx.lineTo(2,-5); ctx.stroke();

    // HP indicator
    ctx.restore();
    if (this.hp > 1) {
      ctx.fillStyle = '#ffff00';
      ctx.beginPath(); ctx.arc(cx, cy - 24, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('2', cx, cy - 24);
    }

    ctx.globalAlpha = 1;
  }
}

// ── Shooter: turret enemy ─────────────────────────────────────────────────
export class Shooter extends Enemy {
  constructor(tx, ty) {
    super(tx, ty, 30, 38);
    this.vx = 0;
    this.hp = 3;
    this._shootTimer = 1.5 + rnd(0, 1);
    this._alertTimer = 0; // warning before shooting
    this._alert = false;
    this._range = 380; // detection range px
  }
  _deathColor() { return '#cc44ff'; }

  update(dt, game) {
    this._time += dt * 2;
    this.invincible = Math.max(0, this.invincible - dt);

    this._applyGravity(dt);
    this._moveY(game.level, dt);

    const p = game.player;
    const dx = (p.x + p.w/2) - (this.x + this.w/2);
    const dy = Math.abs((p.y + p.h/2) - (this.y + this.h/2));
    const inRange = Math.abs(dx) < this._range && dy < 120;

    if (inRange) {
      this.dir = dx > 0 ? 1 : -1;
      this._shootTimer -= dt;
      if (this._shootTimer <= 0.4 && !this._alert) {
        this._alert = true;
        this._alertTimer = 0.4;
      }
      if (this._alertTimer > 0) this._alertTimer -= dt;

      if (this._shootTimer <= 0) {
        this._shootTimer = 2 + rnd(0, 1);
        this._alert = false;
        // Fire at player
        const ox = this.x + (this.dir > 0 ? this.w + 2 : -12);
        const oy = this.y + this.h * 0.3;
        const speed = 230;
        const vx = this.dir * speed;
        // Slight aim toward player
        const dist = Math.sqrt(dx*dx + dy*dy);
        const vy = (p.y + p.h/2 - oy) / Math.max(dist, 1) * speed * 0.6;
        game.projectiles.push(new EnemyBullet(ox, oy, vx, vy));
        game.audio.shoot();
      }
    } else {
      this._alert = false;
    }

    this._checkPlayerStomp(game);
    if (this.y > game.level.worldH + 200) this.dead = true;
  }

  render(ctx) {
    if (this.dead) return;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const flash = this.invincible > 0 ? 0.5 : 1;

    ctx.globalAlpha = flash;

    // Body
    const bg = ctx.createLinearGradient(this.x, this.y, this.x + this.w, this.y + this.h);
    bg.addColorStop(0, '#8844cc');
    bg.addColorStop(1, '#441188');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(this.x + 2, this.y + 2, this.w - 4, this.h - 4, 5);
    ctx.fill();

    // Armour plates
    ctx.fillStyle = '#6633aa';
    ctx.fillRect(this.x + 4, this.y + 4, this.w - 8, 10);
    ctx.fillRect(this.x + 4, this.y + this.h - 14, this.w - 8, 10);

    // Cannon
    const cannonX = this.dir > 0 ? this.x + this.w - 2 : this.x + 2;
    const cannonW = 14 * this.dir;
    ctx.fillStyle = '#331155';
    ctx.fillRect(cannonX, this.y + this.h * 0.3 - 5, cannonW, 10);
    // Cannon tip glow (alert)
    if (this._alert) {
      const glow = 0.5 + 0.5 * Math.sin(this._alertTimer * 30);
      ctx.fillStyle = `rgba(255,150,0,${glow})`;
      ctx.beginPath();
      ctx.arc(cannonX + cannonW, this.y + this.h * 0.3, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Eye (single, helmet visor)
    ctx.fillStyle = '#220044';
    ctx.fillRect(this.x + 4, this.y + 8, this.w - 8, 12);
    const eyeGlow = 0.7 + 0.3 * Math.sin(this._time * 4);
    ctx.fillStyle = `rgba(200,100,255,${eyeGlow})`;
    ctx.fillRect(this.x + 6, this.y + 10, this.w - 12, 8);

    // HP bar
    const barW = (this.w - 4) * (this.hp / 3);
    ctx.fillStyle = '#220022';
    ctx.fillRect(this.x + 2, this.y - 10, this.w - 4, 5);
    ctx.fillStyle = '#cc44ff';
    ctx.fillRect(this.x + 2, this.y - 10, barW, 5);

    ctx.globalAlpha = 1;
  }
}
