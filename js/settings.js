/* ============================================================
   settings.js — read/write settings from save.settings.
   ============================================================ */
(function (global) {
  'use strict';

  const Settings = {
    get() { return Save.get().settings; },

    set(key, value) {
      this.get()[key] = value;
      Save.persist();
      // Push live to audio if relevant. Note: we intentionally do NOT re-render
      // the whole settings list here — the settings handlers update their own
      // control's display, and rebuilding the list on every input event would
      // destroy the slider/toggle mid-interaction (UI bug).
      if (global.AudioM) AudioM.onSettingsChange();
    },

    isTouch() { return global.Input ? Input.isTouchDevice() : false; },
    mobileControlsVisible() { return this.isTouch(); },
  };

  global.Settings = Settings;
})(window);
