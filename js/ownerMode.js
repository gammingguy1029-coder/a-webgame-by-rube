/* ============================================================
   ownerMode.js — hidden OWNER / ADMIN mode (developer feature).

   IMPORTANT: This is a fully CLIENT-SIDE feature. It is NOT real
   security. The owner password lives in the shipped JS and can be
   read by anyone with the source. Treat this as a private
   developer/testing mode only. Never claim it is secure.

   Kept isolated: the rest of the game talks to OwnerMode only
   through a tiny public API (init, active, infiniteHealthOn,
   update, drawBehind, and a hook in player damage). All effects
   are session-only and fully cleaned up on exit.
   ============================================================ */
(function (global) {
  'use strict';

  const OWNER_PASSWORD = 'rubethegreat';
  const YT_VIDEO_ID = 'e6gSUVduayY';

  const OwnerMode = {
    // ---- public state ----
    active: false,

    // ---- internal toggles ----
    infiniteHealth: false,
    auraOn: false,
    musicOn: false,

    // ---- internal UI/state guards (input-spam protection) ----
    _passOpen: false,
    _panelOpen: false,
    _initDone: false,

    // ---- aura state ----
    _auraT: 0,
    _auraParts: [],

    // ---- youtube state ----
    _ytLoading: false,
    _ytPlayer: null,

    // =====================================================
    // INIT (called once from Game.init)
    // =====================================================
    init() {
      if (this._initDone) return;
      this._initDone = true;

      const btn = document.getElementById('ownerBtn');
      if (btn) btn.addEventListener('click', () => this.onOwnerButton());

      // password dialog
      document.getElementById('ownerPassEnter').addEventListener('click', () => this.submitPassword());
      document.getElementById('ownerPassCancel').addEventListener('click', () => this.closePass());
      const passInput = document.getElementById('ownerPassInput');
      if (passInput) {
        passInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); this.submitPassword(); }
          if (e.key === 'Escape') this.closePass();
        });
      }

      // panel toggles
      this._bindToggle('owInfHealth', 'infiniteHealth');
      this._bindToggle('owAura', 'aura');
      this._bindToggle('owMusic', 'music');

      document.getElementById('owResetEffects').addEventListener('click', () => this.resetEffects());
      document.getElementById('owExit').addEventListener('click', () => this.exitOwnerMode());
      document.getElementById('ownerPanelClose').addEventListener('click', () => this.closePanel());

      // owner music autoplay hint
      const hint = document.getElementById('ownerMusicHint');
      if (hint) hint.addEventListener('click', () => this.unmuteMusic());
    },

    _bindToggle(id, key) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', () => {
        const next = !this[key];
        this.setToggle(key, next);
      });
    },

    // =====================================================
    // OWNER BUTTON
    // =====================================================
    onOwnerButton() {
      // Never directly grant powers; guard against spam.
      if (this._passOpen) return;
      if (this.active) {
        this.openPanel();          // already authed -> reopen panel
      } else {
        this.openPass();
      }
    },

    openPass() {
      if (this._passOpen) return;
      this._passOpen = true;
      const msg = document.getElementById('ownerPassMsg');
      if (msg) { msg.textContent = ''; msg.className = 'op-msg'; }
      document.getElementById('ownerPassOverlay').classList.remove('hidden');
      const input = document.getElementById('ownerPassInput');
      if (input) { input.value = ''; setTimeout(() => { try { input.focus(); } catch (e) {} }, 30); }
    },

    closePass() {
      this._passOpen = false;
      document.getElementById('ownerPassOverlay').classList.add('hidden');
    },

    submitPassword() {
      const input = document.getElementById('ownerPassInput');
      const msg = document.getElementById('ownerPassMsg');
      const val = input ? input.value : '';
      if (val === OWNER_PASSWORD) {
        if (msg) { msg.textContent = 'OWNER ACCESS GRANTED'; msg.className = 'op-msg granted'; }
        this.closePass();
        this.activate();
      } else {
        if (msg) { msg.textContent = 'ACCESS DENIED'; msg.className = 'op-msg denied'; }
        if (input) input.value = '';
      }
    },

    activate() {
      this.active = true;
      this._refreshOwnerButton();
      this.openPanel();
    },

    // =====================================================
    // PANEL
    // =====================================================
    openPanel() {
      if (this._panelOpen) return;
      this._panelOpen = true;
      // hide the menu screen behind the panel
      const menu = document.getElementById('menuScreen');
      if (menu) menu.classList.add('hidden');
      document.getElementById('ownerPanelScreen').classList.remove('hidden');
      this._syncToggles();
    },

    closePanel() {
      this._panelOpen = false;
      document.getElementById('ownerPanelScreen').classList.add('hidden');
      // return to main menu (owner mode stays active / session persists)
      const menu = document.getElementById('menuScreen');
      if (menu && global.Game) menu.classList.remove('hidden');
    },

    _syncToggles() {
      this._setToggleClass('owInfHealth', this.infiniteHealth);
      this._setToggleClass('owAura', this.auraOn);
      this._setToggleClass('owMusic', this.musicOn);
    },

    _setToggleClass(id, on) {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('on', !!on);
    },

    // =====================================================
    // TOGGLES
    // =====================================================
    setToggle(key, value) {
      switch (key) {
        case 'infiniteHealth':
          this.infiniteHealth = value;
          if (value && global.Player && Player.alive) {
            Player.health = Player.maxHealth; // keep full
          }
          break;
        case 'aura':
          this.setAura(value);
          break;
        case 'music':
          this.setMusic(value);
          break;
      }
      this._syncToggles();
    },

    // =====================================================
    // INFINITE HEALTH (admin override; never NaN/Infinity)
    // =====================================================
    infiniteHealthOn() {
      return this.active && this.infiniteHealth;
    },

    // Hook called from Player.takeDamage before applying damage.
    // Returns true if the hit was fully absorbed (health kept at max).
    absorbHit() {
      if (!this.infiniteHealthOn()) return false;
      if (global.Player) {
        Player.health = Player.maxHealth;
      }
      return true;
    },

    // =====================================================
    // RUBE AURA
    // =====================================================
    setAura(on) {
      if (on === this.auraOn) return;   // no duplicates
      this.auraOn = on;
      if (on) {
        this._auraT = 0;
        this._auraParts = this._seedAuraParts();
      } else {
        this._auraParts = [];            // clear particles immediately
      }
      this._syncToggles();
    },

    _seedAuraParts() {
      const parts = [];
      const n = 16;                      // bounded particle count
      for (let i = 0; i < n; i++) {
        parts.push({
          ang: (i / n) * Math.PI * 2,
          rad: 34 + Math.random() * 22,
          spd: (0.6 + Math.random() * 0.9) * (Math.random() < 0.5 ? 1 : -1),
          size: 2 + Math.random() * 2.5,
          phase: Math.random() * Math.PI * 2,
          color: Math.random() < 0.5 ? '#4ef0ff' : '#b24dff',
        });
      }
      return parts;
    },

    // Called every frame from Game.update while playing.
    update(dt) {
      if (!this.active || !this.auraOn) return;
      this._auraT += dt;
    },

    // Called from Game.draw, just before the player is drawn (aura behind body).
    drawBehind(ctx) {
      if (!this.active || !this.auraOn) return;
      if (!global.Player || !global.Camera) return;

      const P = Player;
      const off = Camera.offset();
      const cx = P.x + P.w / 2 - off.x;
      const cy = P.y + P.h / 2 - off.y;
      const t = this._auraT;

      // pulsating outer glow
      const pulse = 1 + Math.sin(t * 3) * 0.12;
      const glowR = (52 * pulse);

      ctx.save();
      // soft outer aura
      const grad = ctx.createRadialGradient(cx, cy, 6, cx, cy, glowR * 1.5);
      grad.addColorStop(0, 'rgba(78,240,255,0.18)');
      grad.addColorStop(0.6, 'rgba(178,77,255,0.10)');
      grad.addColorStop(1, 'rgba(78,240,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, cy, glowR * 1.5, 0, Math.PI * 2); ctx.fill();

      // rotating ring 1
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 1.4);
      ctx.strokeStyle = 'rgba(78,240,255,0.85)';
      ctx.shadowColor = '#4ef0ff'; ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 12]);
      ctx.beginPath(); ctx.arc(0, 0, glowR, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      // rotating ring 2 (counter-rotating, magenta)
      ctx.rotate(-t * 2.1);
      ctx.strokeStyle = 'rgba(178,77,255,0.75)';
      ctx.shadowColor = '#b24dff';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, glowR * 0.72, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      // orbiting particles
      for (let i = 0; i < this._auraParts.length; i++) {
        const p = this._auraParts[i];
        const a = p.ang + t * p.spd;
        const r = p.rad + Math.sin(t * 2 + p.phase) * 5;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.9;
        ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 3 + p.phase);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(x, y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.restore();
    },

    // =====================================================
    // OWNER MUSIC (YouTube IFrame API, no audio redistribution)
    // =====================================================
    setMusic(on) {
      if (on === this.musicOn) return;
      this.musicOn = on;
      if (on) {
        this._startMusic();
      } else {
        this._stopMusic();
      }
      this._syncToggles();
    },

    _startMusic() {
      this._hideMusicHint();
      this._ensureYT().then(() => {
        if (!this.musicOn) return;   // toggled off while loading
        if (!this._ytPlayer) this._createYtPlayer();
        try {
          this._ytPlayer.mute();
          this._ytPlayer.playVideo();
        } catch (e) { /* ignore */ }
        // If autoplay is blocked the video may not actually play; surface a
        // click-to-enable affordance so the user can start it on interaction.
        if (!this._userInteracted) this._showMusicHint();
      }).catch(() => {
        this._showMusicError();
      });
    },

    _stopMusic() {
      this._hideMusicHint();
      if (this._ytPlayer && this._ytPlayer.stopVideo) {
        try { this._ytPlayer.stopVideo(); } catch (e) { /* ignore */ }
      }
    },

    _ensureYT() {
      return new Promise((resolve, reject) => {
        if (global.YT && global.YT.Player) { resolve(); return; }
        if (this._ytLoading) {
          // wait for the in-flight load
          const t0 = Date.now();
          const iv = setInterval(() => {
            if (global.YT && global.YT.Player) { clearInterval(iv); resolve(); }
            else if (Date.now() - t0 > 8000) { clearInterval(iv); reject(new Error('yt timeout')); }
          }, 200);
          return;
        }
        this._ytLoading = true;
        // Provide the ready callback the API expects.
        global.onYouTubeIframeAPIReady = () => { this._ytLoading = false; resolve(); };
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        tag.onerror = () => { this._ytLoading = false; reject(new Error('yt load failed')); };
        document.body.appendChild(tag);
        // hard timeout
        setTimeout(() => {
          if (!(global.YT && global.YT.Player)) {
            this._ytLoading = false;
            reject(new Error('yt timeout'));
          }
        }, 9000);
      });
    },

    _createYtPlayer() {
      // Only ever one player instance.
      if (this._ytPlayer) return this._ytPlayer;
      const holder = document.createElement('div');
      holder.id = 'ownerYtPlayer';
      holder.style.width = '1px';
      holder.style.height = '1px';
      holder.style.position = 'absolute';
      holder.style.left = '-9999px';
      holder.style.overflow = 'hidden';
      document.body.appendChild(holder);
      this._ytPlayer = new global.YT.Player('ownerYtPlayer', {
        videoId: YT_VIDEO_ID,
        playerVars: {
          playsinline: 1,
          controls: 0,
          rel: 0,
          loop: 1,
          playlist: YT_VIDEO_ID,   // enables looping
        },
        events: {
          onReady: () => { /* handled in _startMusic */ },
          onStateChange: (e) => {
            if (e.data === global.YT.PlayerState.ENDED) {
              try { this._ytPlayer.playVideo(); } catch (err) { /* ignore */ }
            }
          },
          onError: () => this._showMusicError(),
        },
      });
      return this._ytPlayer;
    },

    unmuteMusic() {
      this._userInteracted = true;
      this._hideMusicHint();
      if (this._ytPlayer) {
        try {
          this._ytPlayer.unMute();
          this._ytPlayer.setVolume(70);
          this._ytPlayer.playVideo();
        } catch (e) { /* ignore */ }
      }
    },

    _showMusicHint() {
      const h = document.getElementById('ownerMusicHint');
      if (h) h.classList.remove('hidden');
    },
    _hideMusicHint() {
      const h = document.getElementById('ownerMusicHint');
      if (h) h.classList.add('hidden');
    },
    _showMusicError() {
      this._hideMusicHint();
      if (global.UI && UI.toast) UI.toast('Owner music unavailable');
    },

    _destroyYtPlayer() {
      this._hideMusicHint();
      if (this._ytPlayer) {
        try { this._ytPlayer.destroy(); } catch (e) { /* ignore */ }
        this._ytPlayer = null;
      }
      const holder = document.getElementById('ownerYtPlayer');
      if (holder && holder.parentNode) holder.parentNode.removeChild(holder);
    },

    // =====================================================
    // RESET EFFECTS (keeps owner mode active)
    // =====================================================
    resetEffects() {
      this.setToggle('infiniteHealth', false);
      this.setToggle('aura', false);
      this.setToggle('music', false);
      this._syncToggles();
    },

    // =====================================================
    // EXIT (full cleanup)
    // =====================================================
    exitOwnerMode() {
      // disable toggles (each performs its own cleanup)
      this.setToggle('infiniteHealth', false);
      this.setToggle('aura', false);
      this.setToggle('music', false);

      // full teardown
      this._destroyYtPlayer();
      this._auraParts = [];
      this._auraT = 0;
      this._panelOpen = false;
      this._passOpen = false;

      // restore player HP to normal max (not modified permanently)
      if (global.Player && Player.maxHealth) Player.health = Player.maxHealth;

      this.active = false;
      document.getElementById('ownerPanelScreen').classList.add('hidden');
      this._refreshOwnerButton();
      // return to main menu
      const menu = document.getElementById('menuScreen');
      if (menu && global.Game) menu.classList.remove('hidden');
    },

    _refreshOwnerButton() {
      const btn = document.getElementById('ownerBtn');
      if (!btn) return;
      if (this.active) {
        btn.textContent = 'OWNER ✓';
        btn.classList.add('active');
      } else {
        btn.textContent = 'OWNER';
        btn.classList.remove('active');
      }
    },

    // =====================================================
    // For headless testing
    // =====================================================
    setPasswordValueForTest(v) {
      const input = document.getElementById('ownerPassInput');
      if (input) input.value = v;
    },
  };

  // Public API only what the game needs.
  global.OwnerMode = OwnerMode;
})(window);
