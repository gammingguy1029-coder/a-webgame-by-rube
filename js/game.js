/* ============================================================
   game.js — core game orchestrator.
   State machine, run lifecycle, scoring, combat, rendering.
   ============================================================ */
(function (global) {
  'use strict';

  const Game = {
    canvas: null,
    ctx: null,
    state: 'MENU',           // MENU, PLAYING, PAUSED, FLOOR_COMPLETE, FLOOR_SELECTION, CHEST, DEAD, UPGRADES, SETTINGS, STATISTICS, DAILY_CHALLENGE
    lastTime: 0,
    room: null,
    run: null,
    pendingDifficulty: 'safe',
    modifiers: {},
    fps: 0,
    _fpsCount: 0, _fpsTime: 0,
    coinFly: [],
    floorTitle: '', floorTitleT: 0,

    // convenience aliases used by other modules
    camera: null,
    particles: null,

    // Guard so only ONE requestAnimationFrame loop ever runs. Previously each
    // beginRun() added a new permanent RAF loop, causing the game to speed up
    // and multiply with every restart (GAME-CRIT-001).
    _loopStarted: false,

    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.camera = Camera;
      this.particles = Particles;
      Input.init();
      MobileControls.init();
      UI.init();
      if (global.OwnerMode) OwnerMode.init();
      this.resize();
      window.addEventListener('resize', () => this.resize());

      // Start the single persistent game loop once.
      this.startLoop();

      // Start loading animation
      this.animateLoading();
      // Preload nothing heavy (all procedural), so finish loading quickly
      setTimeout(() => this.finishLoading(), 700);
    },

    startLoop() {
      if (this._loopStarted) return;
      this._loopStarted = true;
      this.lastTime = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    },

    // ================= Loading =================
    _loadingAnim: true,
    animateLoading() {
      const el = document.getElementById('towerAnimation');
      if (!el) return;
      const c = document.createElement('canvas');
      c.width = 120; c.height = 120;
      el.appendChild(c);
      const ctx = c.getContext('2d');
      const draw = () => {
        if (!this._loadingAnim) return; // stop once loading is done
        ctx.clearRect(0, 0, 120, 120);
        const t = Date.now() / 1000;
        // spinning rift / tower
        ctx.save();
        ctx.translate(60, 70);
        ctx.rotate(t * 0.5);
        ctx.strokeStyle = '#4ef0ff'; ctx.shadowColor = '#4ef0ff'; ctx.shadowBlur = 12;
        ctx.lineWidth = 3;
        ctx.strokeRect(-28, -40, 56, 80);
        ctx.strokeStyle = '#b24dff';
        ctx.rotate(t * 0.3);
        ctx.strokeRect(-20, -32, 40, 64);
        ctx.restore();
        // ascending sparkle
        const y = 110 - ((t * 40) % 110);
        ctx.fillStyle = '#ffd24d'; ctx.shadowColor = '#ffd24d'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(60, y, 3, 0, Math.PI * 2); ctx.fill();
        requestAnimationFrame(draw);
      };
      draw();
    },
    finishLoading() {
      this._loadingAnim = false;
      document.getElementById('loadingBar').style.width = '100%';
      document.getElementById('loadingText').textContent = 'Ready';
      setTimeout(() => {
        document.getElementById('loading').classList.add('hidden');
        AudioM.init();
        this.toMenu();
      }, 300);
    },

    // ================= Sizing =================
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth, h = window.innerHeight;
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      Camera.setSize(w, h);
      this.checkOrientation();
      // apply mobile controls visibility
      if (Settings.isTouch()) {
        MobileControls.enabled = true;
        if (this.state === 'PLAYING') MobileControls.show();
      }
    },

    checkOrientation() {
      const overlay = document.getElementById('rotateOverlay');
      const portrait = window.innerHeight > window.innerWidth;
      const isTouch = Settings.isTouch();
      if (isTouch && portrait && this.state !== 'MENU') {
        overlay.classList.add('visible');
      } else {
        overlay.classList.remove('visible');
      }
    },

    // ================= State / menu =================
    toMenu() {
      // Bank any in-progress run rewards exactly once before leaving.
      this.bankRun();
      this.state = 'MENU';
      this.room = null;
      this.run = null;
      Input.clear();
      UI.hideAllScreens();
      UI.showHUD(false);
      MobileControls.hide();
      UI.renderMenu();
      UI.showScreen('menuScreen');
      AudioM.play('click');
    },

    // ================= Run lifecycle =================
    startRun() {
      if (!Save.get().unlocks.tutorialSeen) {
        // first time: show tutorial before starting
        UI.hideAllScreens();
        UI.showTutorial();
        return;
      }
      this.beginRun(false);
    },
    startRunFromTutorial() {
      Save.get().unlocks.tutorialSeen = true;
      Save.persist();
      this.beginRun(false);
    },
    startDailyRun() {
      this.beginRun(true);
    },

    beginRun(daily) {
      AudioM.play('click');
      // Bank any previous unfinished run exactly once before starting a new one.
      // (Prevents rewards being granted twice when a run is not ended cleanly.)
      this.bankRun();
      const s = Save.get();
      s.statistics.totalRuns += 1;
      this.run = {
        floor: 1,
        score: 0,
        runCoins: 0,
        kills: 0,
        bossKills: 0,
        startTime: Date.now(),
        timeSurvived: 0,
        canRevive: true,
        reviveUsed: false,
        daily: !!daily,
        dailyFloor: 0,
        highestThisRun: 1,
        ended: false,
      };
      this.pendingDifficulty = 'safe';
      this.modifiers = {};
      if (daily) {
        const ch = Daily.getChallenge();
        this.applyModifier(ch.modifier.id);
      }
      this.generateRoom(this.run.floor);
      this.state = 'PLAYING';
      UI.hideAllScreens();
      UI.showHUD(true);
      if (Settings.isTouch()) MobileControls.show();
      this.lastTime = performance.now();
    },

    applyModifier(id) {
      const m = this.modifiers;
      switch (id) {
        case 'halfHealth': m.healthMul = 0.5; break;
        case 'doubleEnemySpeed': m.enemySpeedMul = 2; break;
        case 'noHeal': m.noHeal = true; break;
        case 'fasterTraps': m.trapSpeedMul = 1.8; break;
        case 'doubleDamage': m.damageTakenMul = 1.5; m.playerDamageMul = 1.3; break;
        case 'darkness': m.forceDarkness = true; break;
      }
      this.modifiers.id = id;
    },

    generateRoom(floor) {
      const data = Procedural.generateFloor(floor, { difficulty: this.pendingDifficulty });
      if (this.modifiers.forceDarkness) data.event = 'darkness';
      this.room = Rooms.buildRoom(data);
      Camera.setBounds(this.room.bounds);
      // place player
      Player.x = this.room.start.x;
      Player.y = this.room.start.y;
      const stats = Upgrades.getStats();
      if (this.modifiers.healthMul) stats.maxHealth = Math.max(10, Math.round(stats.maxHealth * this.modifiers.healthMul));
      Player.reset(stats);
      Camera.snap(Player.x, Player.y);
      this.floorTitle = 'FLOOR ' + floor;
      this.floorTitleT = 2.0;
      if (this.room.bossFloor) {
        this.floorTitle = 'BOSS FLOOR ' + floor;
        AudioM.play('bossWarn');
        Game.toast(this.room.boss ? this.room.boss.name + ' AWAITS' : 'BOSS AWAITS', 2);
      }
    },

    // ================= Game loop =================
    loop(t) {
      if (this.state === 'PLAYING') {
        const dt = Math.min(Math.max(0, (t - this.lastTime) / 1000), 0.05);
        this.lastTime = t;
        this.update(dt);
        this.draw();
        this.updateHUD();
        // fps
        this._fpsCount++;
        this._fpsTime += dt;
        if (this._fpsTime >= 0.5) { this.fps = Math.round(this._fpsCount / this._fpsTime); this._fpsCount = 0; this._fpsTime = 0; }
      }
      requestAnimationFrame((tt) => this.loop(tt));
    },

    update(dt) {
      this.run.timeSurvived = (Date.now() - this.run.startTime) / 1000;
      if (this.floorTitleT > 0) this.floorTitleT -= dt;

      const ctx = {
        player: Player,
        collidables: this.room.collidables,
        roomBounds: this.room.bounds,
        gravity: Player.gravity,
        spawnProjectile: (x, y, ang, speed, dmg, team) => this.spawnProjectile(x, y, ang, speed, dmg, team),
        spawnEnemy: (type, x, y) => this.spawnEnemy(type, x, y),
        enemySpeedMul: this.modifiers.enemySpeedMul || 1,
        noHeal: !!this.modifiers.noHeal,
        trapSpeedMul: this.modifiers.trapSpeedMul || 1,
      };

      Player.update(dt, ctx);
      Rooms.updateRoom(this.room, dt, ctx);
      Camera.follow(Player.x + Player.w / 2, Player.y + Player.h / 2, Player.facing);
      Camera.update(dt);
      if (global.OwnerMode) OwnerMode.update(dt);
      Particles.update(dt);

      // coin fly animations
      for (let i = this.coinFly.length - 1; i >= 0; i--) {
        const c = this.coinFly[i];
        c.life -= dt;
        if (c.life <= 0) { this.coinFly.splice(i, 1); continue; }
        c.x += c.vx * dt; c.y += c.vy * dt;
        if (c.y > -10) c.vy += 900 * dt;
      }

      // trap speed modifier - handled inside rooms via ctx; also update boss hp
      if (this.room.boss) {
        const bh = this.room.boss.hp, bm = this.room.boss.maxHp;
        document.getElementById('bossBarWrap').classList.remove('hidden');
        document.getElementById('bossName').textContent = this.room.boss.name;
        document.getElementById('bossBar').innerHTML = `<div style="width:${Math.max(0, bh / bm * 100)}%"></div>`;
      } else {
        document.getElementById('bossBarWrap').classList.add('hidden');
      }
    },

    draw() {
      const ctx = this.ctx;
      ctx.save();
      // Clear
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // redraw transform for dpr
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;

      Rooms.drawRoom(this.room, ctx, Camera);
      if (global.OwnerMode) OwnerMode.drawBehind(ctx);
      this.drawPlayer(ctx);
      Particles.draw(ctx, Camera);
      this.drawCoinFlies(ctx);

      // floor title
      if (this.floorTitleT > 0) {
        ctx.globalAlpha = Math.min(1, this.floorTitleT);
        ctx.font = 'bold 42px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#4ef0ff';
        ctx.shadowColor = '#4ef0ff'; ctx.shadowBlur = 18;
        ctx.fillText(this.floorTitle, Camera.w / 2, Camera.h / 2 - 60);
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      }

      // darkness vignette for event
      if (this.room.event === 'darkness' && this.state === 'PLAYING') {
        const g = ctx.createRadialGradient(Camera.w/2, Camera.h/2, Camera.h*0.2, Camera.w/2, Camera.h/2, Camera.h*0.7);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.7)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, Camera.w, Camera.h);
      }

      // FPS
      if (Save.get().settings.fpsCounter) {
        ctx.font = '12px monospace'; ctx.textAlign = 'left';
        ctx.fillStyle = '#8ea0c2';
        ctx.fillText(this.fps + ' FPS', 10, Camera.h - 10);
      }
      ctx.restore();
    },

    drawPlayer(ctx) {
      const P = Player;
      const off = Camera.offset();
      const sx = P.x - off.x, sy = P.y - off.y;
      const cx = sx + P.w / 2;
      ctx.save();
      // invuln blink
      if (P.iframes > 0 && Math.sin(Date.now() / 60) > 0) ctx.globalAlpha = 0.4;
      // attack swing
      if (P.attackAnim > 0) {
        const reach = Weapons.getReach();
        const arc = Weapons.getArc();
        const prog = 1 - (P.attackAnim / 0.22);
        const ang = (prog - 0.5) * arc * 0.8;
        const base = P.facing > 0 ? 0 : Math.PI;
        ctx.save();
        ctx.translate(cx, sy + P.h / 2);
        ctx.rotate(base + ang);
        ctx.shadowColor = '#4ef0ff'; ctx.shadowBlur = 16;
        ctx.strokeStyle = '#4ef0ff'; ctx.lineWidth = 5;
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.moveTo(P.w / 2, 0); ctx.lineTo(P.w / 2 + reach, 0); ctx.stroke();
        ctx.fillStyle = '#9df3ff';
        ctx.beginPath(); ctx.arc(P.w / 2 + reach, 0, 6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // body
      ctx.shadowColor = '#4ef0ff'; ctx.shadowBlur = 10;
      // legs
      ctx.fillStyle = '#2a3450';
      ctx.fillRect(cx - 6, sy + P.h - 8, 5, 8);
      ctx.fillRect(cx + 1, sy + P.h - 8, 5, 8);
      // torso
      ctx.fillStyle = '#4ef0ff';
      ctx.fillRect(cx - 7, sy + 10, 14, P.h - 18);
      // head
      ctx.fillStyle = '#9df3ff';
      ctx.fillRect(cx - 5, sy + 2, 10, 10);
      // eye (facing)
      ctx.fillStyle = '#0a0e1a';
      ctx.fillRect(cx + (P.facing > 0 ? 1 : -4), sy + 5, 3, 3);
      // shield
      if (P.powerups.shield > 0) {
        ctx.strokeStyle = '#9df3ff'; ctx.lineWidth = 3; ctx.shadowColor = '#9df3ff'; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(cx, sy + P.h / 2, 26 + Math.sin(Date.now()/150)*2, 0, Math.PI*2); ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    },

    drawCoinFlies(ctx) {
      for (const c of this.coinFly) {
        ctx.fillStyle = '#ffd24d'; ctx.shadowColor = '#ffd24d'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(c.x, c.y, 5, 0, Math.PI * 2); ctx.fill();
      }
    },

    // ================= Combat / entities =================
    spawnProjectile(x, y, ang, speed, dmg, team, color) {
      this.room.projectiles.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life: 2.5, dmg, team, color: color || '#ff9d4d' });
    },

    spawnEnemy(type, x, y) {
      const en = Enemies.createEnemy(type, x, y, 1);
      en.y = y - (en.h - 20);
      this.room.entities.push(en);
    },

    spawnAttackSwing(px, py, facing, reach, arc, hit) {
      // visual particles for the swing
      const base = facing > 0 ? 0 : Math.PI;
      for (let i = 0; i < (hit ? 12 : 5); i++) {
        const ang = base + (Math.random() - 0.5) * arc;
        const r = reach * (0.5 + Math.random() * 0.5);
        this.particles.spawn({ x: px + Math.cos(ang) * r, y: py + Math.sin(ang) * r, vx: Math.cos(ang) * 100, vy: Math.sin(ang) * 100, life: 0.2, size: 3, color: '#9df3ff', shape: 'circle', glow: true });
      }
    },

    damageEntity(e, dmg, dir, crit) {
      if (!e.alive) return;
      // boss shield
      if (e.type === 'boss' && e.shield > 0) {
        AudioM.play('shield');
        this.particles.burst(e.x + e.w/2, e.y + e.h/2, '#9df3ff', 8, 160, 0.3);
        return;
      }
      let final = Math.round(dmg * (this.modifiers.playerDamageMul || 1));
      if (crit) final = Math.round(final * 1.5);
      // Guards can block, halving incoming damage (was previously cosmetic).
      if (e.blocking) final = Math.max(1, Math.round(final * 0.5));
      e.hp -= final;
      e.hitFlash = 0.12;
      this.particles.burst(e.x + e.w/2, e.y + e.h/2, e.color || '#fff', 6, 160, 0.3);
      Particles.damageText(e.x + e.w/2, e.y, final, e.color || '#fff', crit);
      AudioM.play(e.type === 'boss' ? 'bossHit' : 'enemyHit');
      if (e.hp <= 0) {
        this.registerKill(e, e.type === 'boss');
      }
      if (e.type === 'boss') {
        // update boss bar
        const bh = e.hp, bm = e.maxHp;
        document.getElementById('bossBar').innerHTML = `<div style="width:${Math.max(0, bh / bm * 100)}%"></div>`;
      }
    },

    registerKill(e, isBoss) {
      e.alive = false;
      // combo
      Player.combo++;
      Player.comboTimer = 2.5;
      const comboMul = 1 + Math.min(Player.combo, 10) * 0.1;
      this.particles.burst(e.x + e.w/2, e.y + e.h/2, e.color || '#fff', isBoss ? 30 : 14, isBoss ? 320 : 200, 0.5);
      AudioM.play(isBoss ? 'bossDeath' : 'enemyDeath');
      if (isBoss) {
        this.camera.shake(12, 0.5);
        this.addScore(e.score * comboMul);
        this.addRunCoins(e.coin);
        this.run.bossKills++;
      } else {
        this.addScore(e.coin * 4 * comboMul);
        this.addRunCoins(e.coin);
        this.run.kills++;
      }
      // maybe drop coins on ground
      const drops = isBoss ? 5 : (e.elite ? 3 : 1);
      for (let i = 0; i < drops; i++) {
        this.room.coins.push({ x: e.x + Math.random() * e.w, y: e.y + Math.random() * 20, value: 1, taken: false });
      }
    },

    // ================= Scoring / coins =================
    addRunCoins(amount) {
      this.run.runCoins += amount;
      // coin fly effect
      this.coinFly.push({ x: Camera.w / 2, y: Camera.h / 2 - 40, vx: 0, vy: -400, life: 0.6 });
    },
    addScore(amount) {
      this.run.score += Math.round(amount);
    },
    toast(msg, dur) { UI.toast(msg, dur); },
    coinFlyFx(x, y) {
      const cx = x - Camera.offset().x, cy = y - Camera.offset().y;
      this.coinFly.push({ x: cx, y: cy, vx: 60, vy: -320, life: 0.5 });
    },

    // ================= Floor completion =================
    onExitReached() {
      // A dead player can't complete a floor (prevents state conflicts when
      // the player dies and touches the exit in the same frame).
      if (!Player.alive || this.state !== 'PLAYING') return;
      this.state = 'FLOOR_COMPLETE';
      const floor = this.run.floor;
      // reward
      let reward = 40 + floor * 8;
      let score = 100 + floor * 15;
      if (this.pendingDifficulty === 'danger') { reward = Math.round(reward * 1.5); score = Math.round(score * 1.5); }
      if (this.pendingDifficulty === 'insane') { reward = Math.round(reward * 2.2); score = Math.round(score * 2); }
      // floor selection rewards are added as bonus already
      // runCoins stay raw; the Coin Bonus upgrade is applied once at endRun.
      const coins = Math.round(reward);
      this.addRunCoins(coins);
      this.addScore(score);
      this.run.highestThisRun = Math.max(this.run.highestThisRun, floor);
      // heal small amount (unless noHeal)
      if (!this.modifiers.noHeal) Player.heal(8);

      const kills = this.run.kills;
      UI.showFloorComplete(floor, this.run.score, coins);

      // interstitial at natural break after run? We keep it at run end only.
    },

    continueRun() {
      // advance to next floor
      const next = this.run.floor + 1;
      this.run.floor = next;
      this.pendingDifficulty = 'safe';
      // show floor selection every 4 floors (after 4,8,12,...)
      if (next % 4 === 0 && next % 10 !== 0) {
        this.showFloorSelection();
        return;
      }
      this.generateRoom(next);
      this.state = 'PLAYING';
      UI.hideAllScreens();
      UI.showHUD(true);
    },

    showFloorSelection() {
      this.state = 'FLOOR_SELECTION';
      const next = this.run.floor;
      UI.showFloorChoice({
        safe: { name: 'SAFE', desc: 'Easy floor, guaranteed coin bonus', coins: 60 },
        danger: { name: 'DANGEROUS', desc: 'Medium floor, more enemies', coins: 200 },
        insane: { name: 'INSANE', desc: 'Very difficult, huge reward', coins: 600 },
      }, 'Choose your next challenge (Floor ' + next + ')');
    },

    chooseFloor(key) {
      this.pendingDifficulty = key;
      const bonus = { safe: 60, danger: 200, insane: 600 }[key];
      this.addRunCoins(bonus);
      this.addScore(bonus * 2);
      AudioM.play('click');
      this.generateRoom(this.run.floor);
      this.state = 'PLAYING';
      UI.hideAllScreens();
      UI.showHUD(true);
    },

    // ================= Chests =================
    showChestReward(rarity, msg) {
      UI.showChestReward(rarity, msg);
      this.state = 'CHEST';
    },
    closeChest() {
      UI.hideAllScreens();
      this.state = 'PLAYING';
      UI.showHUD(true);
    },

    // ================= Death / revive =================
    killPlayer(fall) {
      // Owner admin override: infinite health prevents death (including falls).
      if (global.OwnerMode && OwnerMode.infiniteHealthOn()) {
        Player.health = Player.maxHealth;
        Player.alive = true;
        return;
      }
      // Death is only valid during active gameplay or an in-progress chest screen.
      if (this.state !== 'PLAYING' && this.state !== 'CHEST') return;
      if (!this.run) return;
      Player.alive = false;
      AudioM.play('playerDeath');
      this.camera.shake(10, 0.4);
      this.particles.burst(Player.x + Player.w/2, Player.y + Player.h/2, '#ff4d6d', 20, 220, 0.6);
      this.state = 'DEAD';
      // Show the amount of permanent coins this run would bank, WITHOUT banking
      // yet — banking happens once when the player leaves the run (revive keeps
      // the run alive, so it must not double-bank).
      this.run.displayCoins = Math.floor(this.run.runCoins * Upgrades.coinMultiplier());
      UI.showDeath({
        floor: this.run.floor,
        score: this.run.score,
        coins: this.run.displayCoins,
        kills: this.run.kills,
        time: Math.floor(this.run.timeSurvived),
        bestFloor: Save.get().playerData.highestFloor,
        canRevive: this.run.canRevive && Ads.enabled,
      });
    },

    // Bank this run's rewards into the permanent save exactly once.
    // Idempotent: calling it repeatedly (revive -> die, menu -> new run, etc.)
    // never double-counts coins or stats. Returns permanent coins banked.
    bankRun() {
      if (!this.run || this.run.ended) return 0;
      this.run.ended = true;
      const mul = Upgrades.coinMultiplier();
      const permanent = Math.floor(this.run.runCoins * mul);
      const s = Save.get();
      s.playerData.coins += permanent;
      s.statistics.totalCoins += permanent;
      s.statistics.totalKills += this.run.kills;
      s.statistics.totalBossKills += this.run.bossKills;
      s.statistics.totalPlayTime += this.run.timeSurvived;
      s.statistics.longestRun = Math.max(s.statistics.longestRun, this.run.timeSurvived);
      s.playerData.highestFloor = Math.max(s.playerData.highestFloor, this.run.highestThisRun);
      s.playerData.bestScore = Math.max(s.playerData.bestScore, this.run.score);
      // daily record
      if (this.run.daily) {
        const ch = Daily.getChallenge();
        Daily.recordResult(this.run.highestThisRun, this.run.highestThisRun >= ch.targetFloor);
      }
      Save.persist();
      this.run.endedCoins = permanent;
      // Natural break: fire-and-forget interstitial (no-op when ads disabled).
      Ads.showInterstitialAd();
      return permanent;
    },

    async tryRevive() {
      if (!Ads.enabled || !this.run || !this.run.canRevive) { UI.toast('Ad unavailable — revive disabled.'); return; }
      UI.toast('Watching ad...');
      const ok = await Ads.showRewardedAd();
      if (!ok) {
        UI.toast('Ad unavailable right now.');
        return;
      }
      // revive
      this.run.canRevive = false;
      this.run.reviveUsed = true;
      Save.get().statistics.revivesUsed += 1;
      Save.persist();
      Player.alive = true;
      Player.health = Math.max(1, Math.round(Player.maxHealth * 0.5));
      Player.x = this.room.start.x;
      Player.y = this.room.start.y;
      Player.invuln = 2.5;
      Player.vy = 0;
      AudioM.play('revive');
      this.particles.burst(Player.x + Player.w/2, Player.y + Player.h/2, '#4dff88', 20, 200, 0.5);
      UI.hideAllScreens();
      UI.showHUD(true);
      this.state = 'PLAYING';
      UI.toast('REVIVED!', 1.5);
    },

    // ================= Pause =================
    pause() {
      if (this.state !== 'PLAYING') return;
      this.state = 'PAUSED';
      UI.showPause();
      AudioM.setMusicPlaying(false);
    },
    resume() {
      if (this.state !== 'PAUSED') return;
      this.state = 'PLAYING';
      this.lastTime = performance.now();
      UI.hideAllScreens();
      UI.showHUD(true);
      AudioM.setMusicPlaying(true);
    },
    openPauseSettings() {
      UI.openSettings('pause');
    },
    quitRun() {
      // convert partial rewards, then leave
      this.bankRun();
      this.run = null;
      this.toMenu();
    },

    // ================= HUD =================
    updateHUD() {
      if (!this.run) return;
      const s = Save.get().settings;
      document.getElementById('hudFloor').textContent = this.run.floor;
      document.getElementById('hudScore').textContent = this.run.score.toLocaleString();
      document.getElementById('hudCoins').textContent = this.run.runCoins;
      const hb = document.getElementById('healthBar');
      hb.style.width = Math.max(0, Player.health / Player.maxHealth * 100) + '%';
      document.getElementById('healthText').textContent = Math.max(0, Math.round(Player.health));
      // combo
      const combo = document.getElementById('hudCombo');
      if (Player.combo >= 2) {
        combo.style.display = '';
        combo.textContent = 'x' + (1 + Math.min(Player.combo, 10) * 0.1).toFixed(1);
      } else combo.style.display = 'none';
      // dash indicator
      const di = document.getElementById('dashIndicator');
      if (Player.dashCooldown > 0) {
        di.classList.add('cooldown'); di.classList.remove('ready');
        di.textContent = 'DASH ' + Player.dashCooldown.toFixed(1);
      } else {
        di.classList.add('ready'); di.classList.remove('cooldown');
        di.textContent = 'DASH READY';
      }
      // powerup chips
      const row = document.getElementById('powerupRow');
      row.innerHTML = '';
      const pw = Player.powerups;
      const labels = { shield:['SHIELD','shield'], rage:['RAGE','rage'], speed:['SPEED','speed'], magnet:['MAGNET','magnet'], timewarp:['SLOW','warp'], dcoin:['2X COINS','dcoin'] };
      for (const k in pw) {
        if (pw[k] > 0 && labels[k]) {
          const chip = document.createElement('div');
          chip.className = 'powerup-chip ' + labels[k][1];
          chip.textContent = labels[k][0] + ' ' + pw[k].toFixed(0);
          row.appendChild(chip);
        }
      }
    },
  };

  global.Game = Game;
})(window);
