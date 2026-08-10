/* ============================================================
   save.js — LocalStorage save system.
   Single versioned, validated save object. Never executes
   saved data as code. Never crashes on corrupt data.
   ============================================================ */
(function (global) {
  'use strict';

  const SAVE_KEY = 'oneMoreFloorSave';
  const SAVE_VERSION = 3;

  function num(v, def, min, max) {
    v = Number(v);
    if (Number.isNaN(v) || !Number.isFinite(v)) v = def;
    if (min !== undefined && v < min) v = min;
    if (max !== undefined && v > max) v = max;
    return v;
  }
  function int(v, def, min, max) { return Math.floor(num(v, def, min, max)); }

  const defaultSave = {
    saveVersion: SAVE_VERSION,
    playerData: { coins: 0, highestFloor: 1, bestScore: 0, continueFloor: 1 },
    upgrades: {
      health: 0, damage: 0, speed: 0, dash: 0,
      attackSpeed: 0, luck: 0, coinBonus: 0,
    },
    statistics: {
      totalRuns: 0, totalKills: 0, totalBossKills: 0,
      totalCoins: 0, totalPlayTime: 0, longestRun: 0, revivesUsed: 0,
    },
    settings: {
      musicVolume: 0.6, soundVolume: 0.8, screenShake: true,
      particles: true, reducedEffects: false, mobileControlSize: 1.0,
      fpsCounter: false, reducedMotion: false,
    },
    dailyChallenge: { date: '', seed: 0, completed: false, bestFloor: 0, rewardClaimed: false },
    unlocks: { tutorialSeen: false },
  };

  let save = null;
  let storageAvailable = true;
  let storageBlocked = false;

  function testStorage() {
    try {
      global.localStorage.setItem('__omf_test__', '1');
      global.localStorage.removeItem('__omf_test__');
      return true;
    } catch (e) { return false; }
  }

  function validate(raw) {
    // If not an object, start fresh.
    if (!raw || typeof raw !== 'object') return null;
    const s = {};
    s.saveVersion = num(raw.saveVersion, SAVE_VERSION, 1, 999);

    const pd = raw.playerData || {};
    s.playerData = {
      coins: int(pd.coins, 0, 0, 1e15),
      highestFloor: int(pd.highestFloor, 1, 1, 1e9),
      bestScore: int(pd.bestScore, 0, 0, 1e15),
      // The floor the player will continue from after dying (never resets to 1
      // on death/restart, so progress is kept on the local device).
      continueFloor: int(pd.continueFloor, 1, 1, 1e9),
    };

    const ug = raw.upgrades || {};
    s.upgrades = {
      health: int(ug.health, 0, 0, 99),
      damage: int(ug.damage, 0, 0, 99),
      speed: int(ug.speed, 0, 0, 99),
      dash: int(ug.dash, 0, 0, 99),
      attackSpeed: int(ug.attackSpeed, 0, 0, 99),
      luck: int(ug.luck, 0, 0, 99),
      coinBonus: int(ug.coinBonus, 0, 0, 99),
    };

    const st = raw.statistics || {};
    s.statistics = {
      totalRuns: int(st.totalRuns, 0, 0, 1e15),
      totalKills: int(st.totalKills, 0, 0, 1e15),
      totalBossKills: int(st.totalBossKills, 0, 0, 1e15),
      totalCoins: int(st.totalCoins, 0, 0, 1e18),
      totalPlayTime: num(st.totalPlayTime, 0, 0, 1e12),
      longestRun: num(st.longestRun, 0, 0, 1e9),
      revivesUsed: int(st.revivesUsed, 0, 0, 1e9),
    };

    const se = raw.settings || {};
    s.settings = {
      musicVolume: num(se.musicVolume, 0.6, 0, 1),
      soundVolume: num(se.soundVolume, 0.8, 0, 1),
      screenShake: se.screenShake !== undefined ? !!se.screenShake : true,
      particles: se.particles !== undefined ? !!se.particles : true,
      reducedEffects: !!se.reducedEffects,
      mobileControlSize: num(se.mobileControlSize, 1.0, 0.7, 1.4),
      fpsCounter: !!se.fpsCounter,
      reducedMotion: !!se.reducedMotion,
    };

    const dc = raw.dailyChallenge || {};
    s.dailyChallenge = {
      date: typeof dc.date === 'string' ? dc.date : '',
      seed: num(dc.seed, 0, 0, 1e15),
      completed: !!dc.completed,
      bestFloor: int(dc.bestFloor, 0, 0, 1e9),
      rewardClaimed: !!dc.rewardClaimed,
    };

    const un = raw.unlocks || {};
    s.unlocks = { tutorialSeen: !!un.tutorialSeen };

    return s;
  }

  function load() {
    storageAvailable = testStorage();
    if (!storageAvailable) { storageBlocked = true; save = JSON.parse(JSON.stringify(defaultSave)); return save; }
    let raw = null;
    try {
      const str = global.localStorage.getItem(SAVE_KEY);
      if (str) raw = JSON.parse(str);
    } catch (e) { raw = null; }
    const validated = validate(raw);
    if (!validated) {
      // recovery failed -> new save
      save = JSON.parse(JSON.stringify(defaultSave));
    } else {
      save = validated;
    }
    // Ensure the settings object fully merged (allow missing fields gracefully).
    save = validate(Object.assign({}, save, { saveVersion: SAVE_VERSION }));
    return save;
  }

  function persist() {
    if (!storageAvailable) return false;
    try {
      global.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
      return true;
    } catch (e) { storageBlocked = true; return false; }
  }

  const Save = {
    load,
    persist,
    get() { return save; },
    reset() {
      save = JSON.parse(JSON.stringify(defaultSave));
      persist();
      return save;
    },
    storageAvailable: () => storageAvailable,
    storageBlocked: () => storageBlocked,
  };

  global.Save = Save;
})(window);
