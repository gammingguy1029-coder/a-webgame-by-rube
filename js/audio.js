/* ============================================================
   audio.js — Web Audio API procedural sound + music.
   All sounds synthesized at runtime (no copyrighted assets).
   Autoplay is only unlocked after the first user interaction.
   ============================================================ */
(function (global) {
  'use strict';

  const AudioM = {
    ctx: null,
    masterGain: null,
    musicGain: null,
    sfxGain: null,
    started: false,
    musicTimer: null,
    _musicStep: 0,
    _musicOn: false,

    init() {
      if (this.started) return;
      try {
        const Ctx = global.AudioContext || global.webkitAudioContext;
        if (!Ctx) throw new Error('no audio');
        this.ctx = new Ctx();
        this.masterGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.musicGain.connect(this.masterGain);
        this.sfxGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
        this.started = true;
        this.applyVolumes();
        this.startMusic();
      } catch (e) {
        this.started = false;
      }
    },

    // Call on first user interaction to satisfy autoplay policies.
    unlock() {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(function () {});
      }
      if (!this.started) this.init();
      if (this.ctx && this.ctx.state === 'running' && !this._musicOn) this.startMusic();
    },

    applyVolumes() {
      if (!this.ctx) return;
      const s = Save.get().settings;
      this.masterGain.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.02);
      this.musicGain.gain.setTargetAtTime(s.musicVolume * 0.5, this.ctx.currentTime, 0.02);
      this.sfxGain.gain.setTargetAtTime(s.soundVolume, this.ctx.currentTime, 0.02);
    },

    onSettingsChange() { this.applyVolumes(); },

    _osc(type, freq, dur, vol, dest, slideTo) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfxGain);
      o.start(t); o.stop(t + dur + 0.05);
    },

    _noise(dur, vol, freq, q, dest) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter); filter.connect(g); g.connect(dest || this.sfxGain);
      src.start(t);
    },

    // ---- SFX ---------------------------------------------------
    play(name) {
      if (!this.started || !this.ctx) return;
      if (this.ctx.state !== 'running') return;
      const s = Save.get().settings;
      if (s.soundVolume <= 0) return;
      const v = 0.5;
      switch (name) {
        case 'click': this._osc('square', 700, 0.07, v, null, 1000); break;
        case 'jump': this._osc('square', 300, 0.18, 0.25, null, 650); break;
        case 'attack': this._noise(0.12, 0.3, 2200, 1.5); this._osc('sawtooth', 800, 0.1, 0.15, null, 300); break;
        case 'enemyHit': this._noise(0.09, 0.35, 1400, 2); this._osc('square', 400, 0.1, 0.2, null, 200); break;
        case 'enemyDeath': this._noise(0.25, 0.4, 800, 1); this._osc('triangle', 300, 0.25, 0.25, null, 60); break;
        case 'coin': this._osc('sine', 900, 0.09, 0.3, null, 1400); break;
        case 'chest': this._osc('triangle', 500, 0.2, 0.3, null, 900); this._osc('triangle', 750, 0.25, 0.25, null, 1200); break;
        case 'powerup': this._osc('sine', 400, 0.3, 0.3, null, 900); this._osc('sine', 600, 0.3, 0.25, null, 1300); break;
        case 'dash': this._noise(0.18, 0.35, 1200, 2.5); break;
        case 'damage': this._noise(0.15, 0.4, 500, 1.2); this._osc('sawtooth', 200, 0.15, 0.25, null, 90); break;
        case 'trap': this._noise(0.2, 0.4, 900, 1.5); break;
        case 'bossWarn': this._osc('sawtooth', 110, 0.5, 0.3, null, 90); this._osc('sawtooth', 140, 0.5, 0.3, null, 70); break;
        case 'bossHit': this._noise(0.2, 0.4, 700, 1); this._osc('square', 150, 0.2, 0.25, null, 80); break;
        case 'bossDeath': this._noise(0.9, 0.5, 400, 0.8); this._osc('sawtooth', 200, 0.9, 0.3, null, 30); break;
        case 'playerDeath': this._osc('sawtooth', 300, 0.8, 0.35, null, 40); this._noise(0.8, 0.4, 500, 0.8); break;
        case 'revive': this._osc('sine', 400, 0.5, 0.3, null, 1200); break;
        case 'charge': this._osc('square', 200, 0.4, 0.3, null, 500); break;
        case 'explosion': this._noise(0.5, 0.5, 300, 0.8); break;
        case 'shield': this._osc('sine', 500, 0.3, 0.25, null, 800); break;
        case 'levelup': this._osc('sine', 500, 0.12, 0.3, null, 800); setTimeout(() => { this._osc('sine', 750, 0.15, 0.3, null, 1000); }, 110); break;
      }
    },

    // ---- Music ---------------------------------------------------
    startMusic() {
      if (this._musicOn || !this.ctx) return;
      if (!Save.get().settings.musicVolume || Save.get().settings.musicVolume <= 0) return;
      this._musicOn = true;
      this._musicStep = 0;
      const stepTime = 0.28;
      // Minor pentatonic arpeggio — moody tower theme.
      const scale = [220, 261.6, 311.1, 369.9, 440, 523.3, 622.3];
      const playStep = () => {
        if (!this._musicOn) return;
        const base = scale[Math.floor(this._musicStep / 2) % scale.length];
        const note = base * (Math.floor(this._musicStep / 8) % 4 === 3 ? 1.5 : 1);
        this._musicTone(note, stepTime);
        this._musicTone(note * 2, stepTime, 0.05);
        this._musicStep++;
      };
      playStep();
      this.musicTimer = setInterval(playStep, stepTime * 1000);
    },

    _musicTone(freq, dur, vol) {
      if (!this.ctx) return;
      this._osc('triangle', freq, dur, vol !== undefined ? vol : 0.09, this.musicGain);
    },

    setMusicPlaying(on) {
      if (on) {
        // startMusic() sets _musicOn itself; don't set it here first or the
        // guard inside startMusic() will early-return and the interval is
        // never created (music would never resume after a pause).
        if (!this._musicOn) { this._musicStep = 0; this.startMusic(); }
      } else {
        this._musicOn = false;
        if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
      }
    },

    stopMusic() { this.setMusicPlaying(false); },
  };

  global.AudioM = AudioM;
})(window);
