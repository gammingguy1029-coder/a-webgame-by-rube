/* ============================================================
   mobileControls.js — large touch buttons for mobile play.
   Prevents scrolling/zoom, gives press feedback.
   ============================================================ */
(function (global) {
  'use strict';

  const MobileControls = {
    enabled: false,

    init() {
      const container = document.getElementById('touchControls');
      if (!container) return;

      const btnDefs = [
        ['left', 'tcLeft'], ['right', 'tcRight'],
        ['jump', 'tcJump'], ['attack', 'tcAttack'], ['dash', 'tcDash'],
      ];
      btnDefs.forEach(([action, id]) => {
        const el = document.getElementById(id);
        if (!el) return;
        this.bindButton(el, action);
      });
      this.applySize();
    },

    bindButton(el, action) {
      const setPressed = (pressed) => {
        if (pressed) el.classList.add('pressed');
        else el.classList.remove('pressed');
      };
      const activate = (pressed) => {
        if (action === 'left') { Input.setTouchMove(pressed ? -1 : 0); }
        else if (action === 'right') { Input.setTouchMove(pressed ? 1 : 0); }
        else { Input.setTouchAction(action, pressed); }
        if (pressed) AudioM.unlock();
        setPressed(pressed);
      };

      // Touch events
      el.addEventListener('touchstart', (e) => { e.preventDefault(); activate(true); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); activate(false); }, { passive: false });
      el.addEventListener('touchcancel', (e) => { e.preventDefault(); activate(false); }, { passive: false });
      // If the finger slides off the button while still down, release it so
      // direction/action input is not left stuck (GAME-MOB-001).
      el.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const t = e.changedTouches && e.changedTouches[0];
        if (!t) return;
        const r = el.getBoundingClientRect();
        const inside = t.clientX >= r.left && t.clientX <= r.right &&
                       t.clientY >= r.top && t.clientY <= r.bottom;
        if (!inside) activate(false);
      }, { passive: false });
      // Mouse fallback for desktop testing
      el.addEventListener('mousedown', (e) => { e.preventDefault(); activate(true); });
      el.addEventListener('mouseup', (e) => { e.preventDefault(); activate(false); });
      el.addEventListener('mouseleave', () => activate(false));
    },

    applySize() {
      const s = Save.get().settings.mobileControlSize;
      const btns = document.querySelectorAll('.tc-btn');
      const w = 74 * s, h = 74 * s;
      btns.forEach((b) => {
        b.style.width = w + 'px';
        b.style.height = h + 'px';
        if (b.classList.contains('small')) {
          b.style.width = (62 * s) + 'px';
          b.style.height = (62 * s) + 'px';
        }
      });
    },

    show() {
      if (!this.enabled) return;
      const c = document.getElementById('touchControls');
      if (c) c.classList.remove('hidden');
    },
    hide() {
      const c = document.getElementById('touchControls');
      if (c) c.classList.add('hidden');
      Input.touchMove = 0; Input.touchJump = Input.touchAttack = Input.touchDash = false;
    },
  };

  global.MobileControls = MobileControls;
})(window);
