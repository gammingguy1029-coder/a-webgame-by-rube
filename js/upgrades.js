/* ============================================================
   upgrades.js — permanent upgrade definitions & stats.
   ============================================================ */
(function (global) {
  'use strict';

  const UPGRADE_DEFS = {
    health: { name: 'HEALTH', icon: '♥', desc: 'Maximum health', base: 60, growth: 1.6, maxLevel: 20,
      valueFor: l => 100 + l * 20, nextFor: l => 100 + (l + 1) * 20 },
    damage: { name: 'DAMAGE', icon: '⚔', desc: 'Attack damage', base: 60, growth: 1.6, maxLevel: 20,
      valueFor: l => Math.round(15 * (1 + l * 0.25)), nextFor: l => Math.round(15 * (1 + (l + 1) * 0.25)) },
    speed: { name: 'SPEED', icon: '»', desc: 'Move speed', base: 60, growth: 1.6, maxLevel: 20,
      valueFor: l => (1 + l * 0.08).toFixed(2), nextFor: l => (1 + (l + 1) * 0.08).toFixed(2) },
    dash: { name: 'DASH', icon: '≡', desc: 'Dash cooldown', base: 60, growth: 1.6, maxLevel: 20,
      valueFor: l => (1.4 / (1 + l * 0.12)).toFixed(2) + 's', nextFor: l => (1.4 / (1 + (l + 1) * 0.12)).toFixed(2) + 's' },
    attackSpeed: { name: 'ATTACK SPEED', icon: '⚡', desc: 'Faster attacks', base: 60, growth: 1.6, maxLevel: 20,
      valueFor: l => (1 + l * 0.18).toFixed(2), nextFor: l => (1 + (l + 1) * 0.18).toFixed(2) },
    luck: { name: 'LUCK', icon: '☘', desc: 'Rare reward chance', base: 80, growth: 1.7, maxLevel: 15,
      valueFor: l => (l * 2) + '%', nextFor: l => ((l + 1) * 2) + '%' },
    coinBonus: { name: 'COIN BONUS', icon: '●', desc: 'Coin rewards', base: 80, growth: 1.7, maxLevel: 15,
      valueFor: l => '+' + (l * 10) + '%', nextFor: l => '+' + ((l + 1) * 10) + '%' },
  };

  const Upgrades = {
    priceFor(key, level) {
      const d = UPGRADE_DEFS[key];
      return Math.floor(d.base * Math.pow(d.growth, level));
    },

    getStats() {
      const ug = Save.get().upgrades;
      const maxHealth = 100 + ug.health * 20;
      const dmgMul = 1 + ug.damage * 0.25;
      const speedMul = 1 + ug.speed * 0.08;
      const dashCooldown = 1.4 / (1 + ug.dash * 0.12);
      const coinBonus = 1 + ug.coinBonus * 0.10;
      return { maxHealth, dmgMul, speedMul, dashCooldown, coinBonus };
    },

    coinMultiplier() { return this.getStats().coinBonus; },
    luckBonus() { return Save.get().upgrades.luck * 2; },
  };

  global.Upgrades = Upgrades;
  global.UPGRADE_DEFS = UPGRADE_DEFS;
})(window);
