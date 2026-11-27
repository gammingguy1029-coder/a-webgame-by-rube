/* ============================================================
   collision.js — AABB collision helpers.
   ============================================================ */
(function (global) {
  'use strict';

  const Collision = {
    rectsOverlap(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    },
    pointInRect(px, py, r) {
      return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
    },
    circleRect(cx, cy, r, rect) {
      const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
      const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
      const dx = cx - nx, dy = cy - ny;
      return (dx * dx + dy * dy) < (r * r);
    },
  };

  global.Collision = Collision;
})(window);
