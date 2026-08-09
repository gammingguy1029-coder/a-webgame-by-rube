/* ============================================================
   weapons.js — player energy weapon & attack handling.
   ============================================================ */
(function (global) {
  'use strict';

  // Player weapon config. Swing attack in facing direction.
  const Weapons = {
    baseDamage: 15,
    baseCooldown: 0.35,
    baseReach: 56,
    baseArc: 1.9, // radians, centered on facing direction

    getDamage() {
      const ug = Save.get().upgrades;
      return this.baseDamage * (1 + ug.damage * 0.25);
    },
    getCooldown() {
      const ug = Save.get().upgrades;
      return Math.max(0.08, this.baseCooldown / (1 + ug.attackSpeed * 0.18));
    },
    getReach() { return this.baseReach; },
    getArc() { return this.baseArc; },
  };

  global.Weapons = Weapons;
})(window);
