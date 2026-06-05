import { W, H, PLAYER_LIVES } from './constants.js';

export class UI {
  constructor() {
    this._transAlpha = 0; // for level transition fade
    this._transDir   = 0; // +1 fade in, -1 fade out
  }

  render(ctx, game) {
    switch (game.state) {
      case 'start':    this._drawStart(ctx, game); break;
      case 'playing':  this._drawHUD(ctx, game); break;
      case 'paused':   this._drawHUD(ctx, game); this._drawPause(ctx); break;
      case 'gameover': this._drawHUD(ctx, game); this._drawGameOver(ctx, game); break;
      case 'win':      this._drawHUD(ctx, game); this._drawWin(ctx, game); break;
      case 'transition': this._drawTransition(ctx, game); break;
      case 'bossIntro': this._drawBossIntro(ctx, game); break;
    }
  }

  update(dt, game) {
    if (game.state === 'transition') {
      this._transAlpha += dt * (this._transDir > 0 ? 2.5 : -2.5);
      this._transAlpha = Math.max(0, Math.min(1, this._transAlpha));
    }
  }

  startFadeIn()  { this._transDir = 1; this._transAlpha = 0; }
  startFadeOut() { this._transDir = -1; this._transAlpha = 1; }

  // ── HUD ────────────────────────────────────────────────────────
  _drawHUD(ctx, game) {
    // Background strip
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, 44);

    // Lives
    for (let i = 0; i < 5; i++) {
      const filled = i < game.lives;
      const hx = 14 + i * 28;
      ctx.fillStyle = filled ? '#ff2244' : 'rgba(255,34,68,0.2)';
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('♥', hx, 22);
    }

