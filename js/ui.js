/* ============================================================
   ui.js — DOM screen management, rendering, and bindings.
   ============================================================ */
(function (global) {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const UI = {
    currentScreen: null,
    toastTimer: null,

    init() {
      this.bindMenu();
      this.bindUpgrades();
      this.bindSettings();
      this.bindStats();
      this.bindDaily();
      this.bindFloorChoice();
      this.bindChest();
      this.bindFloorComplete();
      this.bindDeath();
      this.bindPause();
      this.bindTutorial();
      document.getElementById('pauseBtn').addEventListener('click', () => Game.pause());
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (Game.state === 'PLAYING') Game.pause();
          else if (Game.state === 'PAUSED') Game.resume();
        }
      });
    },

    // ---- Screen switching ----
    showScreen(id) {
      document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
      const el = $(id);
      if (el) el.classList.remove('hidden');
      this.currentScreen = id;
    },
    hideAllScreens() {
      document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
      this.currentScreen = null;
    },

    showHUD(on) {
      const hud = $('hud');
      const pause = $('pauseBtn');
      if (on) {
        hud.classList.remove('hidden');
        pause.classList.remove('hidden');
      } else {
        hud.classList.add('hidden');
        pause.classList.add('hidden');
      }
    },

    // ---- Menu ----
    renderMenu() {
      const s = Save.get();
      $('mHighestFloor').textContent = s.playerData.highestFloor;
      $('mBestScore').textContent = s.playerData.bestScore.toLocaleString();
      $('mTotalCoins').textContent = s.playerData.coins.toLocaleString();
      // show banner ad (placeholder)
      Ads.showBannerAd();
    },
    bindMenu() {
      $('btnPlay').addEventListener('click', () => { AudioM.play('click'); Game.startRun(); });
      $('btnUpgrades').addEventListener('click', () => { AudioM.play('click'); this.openUpgrades(); });
      $('btnDaily').addEventListener('click', () => { AudioM.play('click'); this.openDaily(); });
      $('btnStats').addEventListener('click', () => { AudioM.play('click'); this.openStats(); });
      $('btnSettings').addEventListener('click', () => { AudioM.play('click'); this.openSettings(); });
    },

    // ---- Upgrades ----
    openUpgrades() {
      this.renderUpgrades();
      this.showScreen('upgradesScreen');
    },
    renderUpgrades() {
      const coins = Save.get().playerData.coins;
      $('upgCoins').textContent = coins.toLocaleString();
      const list = $('upgradeList');
      list.innerHTML = '';
      const ug = Save.get().upgrades;
      Object.keys(UPGRADE_DEFS).forEach((key) => {
        const def = UPGRADE_DEFS[key];
        const lvl = ug[key];
        const maxed = lvl >= def.maxLevel;
        const price = maxed ? 0 : Upgrades.priceFor(key, lvl);
        const row = document.createElement('div');
        row.className = 'upgrade-row';
        let values = `<span class="upg-name">${def.icon} ${def.name} <span class="upg-lvl">Lv ${lvl}</span></span>`;
        if (maxed) {
          values += `<div class="upg-values">MAX • ${def.valueFor(lvl)}</div>`;
        } else {
          values += `<div class="upg-values">${def.valueFor(lvl)} → <span class="next">${def.nextFor(lvl)}</span></div>`;
        }
        const buyBtn = document.createElement('button');
        buyBtn.className = 'upg-buy';
        buyBtn.textContent = maxed ? 'MAX' : price.toLocaleString() + ' ●';
        buyBtn.disabled = maxed || coins < price;
        buyBtn.addEventListener('click', () => this.buyUpgrade(key));
        row.innerHTML = `<div class="upg-info">${values}</div>`;
        row.appendChild(buyBtn);
        list.appendChild(row);
      });
    },
    buyUpgrade(key) {
      const s = Save.get();
      const lvl = s.upgrades[key];
      const def = UPGRADE_DEFS[key];
      if (lvl >= def.maxLevel) return;
      const price = Upgrades.priceFor(key, lvl);
      if (s.playerData.coins < price) { this.toast('Not enough coins!'); return; }
      s.playerData.coins -= price;
      s.upgrades[key] += 1;
      Save.persist();
      AudioM.play('levelup');
      this.renderUpgrades();
    },
    bindUpgrades() {
      $('btnUpgBack').addEventListener('click', () => { AudioM.play('click'); this.openMenu(); });
    },

    // ---- Settings ----
    _settingsBack: 'menu',
    openSettings(backTo) {
      this._settingsBack = backTo || 'menu';
      this.renderSettings();
      this.showScreen('settingsScreen');
    },
    renderSettings() {
      const list = $('settingsList');
      list.innerHTML = '';
      const s = Save.get().settings;
      const rows = [
        { key: 'musicVolume', label: 'Music Volume', type: 'range', min: 0, max: 1, step: 0.1, val: s.musicVolume, display: Math.round(s.musicVolume * 100) + '%' },
        { key: 'soundVolume', label: 'Sound Volume', type: 'range', min: 0, max: 1, step: 0.1, val: s.soundVolume, display: Math.round(s.soundVolume * 100) + '%' },
        { key: 'screenShake', label: 'Screen Shake', type: 'toggle', val: s.screenShake },
        { key: 'particles', label: 'Particle Effects', type: 'toggle', val: s.particles },
        { key: 'reducedEffects', label: 'Reduced Effects', desc: 'Performance mode', type: 'toggle', val: s.reducedEffects },
        { key: 'reducedMotion', label: 'Reduced Motion', desc: 'Accessibility', type: 'toggle', val: s.reducedMotion },
        { key: 'fpsCounter', label: 'FPS Counter', type: 'toggle', val: s.fpsCounter },
        { key: 'mobileControlSize', label: 'Mobile Control Size', type: 'range', min: 0.7, max: 1.4, step: 0.1, val: s.mobileControlSize, display: Math.round(s.mobileControlSize * 100) + '%' },
      ];
      rows.forEach((r) => {
        const row = document.createElement('div');
        row.className = 'setting-row';
        let control = '';
        if (r.type === 'range') {
          control = `<input type="range" class="range-input" data-key="${r.key}" min="${r.min}" max="${r.max}" step="${r.step}" value="${r.val}"><span class="range-val" id="rv-${r.key}">${r.display}</span>`;
        } else {
          control = `<div class="toggle ${r.val ? 'on' : ''}" data-key="${r.key}"></div>`;
        }
        row.innerHTML = `<div class="s-label">${r.label}${r.desc ? `<span class="s-desc">${r.desc}</span>` : ''}</div>${control}`;
        list.appendChild(row);
      });
      // events
      list.querySelectorAll('.range-input').forEach((el) => {
        el.addEventListener('input', (e) => {
          const key = e.target.dataset.key;
          const v = parseFloat(e.target.value);
          Settings.set(key, v);
          const dv = $('rv-' + key);
          if (dv) dv.textContent = Math.round(v * 100) + '%';
          if (key === 'mobileControlSize') MobileControls.applySize();
        });
      });
      list.querySelectorAll('.toggle').forEach((el) => {
        el.addEventListener('click', () => {
          const key = el.dataset.key;
          const v = !Save.get().settings[key];
          Settings.set(key, v);
          el.classList.toggle('on', v);
        });
      });
      // reset button
      const resetBtn = document.createElement('button');
      resetBtn.className = 'menu-btn danger reset-btn';
      resetBtn.textContent = 'RESET SAVE DATA';
      resetBtn.addEventListener('click', () => this.confirmReset());
      list.appendChild(resetBtn);
    },
    confirmReset() {
      this.confirm('Reset all save data? This cannot be undone.', () => {
        Save.reset();
        AudioM.play('click');
        this.renderMenu();
        this.openSettings();
        this.toast('Save data reset.');
      });
    },
    bindSettings() {
      $('btnSettingsBack').addEventListener('click', () => {
        AudioM.play('click');
        if (this._settingsBack === 'pause') {
          this.showScreen('pauseScreen');
        } else {
          this.openMenu();
        }
      });
    },

    // ---- Stats ----
    openStats() {
      this.renderStats();
      this.showScreen('statsScreen');
    },
    renderStats() {
      const st = Save.get().statistics;
      const pd = Save.get().playerData;
      const grid = $('statsGrid');
      const items = [
        ['Highest Floor', pd.highestFloor],
        ['Best Score', pd.bestScore.toLocaleString()],
        ['Total Runs', st.totalRuns],
        ['Enemies Defeated', st.totalKills],
        ['Bosses Defeated', st.totalBossKills],
        ['Coins Collected', st.totalCoins.toLocaleString()],
        ['Longest Run', st.longestRun + 's'],
        ['Total Play Time', this.fmtTime(st.totalPlayTime)],
        ['Revives Used', st.revivesUsed],
      ];
      grid.innerHTML = '';
      items.forEach(([label, val]) => {
        const box = document.createElement('div');
        box.className = 'stat-box';
        box.innerHTML = `<div class="sb-v">${val}</div><div class="sb-l">${label}</div>`;
        grid.appendChild(box);
      });
    },
    fmtTime(sec) {
      sec = Math.floor(sec);
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
      if (h > 0) return h + 'h ' + m + 'm';
      if (m > 0) return m + 'm ' + s + 's';
      return s + 's';
    },
    bindStats() {
      $('btnStatsBack').addEventListener('click', () => { AudioM.play('click'); this.openMenu(); });
    },

    // ---- Daily ----
    openDaily() {
      this.renderDaily();
      this.showScreen('dailyScreen');
    },
    renderDaily() {
      const ch = Daily.getChallenge();
      const s = Save.get().dailyChallenge;
      const today = Daily.isToday(s);
      $('dailyDate').textContent = 'Today: ' + ch.date;
      $('dailyDesc').innerHTML =
        `<strong>Reach Floor ${ch.targetFloor}</strong><br><br>` +
        `Modifier: <strong>${ch.modifier.name}</strong><br>${ch.modifier.desc}<br><br>` +
        `Reward: <strong>${ch.reward} coins</strong>`;
      const result = $('dailyResult');
      const claimBtn = $('btnDailyClaim');
      if (today && s.completed) {
        if (s.rewardClaimed) { result.textContent = '✓ Completed — reward claimed!'; claimBtn.style.display = 'none'; }
        else { result.textContent = '✓ Completed! Reward available.'; claimBtn.style.display = ''; }
      } else if (today) {
        result.textContent = s.bestFloor > 0 ? 'Best today: Floor ' + s.bestFloor + ' (not yet completed)' : 'Not completed yet today.';
        claimBtn.style.display = 'none';
      } else {
        result.textContent = '';
        claimBtn.style.display = 'none';
      }
    },
    bindDaily() {
      $('btnDailyPlay').addEventListener('click', () => {
        AudioM.play('click');
        Game.startDailyRun();
      });
      $('btnDailyClaim').addEventListener('click', () => {
        const got = Daily.claimReward();
        if (got > 0) { AudioM.play('chest'); this.toast('+' + got + ' coins claimed!'); this.renderDaily(); }
        else this.toast('Reward not available.');
      });
      $('btnDailyBack').addEventListener('click', () => { AudioM.play('click'); this.openMenu(); });
    },

    // ---- Floor choice ----
    showFloorChoice(choices, desc) {
      $('choiceDesc').textContent = desc || '';
      const cards = $('choiceCards');
      cards.innerHTML = '';
      const order = ['safe', 'danger', 'insane'];
      order.forEach((key) => {
        if (!choices[key]) return;
        const c = choices[key];
        const card = document.createElement('div');
        card.className = 'choice-card ' + key;
        card.innerHTML = `<div><div class="cc-name">${c.name}</div><div class="cc-desc">${c.desc}</div></div><div class="cc-reward">${c.coins} ●</div>`;
        card.addEventListener('click', () => Game.chooseFloor(key));
        cards.appendChild(card);
      });
      this.showScreen('floorChoiceScreen');
    },
    bindFloorChoice() {
      $('btnChoiceSkip').addEventListener('click', () => { AudioM.play('click'); Game.chooseFloor('safe'); });
    },

    // ---- Chest ----
    showChestReward(rarity, msg) {
      $('chestTitle').textContent = (rarity || 'COMMON').toUpperCase() + ' CHEST';
      $('chestReward').textContent = msg;
      $('chestAnim').textContent = rarity === 'legendary' ? '💎' : (rarity === 'epic' ? '🔮' : (rarity === 'rare' ? '📦' : '🎁'));
      this.showScreen('chestScreen');
      AudioM.play('chest');
    },
    bindChest() {
      $('btnChestOk').addEventListener('click', () => { AudioM.play('click'); Game.closeChest(); });
    },

    // ---- Floor complete ----
    showFloorComplete(floor, score, coins) {
      $('fcFloor').textContent = floor;
      $('fcScore').textContent = score;
      $('fcCoins').textContent = coins;
      this.showScreen('floorCompleteScreen');
    },
    bindFloorComplete() {
      $('btnContinue').addEventListener('click', () => { AudioM.play('click'); Game.continueRun(); });
    },

    // ---- Death ----
    showDeath(stats) {
      $('dFloor').textContent = stats.floor;
      $('dScore').textContent = stats.score;
      $('dCoins').textContent = stats.coins;
      $('dKills').textContent = stats.kills;
      $('dTime').textContent = stats.time + 's';
      $('dBestFloor').textContent = stats.bestFloor;
      const reviveBtn = $('btnRevive');
      if (Ads.enabled && stats.canRevive) {
        reviveBtn.style.display = '';
      } else {
        reviveBtn.style.display = 'none';
      }
      // Make the restart clearly say it continues from the saved floor (so the
      // player knows dying doesn't reset them to floor 1).
      const retryBtn = $('btnTryAgain');
      if (retryBtn && stats.continueFloor && stats.continueFloor > 1) {
        retryBtn.textContent = 'CONTINUE (FLOOR ' + stats.continueFloor + ')';
      } else if (retryBtn) {
        retryBtn.textContent = 'TRY AGAIN';
      }
      this.showScreen('deathScreen');
    },
    bindDeath() {
      $('btnRevive').addEventListener('click', () => { AudioM.play('click'); Game.tryRevive(); });
      $('btnTryAgain').addEventListener('click', () => { AudioM.play('click'); Game.startRun(); });
      $('btnMainMenu').addEventListener('click', () => { AudioM.play('click'); Game.toMenu(); });
    },

    // ---- Pause ----
    showPause() {
      this.showScreen('pauseScreen');
    },
    bindPause() {
      $('btnResume').addEventListener('click', () => { AudioM.play('click'); Game.resume(); });
      $('btnPauseSettings').addEventListener('click', () => { AudioM.play('click'); Game.openPauseSettings(); });
      $('btnQuitRun').addEventListener('click', () => {
        this.confirm('Quit the run? All run progress will be lost.', () => { AudioM.play('click'); Game.quitRun(); });
      });
    },

    // ---- Tutorial ----
    showTutorial() {
      this.showScreen('tutorialScreen');
    },
    bindTutorial() {
      $('btnTutStart').addEventListener('click', () => { AudioM.play('click'); Game.startRunFromTutorial(); });
      $('btnTutSkip').addEventListener('click', () => { AudioM.play('click'); Game.startRunFromTutorial(); });
    },

    // ---- Helpers ----
    openMenu() {
      this.renderMenu();
      this.showScreen('menuScreen');
    },

    toast(msg, dur) {
      const t = $('toast');
      t.textContent = msg;
      t.classList.remove('hidden');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => t.classList.add('hidden'), (dur || 1.6) * 1000);
    },

    confirm(text, onOk) {
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.innerHTML = `<div class="confirm-box"><div class="cb-text">${text}</div><div class="confirm-actions"><button class="menu-btn" id="cfNo">CANCEL</button><button class="menu-btn primary" id="cfYes">CONFIRM</button></div></div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#cfNo').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#cfYes').addEventListener('click', () => { overlay.remove(); onOk(); });
    },
  };

  global.UI = UI;
})(window);
