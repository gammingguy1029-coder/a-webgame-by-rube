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
      // Push live to audio if relevant.
      if (global.AudioM) AudioM.onSettingsChange();
      if (global.UI) UI.renderSettings();
    },

    isTouch() { return global.Input ? Input.isTouchDevice() : false; },
    mobileControlsVisible() { return this.isTouch(); },
  };

  global.Settings = Settings;
})(window);