    // Score
    ctx.fillStyle = '#00ffcc';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${game.score.toString().padStart(7, '0')}`, W / 2, 22);

    // Level name
    ctx.fillStyle = 'rgba(180,200,255,0.7)';
    ctx.font = '12px monospace';
    ctx.fillText(game.level?.data.name || '', W / 2, 38);

    // Active power-up
    const p = game.player;
    if (p && p.activePowerUp && p.powerUpTimer > 0) {
      ctx.textAlign = 'right';
      const icons = { doubleJump:'✦ DOUBLE', rapidFire:'⚡ RAPID', shield:'◈ SHIELD' };
      const label = icons[p.activePowerUp] || p.activePowerUp;
      const frac  = p.powerUpTimer / 20;
      ctx.fillStyle = '#ffcc00';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(label, W - 14, 16);
      // Timer bar
      ctx.fillStyle = 'rgba(255,200,0,0.25)';
      ctx.fillRect(W - 120, 24, 106, 6);
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(W - 120, 24, 106 * Math.min(frac, 1), 6);
    }

    // Controls hint (first 5 seconds)
    if (game._hintTimer > 0) {
      ctx.globalAlpha = Math.min(game._hintTimer, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, H - 36, W, 36);
      ctx.fillStyle = '#aaccff';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('← → / A D = Move   SPACE / W = Jump   Z / J = Shoot   P = Pause', W/2, H - 18);
      ctx.globalAlpha = 1;
    }
  }

  // ── Start screen ───────────────────────────────────────────────
  _drawStart(ctx, game) {
    const t = Date.now() * 0.001;

    // Title glow
    ctx.globalAlpha = 0.15 + 0.05 * Math.sin(t * 2);
    const g = ctx.createRadialGradient(W/2, H/2, 20, W/2, H/2, 300);
    g.addColorStop(0, '#00aaff');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    // Title
    ctx.save();
    ctx.translate(W/2, H/2 - 80 + Math.sin(t * 1.5) * 6);
    const tg = ctx.createLinearGradient(-200, -40, 200, 40);
    tg.addColorStop(0, '#00ffcc');
    tg.addColorStop(0.5, '#00aaff');
    tg.addColorStop(1, '#aa44ff');
    ctx.fillStyle = tg;
    ctx.font = 'bold 72px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00aaff';
    ctx.shadowBlur = 30;
    ctx.fillText('NEBULA DASH', 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();

    // Subtitle
    ctx.fillStyle = 'rgba(180,220,255,0.8)';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A COSMIC ADVENTURE', W/2, H/2 - 20);

    // Press to start (blink)
    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = '#00ffcc';
      ctx.font = 'bold 20px monospace';
      ctx.fillText('▶  PRESS SPACE TO START  ◀', W/2, H/2 + 40);
    }

    // Controls
    ctx.fillStyle = 'rgba(150,180,220,0.7)';
    ctx.font = '13px monospace';
    ctx.fillText('← → Move   SPACE Jump   Z Shoot   P Pause', W/2, H/2 + 90);

    // Small character preview
    this._drawNovaPrev(ctx, W/2 - 200, H/2 + 20, t);

    // Version
    ctx.fillStyle = 'rgba(100,130,180,0.5)';
    ctx.font = '11px monospace';
    ctx.fillText('3 LEVELS  •  BOSS FIGHT  •  POWER-UPS', W/2, H - 20);
  }

  _drawNovaPrev(ctx, x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(0.7, 0.7);
    // Simple silhouette
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 36);
    glow.addColorStop(0, 'rgba(0,220,255,0.3)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, 36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#00ccee';
    ctx.beginPath(); ctx.roundRect(-18, -22, 36, 44, 8); ctx.fill();
    ctx.fillStyle = '#00aabb';
    ctx.beginPath(); ctx.arc(0, -26, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(5, -28, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ── Pause screen ───────────────────────────────────────────────
  _drawPause(ctx) {
    ctx.fillStyle = 'rgba(0,5,20,0.7)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#00ffcc';
    ctx.font = 'bold 52px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 20;
    ctx.fillText('PAUSED', W/2, H/2 - 20);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(180,220,255,0.7)';
    ctx.font = '18px monospace';
    ctx.fillText('Press P or ESC to resume', W/2, H/2 + 40);
  }

  // ── Game over ──────────────────────────────────────────────────
  _drawGameOver(ctx, game) {
    const t = Date.now() * 0.001;
    ctx.fillStyle = 'rgba(20,0,5,0.8)';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W/2, H/2 - 40 + Math.sin(t) * 4);
    const g = ctx.createLinearGradient(-200, -30, 200, 30);
    g.addColorStop(0, '#ff2244');
    g.addColorStop(1, '#ff6600');
    ctx.fillStyle = g;
    ctx.font = 'bold 64px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff2244';
    ctx.shadowBlur = 25;
    ctx.fillText('GAME OVER', 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();

    ctx.fillStyle = '#00ffcc';
    ctx.font = '22px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Score: ${game.score}`, W/2, H/2 + 30);

    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = 'rgba(200,220,255,0.9)';
      ctx.font = '18px monospace';
      ctx.fillText('Press SPACE to retry', W/2, H/2 + 75);
    }
  }

  // ── Win / Victory ──────────────────────────────────────────────
  _drawWin(ctx, game) {
    const t = Date.now() * 0.001;
    ctx.fillStyle = 'rgba(0,5,10,0.75)';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W/2, H/2 - 60 + Math.sin(t * 1.2) * 5);
    const g = ctx.createLinearGradient(-250, -40, 250, 40);
    g.addColorStop(0, '#00ffcc');
    g.addColorStop(0.5, '#44aaff');
    g.addColorStop(1, '#aa44ff');
    ctx.fillStyle = g;
    ctx.font = 'bold 56px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 30;
    ctx.fillText('VICTORY!', 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();

    ctx.fillStyle = '#ffcc00';
    ctx.font = '20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('The galaxy is saved!', W/2, H/2 - 4);

    ctx.fillStyle = '#00ffcc';
    ctx.font = '24px monospace';
    ctx.fillText(`Final Score: ${game.score}`, W/2, H/2 + 34);

    // Stars cascade
    for (let i = 0; i < 5; i++) {
      const sx = W/2 - 80 + i * 40;
      ctx.fillStyle = '#ffdd00';
      ctx.font = '28px sans-serif';
      ctx.fillText('★', sx, H/2 + 75);
    }

    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = 'rgba(200,220,255,0.9)';
      ctx.font = '16px monospace';
      ctx.fillText('Press SPACE to return to menu', W/2, H/2 + 120);
    }
  }

  // ── Level transition ───────────────────────────────────────────
  _drawTransition(ctx, game) {
    this._drawHUD(ctx, game);
    ctx.fillStyle = `rgba(0,5,20,${this._transAlpha})`;
    ctx.fillRect(0, 0, W, H);

    if (this._transAlpha > 0.5) {
      const next = game._nextLevelName || '';
      ctx.fillStyle = `rgba(0,255,200,${(this._transAlpha - 0.5) * 2})`;
      ctx.font = 'bold 36px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Level ${game.currentLevelIndex + 1}: ${next}`, W/2, H/2);
    }
  }

  // ── Boss intro ────────────────────────────────────────────────
  _drawBossIntro(ctx, game) {
    this._drawHUD(ctx, game);
    const t = Date.now() * 0.001;
    ctx.fillStyle = `rgba(20,0,0,${0.5 + 0.2 * Math.sin(t * 8)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ff2200';
    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff4400';
    ctx.shadowBlur = 20;
    ctx.fillText('⚠  BOSS APPROACHING  ⚠', W/2, H/2);
    ctx.shadowBlur = 0;
  }
}
