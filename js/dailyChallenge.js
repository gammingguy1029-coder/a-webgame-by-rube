/* ============================================================
   dailyChallenge.js — deterministic daily challenge seeded from
   the local date. Same challenge on the same date/device.
   NOT a global leaderboard — results are local only.
   ============================================================ */
(function (global) {
  'use strict';

  // mulberry32 deterministic PRNG
  function hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function todayString() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  const MODIFIERS = [
    { id: 'halfHealth', name: 'HALF HEALTH', desc: 'Start with 50% max health' },
    { id: 'doubleEnemySpeed', name: 'DOUBLE ENEMY SPEED', desc: 'Enemies move & attack twice as fast' },
    { id: 'noHeal', name: 'NO HEALING', desc: 'Chests and rewards do not restore health' },
    { id: 'fasterTraps', name: 'FASTER TRAPS', desc: 'Traps cycle much faster' },
    { id: 'doubleDamage', name: 'GLASS CANNON', desc: 'Enemies deal 1.5x damage, you deal 1.3x' },
    { id: 'darkness', name: 'DARKNESS', desc: 'Every floor is shrouded in darkness' },
  ];

  const Daily = {
    todayString,
    seed() {
      return hashStr('omf-' + todayString());
    },

    getChallenge() {
      const rng = mulberry32(this.seed());
      const targetFloor = Math.round(5 + rng() * 15);          // 5..20
      const modifier = MODIFIERS[Math.floor(rng() * MODIFIERS.length)];
      const reward = 100 + targetFloor * 15;
      return { date: todayString(), seed: this.seed(), targetFloor, modifier, reward };
    },

    isToday(data) {
      return data && data.date === todayString() && data.seed === this.seed();
    },

    // Record the player's result for today's challenge.
    // Never resets rewardClaimed, otherwise re-completing the daily would let
    // the player claim the reward more than once per day (GAME-DAILY-001).
    recordResult(bestFloor, success) {
      const s = Save.get();
      const today = this.getChallenge();
      const prev = s.dailyChallenge;
      s.dailyChallenge = {
        date: today.date, seed: today.seed,
        completed: prev.completed || !!success,
        bestFloor: Math.max(prev.bestFloor, bestFloor),
        rewardClaimed: !!prev.rewardClaimed,
      };
      Save.persist();
    },

    claimReward() {
      const s = Save.get();
      const dc = s.dailyChallenge;
      if (!this.isToday(dc)) return 0;
      if (dc.completed && !dc.rewardClaimed) {
        const reward = this.getChallenge().reward;
        const s2 = Save.get();
        s2.playerData.coins += reward;
        s2.statistics.totalCoins += reward;
        s2.dailyChallenge.rewardClaimed = true;
        Save.persist();
        return reward;
      }
      return 0;
    },
  };

  global.Daily = Daily;
})(window);
