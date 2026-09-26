/* AdMob for Arrow Escape: three rewarded placements and one interstitial.
 *
 * No banners, by design: the board fills the screen and an advert anchored under it would take
 * its space and sit against the button bar. Three of the four adverts here are rewarded videos
 * the player chose, in place of coins they did not want to spend, asked for only from
 * showRewardedAd() in game.js. The fourth is the interstitial, which the player does not choose;
 * it is held to one every five cleared levels or fifteen minutes, whichever comes first, never
 * during a board, never within a minute and a half of a rewarded video, and it is skipped
 * outright if it is not already loaded.
 *
 * Plugin: @capacitor-community/admob, the same one Rectango uses. In a browser, or in the test
 * harness, there is no Capacitor bridge, isNative stays false, and game.js falls back to its
 * simulated video.
 *
 * These are the live unit IDs. A debuggable build (installed with adb or from Android Studio)
 * is served Google's test videos instead, decided by the BuildInfo plugin in MainActivity, so
 * tapping an advert on a development phone never counts as invalid traffic.
 */
(function () {
  'use strict';

  const UNITS = {
    help:     'ca-app-pub-5806795971221958/1741902556',   // hints, deeper hints, the reveal
    continue: 'ca-app-pub-5806795971221958/8115739216',   // more time or lives after a loss
    double:   'ca-app-pub-5806795971221958/9125568555'    // doubling the coins of a win
  };
  const PLACEMENTS = Object.keys(UNITS);
  /* Not one of PLACEMENTS: it is a different format with its own load, show and events. */
  const INTERSTITIAL = 'ca-app-pub-5806795971221958/8901512742';
  const IEV = { dismissed: 'interstitialAdDismissed', failed: 'interstitialAdFailedToShow' };

  /* Force test videos even in a release build, for a build handed to testers. Must be false for
     the bundle uploaded to Google Play. */
  const FORCE_TEST_ADS = false;
  let testing = FORCE_TEST_ADS;

  /* AdMob stops honouring a loaded advert after an hour, so an older one is reloaded instead. */
  const MAX_AGE = 55 * 60 * 1000;
  /* How long a player waits for a video that was not ready in advance before being told. */
  const LOAD_WAIT = 12000;

  const EV = {
    dismissed: 'onRewardedVideoAdDismissed',
    failed: 'onRewardedVideoAdFailedToShow',
    reward: 'onRewardedVideoAdReward'
  };

  const plugin = () => {
    try { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob; }
    catch (e) { return null; }
  };

  async function isDebugBuild() {
    try {
      const info = window.Capacitor.Plugins.BuildInfo;
      return !!(info && (await info.get()).debug);
    } catch (e) { return false; }
  }

  const Ads = {
    isNative: false,
    ready: false,                 // initialised and allowed to request adverts
    privacyOptionsRequired: false,
    _a: null,
    /* Per placement: when its advert loaded (0 when none is waiting), the key the plugin filed
       it under, the load in flight, and the retry back-off. */
    _at: {}, _key: {}, _loading: {}, _retry: {}, _timer: {},
    /* the same four, for the one interstitial */
    _iAt: 0, _iLoading: null, _iRetry: 0, _iTimer: 0,

    async init() {
      try {
        const nativeOk = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
        const a = nativeOk && plugin();
        if (!a) return;
        this._a = a;
        this.isNative = true;
        testing = FORCE_TEST_ADS || await isDebugBuild();
        if (testing) console.info('Ads: development build, serving Google test videos');
        await a.initialize({ initializeForTesting: testing });
        await this._consent();
        this.preloadAll();
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this.preloadAll(); });
      } catch (e) {
        console.warn('Ads: initialisation failed', e);
      }
    },

    /* The consent message configured under AdMob, Privacy and messaging. The UMP SDK decides
       whether this player needs it (the EEA, the UK, Switzerland) and shows it only when consent
       is needed and not yet given, so for most launches this returns without a form. A failure
       here must never stop the game. */
    async _consent() {
      let info = null;
      try {
        info = await this._a.requestConsentInfo();
        if (info.isConsentFormAvailable && info.status === 'REQUIRED') {
          info = await this._a.showConsentForm();
        }
      } catch (e) {
        console.warn('Ads: consent flow failed', e);
      }
      this._setPrivacy(info);
      /* Google allows requests only once the consent flow says so. A failed check (no network at
         launch, say) is not a yes: nothing is requested until a later check succeeds. */
      this.ready = !!(info && info.canRequestAds);
      this._consentAt = Date.now();
      return info;
    },
    /* A retry of the consent check, at most once a minute, for when the first one failed. */
    async _consentAgain() {
      if (this.ready || this._consentBusy || Date.now() - (this._consentAt || 0) < 60000) return;
      this._consentBusy = true;
      try { await this._consent(); } finally { this._consentBusy = false; }
      if (this.ready) this.preloadAll();
    },

    _setPrivacy(info) {
      this.privacyOptionsRequired = !!(info && info.privacyOptionsRequirementStatus === 'REQUIRED');
      document.dispatchEvent(new Event('ads-privacy-changed'));
    },

    /* The player's way back to the consent choice, from Settings. Google requires this entry
       point wherever the SDK reports it as required. */
    async showPrivacyOptions() {
      if (!this.isNative) return false;
      try {
        await this._a.showPrivacyOptionsForm();
        const info = await this._a.requestConsentInfo();
        this.ready = info.canRequestAds !== false;
        this._setPrivacy(info);
        this.preloadAll();
        return true;
      } catch (e) {
        console.warn('Ads: privacy options failed', e);
        return false;
      }
    },

    _fresh(p) { return this._at[p] > 0 && Date.now() - this._at[p] < MAX_AGE; },

    /* One load per placement at a time; callers arriving meanwhile share it. */
    _load(p) {
      if (!this._loading[p]) {
        this._loading[p] = this._a.prepareRewardVideoAd({ adId: UNITS[p], isTesting: testing })
          .then(info => {
            /* The plugin files a loaded advert under the unit it really used, which for test
               videos is Google's shared test unit rather than ours. */
            this._key[p] = (info && info.adUnitId) || UNITS[p];
            this._at[p] = Date.now();
            this._retry[p] = 0;
          })
          .finally(() => { this._loading[p] = null; });
      }
      return this._loading[p];
    },

    /* A background load, so the video is waiting before the player asks. A failure (offline, no
       fill) retries after 30 seconds, then a minute, two, and at most five. */
    preload(p) {
      if (!this.ready || this._fresh(p) || this._loading[p]) return;
      this._load(p).catch(() => {
        this._retry[p] = Math.min((this._retry[p] || 15000) * 2, 300000);
        clearTimeout(this._timer[p]);
        this._timer[p] = setTimeout(() => this.preload(p), this._retry[p]);
      });
    },
    preloadAll() {
      if (!this.ready) { this._consentAgain(); return; }
      PLACEMENTS.forEach(p => this.preload(p));
      this.preloadInterstitial();
    },

    /* ---------- the interstitial ---------- */

    interstitialReady() { return this._iAt > 0 && Date.now() - this._iAt < MAX_AGE; },

    /* Kept loaded in the background, so the game can decide in one synchronous test whether an
       advert is available and never has to make the player wait for one. */
    preloadInterstitial() {
      if (!this.isNative || !this.ready || this._iLoading || this.interstitialReady()) return;
      this._iLoading = this._a.prepareInterstitial({ adId: INTERSTITIAL, isTesting: testing })
        .then(() => { this._iAt = Date.now(); this._iRetry = 0; })
        .catch(() => {
          this._iRetry = Math.min((this._iRetry || 15000) * 2, 300000);
          clearTimeout(this._iTimer);
          this._iTimer = setTimeout(() => this.preloadInterstitial(), this._iRetry);
        })
        .finally(() => { this._iLoading = null; });
    },

    /* Shows the waiting advert. Resolves true once it has closed, false if there was nothing to
       show or it failed, and never rejects. Nothing is ever loaded on demand here: an advert the
       player did not ask for must never cost them a wait. */
    interstitial() {
      if (!this.isNative || !this._a || !this.interstitialReady()) return Promise.resolve(false);
      this._iAt = 0;                                   // a shown advert is spent
      return new Promise(async resolve => {
        let settled = false;
        const handles = [];
        const finish = shown => {
          if (settled) return;
          settled = true;
          handles.forEach(h => { try { h.remove(); } catch (e) {} });
          resolve(shown);
        };
        /* the same safety net the rewarded videos use: a plugin that never reports the end must
           not leave the game waiting behind a black screen */
        const back = () => { if (!document.hidden) setTimeout(() => finish(true), 3000); };
        document.addEventListener('visibilitychange', back);
        handles.push({ remove: () => document.removeEventListener('visibilitychange', back) });
        const hard = setTimeout(() => finish(false), 120000);
        handles.push({ remove: () => clearTimeout(hard) });
        try {
          handles.push(await this._a.addListener(IEV.dismissed, () => finish(true)));
          handles.push(await this._a.addListener(IEV.failed, () => finish(false)));
          this._a.showInterstitial().catch(() => finish(false));
        } catch (e) { finish(false); }
      }).finally(() => this.preloadInterstitial());
    },

    /* Plays the waiting advert and settles once it has closed or failed to show. */
    _show(p) {
      const key = this._key[p];
      /* A shown advert is spent. With test videos all three placements can share one key, so
         every placement holding it is spent too. */
      PLACEMENTS.forEach(q => { if (this._key[q] === key) this._at[q] = 0; });
      return new Promise(async resolve => {
        let rewarded = false, settled = false;
        const handles = [];
        const finish = shown => {
          if (settled) return;
          settled = true;
          handles.forEach(h => { try { h.remove(); } catch (e) {} });
          resolve({ shown, rewarded });
        };
        /* A safety net: if the plugin never reports the end of the video, the game must not wait
           for ever. Once the player is back in the game, a few seconds without a report count as
           the video being over, rewarded or not by what was reported meanwhile. A hard limit
           covers the rest. */
        const back = () => { if (!document.hidden) setTimeout(() => finish(true), 4000); };
        document.addEventListener('visibilitychange', back);
        handles.push({ remove: () => document.removeEventListener('visibilitychange', back) });
        const hard = setTimeout(() => finish(false), 180000);
        handles.push({ remove: () => clearTimeout(hard) });
        try {
          handles.push(await this._a.addListener(EV.dismissed, () => finish(true)));
          handles.push(await this._a.addListener(EV.failed, () => finish(false)));
          handles.push(await this._a.addListener(EV.reward, () => { rewarded = true; }));
          /* show() resolves when the reward is earned, not when the advert closes, so it is not
             awaited; the dismissed event is the only dependable end. */
          this._a.showRewardVideoAd({ adId: key }).catch(() => finish(false));
        } catch (e) { finish(false); }
      }).finally(() => this.preloadAll());
    },

    /* The whole public contract. Resolves to one of:
         'rewarded'     the video played to the end, pay the reward
         'closed'       the player closed it early, no reward
         'offline'      there is no connection
         'unavailable'  no video to be had right now (no fill, an error, a timeout)
       Never rejects, so the game always gets an answer and never hangs in its loading modal. */
    async rewarded(p) {
      if (!this.isNative || !this._a) return 'unavailable';
      if (!UNITS[p]) p = 'help';
      if (navigator.onLine === false) return 'offline';
      try {
        if (!this.ready) return 'unavailable';
        if (!this._fresh(p)) {
          const timeout = new Promise((_, no) => setTimeout(() => no(new Error('timeout')), LOAD_WAIT));
          await Promise.race([this._load(p), timeout]);
        }
        const r = await this._show(p);
        return !r.shown ? 'unavailable' : r.rewarded ? 'rewarded' : 'closed';
      } catch (e) {
        console.warn('Ads: rewarded video failed', e);
        this.preload(p);
        return navigator.onLine === false ? 'offline' : 'unavailable';
      }
    }
  };

  window.Ads = Ads;
})();
