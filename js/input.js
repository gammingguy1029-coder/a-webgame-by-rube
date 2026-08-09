/* ============================================================
   input.js — keyboard + mouse input with buffering.
   Touch handled by mobileControls.js.
   ============================================================ */
(function (global) {
  'use strict';

  const Input = {
    keys: {},
    // Buffered "just pressed" actions (consumed by game each frame).
    bufferedJump: false,
    bufferedAttack: false,
    bufferedDash: false,

    touchMove: 0,        // -1, 0, 1 set by mobile controls
    touchJump: false,
    touchAttack: false,
    touchDash: false,

    mouseDown: false,
    mouse: { x: 0, y: 0 },

    isTouchDevice() {
      return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    },

    init() {
      window.addEventListener('keydown', (e) => this.keyDown(e));
      window.addEventListener('keyup', (e) => this.keyUp(e));
      window.addEventListener('mousedown', (e) => this.mouseDownHandler(e));
      window.addEventListener('mouseup', (e) => this.mouseUpHandler(e));
      window.addEventListener('blur', () => this.clear());
      window.addEventListener('contextmenu', (e) => e.preventDefault());
      // Prevent double-tap zoom & scrolling
      document.addEventListener('gesturestart', (e) => e.preventDefault());
      document.addEventListener('touchmove', (e) => {
        // prevent scrolling during gameplay
        if (Game && Game.state === 'PLAYING') e.preventDefault();
      }, { passive: false });
    },

    clear() {
      this.keys = {};
      this.touchMove = 0;
      this.touchJump = this.touchAttack = this.touchDash = false;
      this.mouseDown = false;
      this.bufferedJump = this.bufferedAttack = this.bufferedDash = false;
    },

    keyDown(e) {
      const k = e.key;
      // Only lock movement keys.
      const prevent = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '];
      if (prevent.indexOf(k) !== -1) e.preventDefault();
      // don't process if typing in an input
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (this.keys[k]) return;
      this.keys[k] = true;
      // Buffer actions (fires once per keydown)
      if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') this.bufferedJump = true;
      if (k === 'Shift') this.bufferedDash = true;
      AudioM.unlock();
    },

    keyUp(e) {
      this.keys[e.key] = false;
    },

    mouseDownHandler(e) {
      if (e.button === 0) {
        this.mouseDown = true;
        // Only buffer an attack while actually playing; clicking UI buttons
        // (PLAY, upgrades, etc.) must not trigger a swing.
        if (global.Game && Game.state === 'PLAYING') {
          this.bufferedAttack = true;
        }
      }
      AudioM.unlock();
    },

    mouseUpHandler(e) {
      if (e.button === 0) this.mouseDown = false;
    },

    moveLeft() {
      return !!this.keys['a'] || !!this.keys['A'] || !!this.keys['ArrowLeft'] || this.touchMove < 0;
    },
    moveRight() {
      return !!this.keys['d'] || !!this.keys['D'] || !!this.keys['ArrowRight'] || this.touchMove > 0;
    },

    consumeJump() {
      const v = this.bufferedJump || this.touchJump;
      this.bufferedJump = false; this.touchJump = false;
      return v;
    },
    consumeAttack() {
      const v = this.bufferedAttack || this.touchAttack;
      this.bufferedAttack = false; this.touchAttack = false;
      return v;
    },
    consumeDash() {
      const v = this.bufferedDash || this.touchDash;
      this.bufferedDash = false; this.touchDash = false;
      return v;
    },

    // Called by mobile controls to set touch actions
    setTouchMove(dir) { this.touchMove = dir; },
    setTouchAction(type, pressed) {
      if (type === 'jump') this.touchJump = pressed;
      else if (type === 'attack') this.touchAttack = pressed;
      else if (type === 'dash') this.touchDash = pressed;
    },
  };

  global.Input = Input;
})(window);
