export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this._musicNodes = [];
    this._musicPlaying = false;
    this._musicTheme = -1;
    this._bpm = 140;
    this._beat = 0;
    this._nextBeatTime = 0;
    this.muted = false;
  }

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this._gain(0.7);
      this.master.connect(this.ctx.destination);
      this.sfxBus   = this._gain(1.0); this.sfxBus.connect(this.master);
      this.musicBus  = this._gain(0.35); this.musicBus.connect(this.master);
    } catch(e) { console.warn('Audio init failed', e); }
  }

  _gain(v) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  _osc(type, freq, dest, vol, duration, attack=0.01, pitchEnd=null) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this._gain(0);
    o.connect(g); g.connect(dest);
    o.type = type;
    o.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (pitchEnd) o.frequency.exponentialRampToValueAtTime(pitchEnd, this.ctx.currentTime + duration);
    g.gain.setValueAtTime(0, this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    o.start();
    o.stop(this.ctx.currentTime + duration + 0.01);
  }

  _noise(dest, vol, duration) {
    if (!this.ctx) return;
    const buf  = this.ctx.createBuffer(1, this.ctx.sampleRate * duration, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this._gain(vol);
    src.connect(g); g.connect(dest);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    src.start(); src.stop(this.ctx.currentTime + duration);
  }

  // ── Sound effects ──────────────────────────────────────────────
  jump() {
    this._osc('square', 220, this.sfxBus, 0.22, 0.18, 0.005, 520);
    this._osc('sine',   330, this.sfxBus, 0.12, 0.12, 0.005, 660);
  }

  doubleJump() {
    this._osc('square', 440, this.sfxBus, 0.22, 0.18, 0.005, 880);
    this._osc('sine',   660, this.sfxBus, 0.15, 0.15, 0.005, 1100);
  }

  land() {
    this._noise(this.sfxBus, 0.08, 0.06);
    this._osc('sine', 80, this.sfxBus, 0.15, 0.08, 0.001, 40);
  }

  shoot() {
    this._osc('sawtooth', 600, this.sfxBus, 0.18, 0.15, 0.003, 200);
    this._osc('square',   400, this.sfxBus, 0.10, 0.12, 0.003, 150);
  }

  enemyHit() {
    this._osc('square', 300, this.sfxBus, 0.20, 0.10, 0.003, 180);
    this._noise(this.sfxBus, 0.06, 0.05);
  }

  enemyDie() {
    this._osc('square',  200, this.sfxBus, 0.25, 0.3, 0.003, 50);
    this._osc('sawtooth',400, this.sfxBus, 0.15, 0.2, 0.003, 80);
    this._noise(this.sfxBus, 0.12, 0.15);
  }

  stomp() {
    this._osc('sine',   100, this.sfxBus, 0.3, 0.12, 0.002, 50);
    this._noise(this.sfxBus, 0.15, 0.08);
  }

  playerHurt() {
    this._osc('square', 160, this.sfxBus, 0.35, 0.4, 0.003, 80);
    this._noise(this.sfxBus, 0.2, 0.2);
  }

  collectCrystal() {
    this._osc('sine', 880,  this.sfxBus, 0.15, 0.12, 0.005, 1320);
    this._osc('sine', 1100, this.sfxBus, 0.10, 0.10, 0.005, 1760);
  }

  collectPowerup() {
    [440,550,660,880].forEach((f,i) => {
      setTimeout(() => this._osc('sine', f, this.sfxBus, 0.20, 0.18, 0.005), i * 60);
    });
  }

  bossHit() {
    this._osc('sawtooth', 120, this.sfxBus, 0.35, 0.25, 0.002, 60);
    this._noise(this.sfxBus, 0.20, 0.15);
  }

  explosion() {
    this._noise(this.sfxBus, 0.45, 0.5);
    this._osc('sawtooth', 80, this.sfxBus, 0.35, 0.4, 0.002, 30);
  }

  levelComplete() {
    [523,659,784,1047].forEach((f,i) => setTimeout(() => this._osc('sine', f, this.sfxBus, 0.25, 0.3, 0.005), i * 100));
  }

  gameOver() {
    [440,330,220,165].forEach((f,i) => setTimeout(() => this._osc('square', f, this.sfxBus, 0.25, 0.35, 0.005), i * 150));
  }

  // ── Procedural music ───────────────────────────────────────────
  startMusic(theme = 0) {
    if (!this.ctx || this._musicPlaying && this._musicTheme === theme) return;
    this.stopMusic();
    this._musicPlaying = true;
    this._musicTheme   = theme;
    this._beat = 0;
    this._nextBeatTime = this.ctx.currentTime + 0.05;
    this._scheduleMusic();
  }

  stopMusic() {
    this._musicPlaying = false;
    this._musicNodes.forEach(n => { try { n.stop(); } catch(e){} });
    this._musicNodes = [];
  }

  _scheduleMusic() {
    if (!this._musicPlaying) return;
    const SEC_PER_BEAT = 60 / this._bpm;
    const now = this.ctx.currentTime;
    while (this._nextBeatTime < now + 0.3) {
      this._playBeat(this._beat, this._nextBeatTime);
      this._beat++;
      this._nextBeatTime += SEC_PER_BEAT;
    }
    setTimeout(() => this._scheduleMusic(), 100);
  }

  // Theme 0 = level1, theme 1 = level2, theme 2 = boss
  _playBeat(beat, t) {
    const theme = this._musicTheme;
    const b = beat % 16;
    const b8 = beat % 8;

    // Bass patterns
    const bassNote = theme === 2
      ? [55,55,55,82,55,55,65,55,55,55,55,82,55,55,73,55][b]
      : theme === 1
      ? [65,65,65,82,65,65,73,65,65,65,65,82,65,65,98,65][b]
      : [110,110,110,147,110,110,131,110,110,110,110,147,110,110,165,110][b];

    if (bassNote) {
      const dur = 60 / this._bpm * 0.9;
      this._schedOsc('triangle', bassNote, this.musicBus, 0.3, t, dur);
    }

    // Melody patterns (every 2 beats)
    if (b % 2 === 0) {
      const melodies = theme === 2
        ? [220,196,220,246,196,220,196,174]
        : theme === 1
        ? [330,294,330,370,294,330,370,294]
        : [440,494,523,440,494,440,392,440];
      const mf = melodies[b8 >> 1];
      if (mf) this._schedOsc('square', mf, this.musicBus, 0.12, t, 60 / this._bpm * 1.8);
    }

    // Hi-hat every beat
    if (b % 2 === 0) this._schedNoise(this.musicBus, 0.04, t, 0.04);

    // Kick on 0 and 8
    if (b === 0 || b === 8) {
      this._schedOsc('sine', 80, this.musicBus, 0.45, t, 0.12);
    }
    // Snare on 4 and 12
    if (b === 4 || b === 12) {
      this._schedNoise(this.musicBus, 0.18, t, 0.08);
    }
  }

  _schedOsc(type, freq, dest, vol, when, dur) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this._gain(0);
    o.connect(g); g.connect(dest);
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.start(when); o.stop(when + dur + 0.01);
    this._musicNodes.push(o);
  }

  _schedNoise(dest, vol, when, dur) {
    if (!this.ctx) return;
    const buf  = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this._gain(vol);
    src.connect(g); g.connect(dest);
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.start(when); src.stop(when + dur);
    this._musicNodes.push(src);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
}
