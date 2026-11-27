/* ============================================================
   ads.js — Advertisement integration layer.
   The game NEVER depends on ads to function. All functions are
   safe placeholders until a real ad provider is configured.
   ============================================================ */
(function (global) {
  'use strict';

  // Ad provider status. When a real provider is wired up, set
  // AD_PROVIDER = { ... } with init/showBanner/showInterstitial/showRewarded.
  const AD_PROVIDER = null;
  const ADS_ENABLED = false;

  const Ads = {
    enabled: ADS_ENABLED,

    _bannerShown: false,

    // ---- Lifecycle -------------------------------------------------
    initializeAds() {
      try {
        if (AD_PROVIDER && typeof AD_PROVIDER.init === 'function') {
          AD_PROVIDER.init();
          this.enabled = true;
        }
      } catch (e) {
        console.warn('[ads] init failed', e);
        this.enabled = false;
      }
      // If no provider, everything stays disabled and harmless.
      return this.enabled;
    },

    // ---- Banner ----------------------------------------------------
    showBannerAd() {
      if (!this.enabled || !AD_PROVIDER) return false;
      try {
        if (typeof AD_PROVIDER.showBanner === 'function') {
          AD_PROVIDER.showBanner();
          this._bannerShown = true;
          return true;
        }
      } catch (e) { console.warn('[ads] banner failed', e); }
      return false;
    },

    hideBannerAd() {
      if (!this.enabled || !AD_PROVIDER) return false;
      try {
        if (typeof AD_PROVIDER.hideBanner === 'function') {
          AD_PROVIDER.hideBanner();
          this._bannerShown = false;
          return true;
        }
      } catch (e) { console.warn('[ads] hide banner failed', e); }
      return false;
    },

    // ---- Interstitial ----------------------------------------------
    // Returns a Promise<boolean> indicating whether an ad completed
    // (true = show allowed & finished, false = unavailable/failed).
    // NEVER blocks gameplay: resolves false on any failure.
    showInterstitialAd() {
      return new Promise((resolve) => {
        if (!this.enabled || !AD_PROVIDER || typeof AD_PROVIDER.showInterstitial !== 'function') {
          resolve(false);
          return;
        }
        try {
          AD_PROVIDER.showInterstitial({
            onClose: () => resolve(true),
            onFail: () => resolve(false),
          });
        } catch (e) { resolve(false); }
      });
    },

    // ---- Rewarded --------------------------------------------------
    // Returns Promise<boolean> — true ONLY if the user actually
    // completed a rewarded ad. Never falsely grants a reward.
    showRewardedAd() {
      return new Promise((resolve) => {
        if (!this.enabled || !AD_PROVIDER || typeof AD_PROVIDER.showRewarded !== 'function') {
          resolve(false);
          return;
        }
        try {
          AD_PROVIDER.showRewarded({
            onRewarded: () => resolve(true),   // only called when reward earned
            onClose: () => resolve(false),      // closed without reward
            onFail: () => resolve(false),
          });
        } catch (e) { resolve(false); }
      });
    },

    // ---- Status helpers --------------------------------------------
    isBannerShown() { return this._bannerShown; },
  };

  global.Ads = Ads;
})(window);
