/* ============================================================
   weapons.js — player energy weapon & attack handling.
   ============================================================ */
(function (global) {
  'use strict';

  // Player weapon config. The primary attack fires an energy bullet in the
  // direction the player is facing (bullet-shooter style).
  const Weapons = {
    baseDamage: 15,
    baseCooldown: 0.32,
    baseBulletSpeed: 520,

    getDamage() {
      const ug = Save.get().upgrades;
      return this.baseDamage * (1 + ug.damage * 0.25);
    },
    getCooldown() {
      const ug = Save.get().upgrades;
      return Math.max(0.08, this.baseCooldown / (1 + ug.attackSpeed * 0.18));
    },
    getBulletSpeed() { return this.baseBulletSpeed; },
  };

  global.Weapons = Weapons;
})(window);
