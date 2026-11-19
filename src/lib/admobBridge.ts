import { Capacitor } from '@capacitor/core';
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  InterstitialAdPluginEvents,
  MaxAdContentRating,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import type { AdminSettings } from '../types/esports';
import {
  buildInitialAndroidFormatStates,
  canDisplayLoadedAd,
  resolveEffectiveAdMobConfig,
  shouldDisplayBannerAtScreen,
  type AdBannerScreen,
  type AdLifecycleState,
  type AndroidSdkState,
  type RewardedAdOutcome,
} from '../utils/admobHelpers';

export type AdMobRuntimeChannel =
  | 'capacitor-android'
  | 'capacitor-ios'
  | 'web-pwa';

export type WebPwaAdStatus = 'placeholder' | 'disabled' | 'offline';

export interface WebPwaStatusSnapshot {
  status: WebPwaAdStatus;
  banner: 'placeholder' | 'disabled' | 'offline';
  interstitial: 'native-android-only' | 'disabled';
  rewarded: 'native-android-only' | 'disabled';
  message: string;
}

export interface AndroidAdMobStatusSnapshot {
  sdkState: AndroidSdkState;
  sdkError: string | null;
  consentStatus: AdmobConsentStatus;
  canRequestAds: boolean;
  privacyOptionsRequired: boolean;
  bannerState: AdLifecycleState;
  bannerError: string | null;
  interstitialState: AdLifecycleState;
  interstitialError: string | null;
  rewardedState: AdLifecycleState;
  rewardedError: string | null;
  isTestMode: boolean;
  appId: string;
}

export interface AdMobIntegrationStatus {
  channel: AdMobRuntimeChannel;
  isNativeAndroid: boolean;
  webPwa: WebPwaStatusSnapshot;
  android: AndroidAdMobStatusSnapshot;
  lastUpdatedAt: string;
}

export interface RewardedAdResult {
  outcome: RewardedAdOutcome;
  error?: string;
}

const AD_TIMEOUT_MS = 12_000;
const STATUS_LISTENERS = new Set<(status: AdMobIntegrationStatus) => void>();

let lastInitializedKey = '';
let initPromise: Promise<void> | null = null;
let listenersAttached = false;
let nativeBannerVisible = false;
let rewardedInFlight = false;

const latestRuntimeRef: { current: AdminSettings | null; consent: boolean } = {
  current: null,
  consent: false,
};

let currentStatus: AdMobIntegrationStatus = {
  channel: 'web-pwa',
  isNativeAndroid: false,
  webPwa: {
    status: 'placeholder',
    banner: 'placeholder',
    interstitial: 'native-android-only',
    rewarded: 'native-android-only',
    message:
      'Browser preview renders development placeholders only. Native Google Mobile Ads SDK executes inside the Android APK.',
  },
  android: {
    sdkState: 'not-running-in-browser',
    sdkError: null,
    consentStatus: AdmobConsentStatus.UNKNOWN,
    canRequestAds: false,
    privacyOptionsRequired: false,
    bannerState: 'idle',
    bannerError: null,
    interstitialState: 'idle',
    interstitialError: null,
    rewardedState: 'idle',
    rewardedError: null,
    isTestMode: true,
    appId: '',
  },
  lastUpdatedAt: new Date().toISOString(),
};

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

function isDebugEnvironment(): boolean {
  return Boolean(import.meta.env?.DEV);
}

function emitStatus(): void {
  for (const listener of STATUS_LISTENERS) {
    listener(currentStatus);
  }
}

function updateTopStatus(patch: Partial<AdMobIntegrationStatus>): void {
  currentStatus = {
    ...currentStatus,
    ...patch,
    lastUpdatedAt: new Date().toISOString(),
  };
  emitStatus();
}

function updateWebPwaStatus(patch: Partial<WebPwaStatusSnapshot>): void {
  currentStatus = {
    ...currentStatus,
    webPwa: {
      ...currentStatus.webPwa,
      ...patch,
    },
    lastUpdatedAt: new Date().toISOString(),
  };
  emitStatus();
}

function updateAndroidStatus(patch: Partial<AndroidAdMobStatusSnapshot>): void {
  currentStatus = {
    ...currentStatus,
    android: {
      ...currentStatus.android,
      ...patch,
    },
    lastUpdatedAt: new Date().toISOString(),
  };
  emitStatus();
}

export function getAdMobIntegrationStatus(): AdMobIntegrationStatus {
  return currentStatus;
}

export function subscribeAdMobStatus(
  listener: (status: AdMobIntegrationStatus) => void
): () => void {
  STATUS_LISTENERS.add(listener);
  listener(currentStatus);
  return () => {
    STATUS_LISTENERS.delete(listener);
  };
}

export function detectAdMobRuntime(): AdMobRuntimeChannel {
  if (Capacitor.isNativePlatform()) {
    return Capacitor.getPlatform() === 'ios' ? 'capacitor-ios' : 'capacitor-android';
  }
  return 'web-pwa';
}

export function getAdMobRuntimeLabel(channel: AdMobRuntimeChannel): string {
  switch (channel) {
    case 'capacitor-android':
      return 'Native Android Google Mobile Ads SDK';
    case 'capacitor-ios':
      return 'Native iOS Google Mobile Ads SDK';
    case 'web-pwa':
    default:
      return 'Web / PWA Browser Preview (Development Placeholder Only)';
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
    promise.then(
      (val) => {
        window.clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function attachNativeListenersOnce(): void {
  if (listenersAttached || !Capacitor.isNativePlatform()) return;
  listenersAttached = true;

  // Banner lifecycle callbacks
  void AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
    nativeBannerVisible = true;
    updateAndroidStatus({ bannerState: 'loaded', bannerError: null });
  });
  void AdMob.addListener(BannerAdPluginEvents.AdImpression, () => {
    nativeBannerVisible = true;
    updateAndroidStatus({ bannerState: 'displayed', bannerError: null });
  });
  void AdMob.addListener(BannerAdPluginEvents.Opened, () => {
    nativeBannerVisible = true;
    updateAndroidStatus({ bannerState: 'displayed' });
  });
  void AdMob.addListener(BannerAdPluginEvents.Closed, () => {
    updateAndroidStatus({ bannerState: 'idle' });
  });
  void AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (err) => {
    nativeBannerVisible = false;
    updateAndroidStatus({
      bannerState: 'failed',
      bannerError: `Code ${err.code}: ${err.message}`,
    });
    void hideNativeBannerAd();
  });

  // Interstitial lifecycle callbacks
  void AdMob.addListener(InterstitialAdPluginEvents.Loaded, () => {
    updateAndroidStatus({ interstitialState: 'loaded', interstitialError: null });
  });
  void AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, (err) => {
    updateAndroidStatus({
      interstitialState: 'failed',
      interstitialError: `Load failed (${err.code}): ${err.message}`,
    });
  });
  void AdMob.addListener(InterstitialAdPluginEvents.Showed, () => {
    updateAndroidStatus({ interstitialState: 'displayed', interstitialError: null });
  });
  void AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, (err) => {
    updateAndroidStatus({
      interstitialState: 'failed',
      interstitialError: `Display failed (${err.code}): ${err.message}`,
    });
  });
  void AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
    updateAndroidStatus({ interstitialState: 'dismissed' });
    if (latestRuntimeRef.current) {
      void preloadInterstitialAd(latestRuntimeRef.current, latestRuntimeRef.consent);
    }
  });

  // Rewarded lifecycle callbacks
  void AdMob.addListener(RewardAdPluginEvents.Loaded, () => {
    updateAndroidStatus({ rewardedState: 'loaded', rewardedError: null });
  });
  void AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (err) => {
    updateAndroidStatus({
      rewardedState: 'failed',
      rewardedError: `Load failed (${err.code}): ${err.message}`,
    });
  });
  void AdMob.addListener(RewardAdPluginEvents.Showed, () => {
    updateAndroidStatus({ rewardedState: 'displayed', rewardedError: null });
  });
  void AdMob.addListener(RewardAdPluginEvents.FailedToShow, (err) => {
    updateAndroidStatus({
      rewardedState: 'failed',
      rewardedError: `Display failed (${err.code}): ${err.message}`,
    });
  });
  void AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
    updateAndroidStatus({ rewardedState: 'dismissed' });
  });
}

export async function syncUMPUserConsent(consentAccepted: boolean): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    updateAndroidStatus({
      consentStatus: consentAccepted ? AdmobConsentStatus.OBTAINED : AdmobConsentStatus.REQUIRED,
      canRequestAds: false,
      privacyOptionsRequired: false,
    });
    return false;
  }

  try {
    let info = await withTimeout(
      AdMob.requestConsentInfo({
        tagForUnderAgeOfConsent: false,
      }),
      AD_TIMEOUT_MS,
      'Google UMP consent request timed out.'
    );

    if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) {
      info = await AdMob.showConsentForm();
    }

    updateAndroidStatus({
      consentStatus: info.status,
      canRequestAds: info.canRequestAds,
      privacyOptionsRequired: String(info.privacyOptionsRequirementStatus) === 'REQUIRED',
    });
    return info.canRequestAds;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google UMP consent check failed.';
    updateAndroidStatus({ sdkError: message });
    return true;
  }
}

export async function openAdPrivacyOptions(): Promise<'native_opened' | 'web_reset'> {
  if (Capacitor.isNativePlatform()) {
    try {
      await AdMob.showPrivacyOptionsForm();
      await syncUMPUserConsent(true);
      return 'native_opened';
    } catch {
      await AdMob.resetConsentInfo().catch(() => undefined);
      await syncUMPUserConsent(false);
      return 'native_opened';
    }
  }
  return 'web_reset';
}

export async function initializeAdMobRuntime(
  settings: AdminSettings,
  consentAccepted: boolean
): Promise<void> {
  latestRuntimeRef.current = settings;
  latestRuntimeRef.consent = consentAccepted;

  const config = resolveEffectiveAdMobConfig(settings, {
    forceTestMode: isDebugEnvironment(),
  });
  const channel = detectAdMobRuntime();
  const isNative = Capacitor.isNativePlatform();
  const online = isOnline();

  // Strictly separated Web/PWA path: NEVER call native AdMob SDK or load broken ad scripts in browser preview
  if (!isNative) {
    const initialNativeFormats = buildInitialAndroidFormatStates(config, online);
    updateTopStatus({
      channel,
      isNativeAndroid: false,
      webPwa: {
        status: !online ? 'offline' : config.bannerAdsEnabled ? 'placeholder' : 'disabled',
        banner: !online ? 'offline' : config.bannerAdsEnabled ? 'placeholder' : 'disabled',
        interstitial: config.interstitialAdsEnabled ? 'native-android-only' : 'disabled',
        rewarded: config.rewardedAdsEnabled ? 'native-android-only' : 'disabled',
        message: !online
          ? 'Browser is offline. Development placeholder paused.'
          : 'Web/PWA browser preview active: displaying development placeholder only (zero native SDK calls or fake impressions).',
      },
      android: {
        ...currentStatus.android,
        sdkState: 'not-running-in-browser',
        sdkError: null,
        consentStatus: consentAccepted ? AdmobConsentStatus.OBTAINED : AdmobConsentStatus.REQUIRED,
        canRequestAds: false,
        privacyOptionsRequired: false,
        bannerState: initialNativeFormats.bannerState,
        interstitialState: initialNativeFormats.interstitialState,
        rewardedState: initialNativeFormats.rewardedState,
        isTestMode: config.isTestMode,
        appId: config.appId,
      },
    });
    return;
  }

  // Native Android path
  if (!online) {
    const offlineFormats = buildInitialAndroidFormatStates(config, false);
    updateTopStatus({
      channel,
      isNativeAndroid: true,
      webPwa: {
        status: 'disabled',
        banner: 'disabled',
        interstitial: 'disabled',
        rewarded: 'disabled',
        message: 'Running inside native Android shell.',
      },
      android: {
        ...currentStatus.android,
        sdkState: 'offline',
        sdkError: 'Device is offline; AdMob requests paused safely.',
        ...offlineFormats,
        isTestMode: config.isTestMode,
        appId: config.appId,
      },
    });
    return;
  }

  const initKey = `${channel}:${config.isTestMode ? 'test' : 'prod'}:${config.appId}:${consentAccepted ? '1' : '0'}`;
  if (lastInitializedKey === initKey && currentStatus.android.sdkState === 'initialized') {
    updateAndroidStatus({
      isTestMode: config.isTestMode,
      appId: config.appId,
      bannerState: config.bannerAdsEnabled ? currentStatus.android.bannerState : 'disabled',
      interstitialState: config.interstitialAdsEnabled
        ? currentStatus.android.interstitialState
        : 'disabled',
      rewardedState: config.rewardedAdsEnabled ? currentStatus.android.rewardedState : 'disabled',
    });
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const initialStates = buildInitialAndroidFormatStates(config, true);
    updateTopStatus({
      channel,
      isNativeAndroid: true,
      webPwa: {
        status: 'disabled',
        banner: 'disabled',
        interstitial: 'disabled',
        rewarded: 'disabled',
        message: 'Running inside native Android shell.',
      },
      android: {
        ...currentStatus.android,
        sdkState: 'initializing',
        sdkError: null,
        ...initialStates,
        bannerError: null,
        interstitialError: null,
        rewardedError: null,
        isTestMode: config.isTestMode,
        appId: config.appId,
      },
    });

    try {
      attachNativeListenersOnce();

      await withTimeout(
        AdMob.initialize({
          initializeForTesting: config.isTestMode,
          maxAdContentRating: MaxAdContentRating.Teen,
          tagForChildDirectedTreatment: false,
          tagForUnderAgeOfConsent: false,
        }),
        AD_TIMEOUT_MS,
        'Google Mobile Ads SDK initialization timed out.'
      );

      const canRequestAds = await syncUMPUserConsent(consentAccepted);
      lastInitializedKey = initKey;

      // CRITICAL: SDK initialized does NOT mark ad units as 'loaded' or 'ready' — they remain 'idle' until their own ad load succeeds.
      updateAndroidStatus({
        sdkState: 'initialized',
        sdkError: null,
        canRequestAds,
        ...buildInitialAndroidFormatStates(config, true),
      });

      if (canRequestAds && config.interstitialAdsEnabled) {
        void preloadInterstitialAd(settings, consentAccepted);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Google Mobile Ads SDK initialization failed.';
      updateAndroidStatus({
        sdkState: 'error',
        sdkError: message,
      });
    }
  })().finally(() => {
    initPromise = null;
  });

  return initPromise;
}

export async function syncBannerForScreen(
  settings: AdminSettings,
  screen: AdBannerScreen | 'admin',
  consentAccepted: boolean
): Promise<void> {
  const config = resolveEffectiveAdMobConfig(settings, { forceTestMode: isDebugEnvironment() });
  const online = isOnline();

  if (!Capacitor.isNativePlatform()) {
    const allowedWeb = screen !== 'admin' && shouldDisplayBannerAtScreen(settings, screen);
    updateWebPwaStatus({
      status: !online ? 'offline' : allowedWeb ? 'placeholder' : 'disabled',
      banner: !online ? 'offline' : allowedWeb ? 'placeholder' : 'disabled',
    });
    return;
  }

  const allowedOnNativeScreen =
    screen !== 'admin' &&
    config.bannerAdsEnabled &&
    shouldDisplayBannerAtScreen(settings, screen) &&
    online &&
    currentStatus.android.sdkState === 'initialized' &&
    currentStatus.android.canRequestAds;

  if (!allowedOnNativeScreen) {
    await hideNativeBannerAd();
    updateAndroidStatus({
      bannerState: !online
        ? 'offline'
        : config.bannerAdsEnabled
          ? 'idle'
          : 'disabled',
    });
    return;
  }

  try {
    // Only set 'loading' here — 'loaded' and 'displayed' are strictly emitted by BannerAdPluginEvents callbacks
    updateAndroidStatus({ bannerState: 'loading', bannerError: null });
    await withTimeout(
      AdMob.showBanner({
        adId: config.bannerId,
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        margin: 72,
        isTesting: config.isTestMode,
        npa: !consentAccepted,
      }),
      AD_TIMEOUT_MS,
      'Banner ad request timed out.'
    );
  } catch (error) {
    nativeBannerVisible = false;
    const message = error instanceof Error ? error.message : 'Banner ad request failed.';
    updateAndroidStatus({
      bannerState: 'failed',
      bannerError: message,
    });
    await hideNativeBannerAd();
  }
}

export async function hideNativeBannerAd(): Promise<void> {
  if (Capacitor.isNativePlatform() && nativeBannerVisible) {
    try {
      await AdMob.hideBanner();
    } catch {
      // Ignore if banner was not mounted
    }
    nativeBannerVisible = false;
  }
}

export async function preloadInterstitialAd(
  settings: AdminSettings,
  consentAccepted: boolean
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  const config = resolveEffectiveAdMobConfig(settings, { forceTestMode: isDebugEnvironment() });
  if (!config.interstitialAdsEnabled) {
    updateAndroidStatus({ interstitialState: 'disabled', interstitialError: null });
    return false;
  }
  if (!isOnline()) {
    updateAndroidStatus({ interstitialState: 'offline' });
    return false;
  }
  if (
    currentStatus.android.sdkState !== 'initialized' ||
    !currentStatus.android.canRequestAds
  ) {
    return false;
  }
  if (currentStatus.android.interstitialState === 'loading') {
    return false;
  }
  if (canDisplayLoadedAd(currentStatus.android.interstitialState)) {
    return true;
  }

  try {
    updateAndroidStatus({ interstitialState: 'loading', interstitialError: null });
    await withTimeout(
      AdMob.prepareInterstitial({
        adId: config.interstitialId,
        isTesting: config.isTestMode,
        npa: !consentAccepted,
        immersiveMode: false,
      }),
      AD_TIMEOUT_MS,
      'Interstitial ad preload timed out.'
    );
    updateAndroidStatus({ interstitialState: 'loaded', interstitialError: null });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interstitial preload failed.';
    updateAndroidStatus({
      interstitialState: 'failed',
      interstitialError: message,
    });
    return false;
  }
}

/**
 * Displays a native Android interstitial ONLY when:
 * 1. Running inside Capacitor native Android
 * 2. The interstitial ad request actually succeeded (`interstitialState === 'loaded'`)
 * Never blocks navigation or tournament participation if loading failed or is in progress.
 */
export async function showNativeInterstitialAd(
  settings: AdminSettings,
  consentAccepted: boolean
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  const config = resolveEffectiveAdMobConfig(settings, { forceTestMode: isDebugEnvironment() });
  if (
    !config.interstitialAdsEnabled ||
    !isOnline() ||
    currentStatus.android.sdkState !== 'initialized' ||
    !currentStatus.android.canRequestAds
  ) {
    return false;
  }

  if (!canDisplayLoadedAd(currentStatus.android.interstitialState)) {
    // Do not display an unloaded/failed ad; silently schedule background preload for a future natural break
    if (
      currentStatus.android.interstitialState === 'idle' ||
      currentStatus.android.interstitialState === 'dismissed'
    ) {
      void preloadInterstitialAd(settings, consentAccepted);
    }
    return false;
  }

  try {
    await withTimeout(
      AdMob.showInterstitial(),
      AD_TIMEOUT_MS,
      'Interstitial ad display timed out.'
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interstitial show failed.';
    updateAndroidStatus({
      interstitialState: 'failed',
      interstitialError: message,
    });
    return false;
  }
}

async function runNativeRewardedAd(
  settings: AdminSettings,
  consentAccepted: boolean,
  dismissMessage: string
): Promise<RewardedAdResult> {
  const config = resolveEffectiveAdMobConfig(settings, { forceTestMode: isDebugEnvironment() });
  if (!config.rewardedAdsEnabled) {
    if (Capacitor.isNativePlatform()) {
      updateAndroidStatus({ rewardedState: 'disabled' });
    }
    return { outcome: 'disabled', error: 'Rewarded ads are currently disabled by admin.' };
  }
  if (!isOnline()) {
    if (Capacitor.isNativePlatform()) {
      updateAndroidStatus({ rewardedState: 'offline' });
    }
    return { outcome: 'offline', error: 'No internet connection. Connect to watch an ad.' };
  }

  if (!Capacitor.isNativePlatform()) {
    return {
      outcome: 'native_unavailable',
      error:
        'Web/PWA browser preview cannot run the native Google Mobile Ads SDK. Test Rewarded Ads in the Android APK build (zero fake impressions generated in browser).',
    };
  }

  if (
    currentStatus.android.sdkState !== 'initialized' ||
    !currentStatus.android.canRequestAds
  ) {
    const errMsg =
      currentStatus.android.sdkError ||
      'Google Mobile Ads SDK is not initialized yet. Try again shortly.';
    updateAndroidStatus({ rewardedState: 'failed', rewardedError: errMsg });
    return { outcome: 'failed', error: errMsg };
  }

  if (rewardedInFlight) {
    return { outcome: 'failed', error: 'A rewarded ad request is already in progress.' };
  }

  rewardedInFlight = true;
  let rewardHandle: { remove: () => Promise<void> } | null = null;
  try {
    updateAndroidStatus({ rewardedState: 'loading', rewardedError: null });
    let earnedReward = false;
    rewardHandle = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
      earnedReward = true;
    });

    await withTimeout(
      AdMob.prepareRewardVideoAd({
        adId: config.rewardedId,
        isTesting: config.isTestMode,
        npa: !consentAccepted,
        immersiveMode: false,
      }),
      AD_TIMEOUT_MS,
      'Rewarded video took too long to load. Please try again.'
    );

    // Explicitly verify ad load succeeded before attempting display
    updateAndroidStatus({ rewardedState: 'loaded', rewardedError: null });

    const rewardItem = await withTimeout(
      AdMob.showRewardVideoAd(),
      60_000,
      'Rewarded ad session timed out.'
    );
    if (rewardItem && typeof rewardItem.amount === 'number' && rewardItem.amount > 0) {
      earnedReward = true;
    }

    if (earnedReward) {
      updateAndroidStatus({ rewardedState: 'dismissed', rewardedError: null });
      return { outcome: 'rewarded' };
    }
    return {
      outcome: 'dismissed',
      error: dismissMessage,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Rewarded ad failed to load.';
    updateAndroidStatus({ rewardedState: 'failed', rewardedError: message });
    return { outcome: 'failed', error: message };
  } finally {
    await rewardHandle?.remove().catch(() => undefined);
    rewardedInFlight = false;
  }
}

export async function showRewardedAdForCosmetic(
  settings: AdminSettings,
  consentAccepted: boolean
): Promise<RewardedAdResult> {
  return runNativeRewardedAd(
    settings,
    consentAccepted,
    'Ad closed before completion. Watch the full ad to unlock the cosmetic emblem.'
  );
}

export async function showRewardedAdForWithdrawal(
  settings: AdminSettings,
  consentAccepted: boolean
): Promise<RewardedAdResult> {
  return runNativeRewardedAd(
    settings,
    consentAccepted,
    'Ad closed early. Watch the full rewarded ad to submit your withdrawal request.'
  );
}

export function registerAdMobLifecycle(params: {
  getSettings: () => AdminSettings;
  getScreen: () => AdBannerScreen | 'admin';
  getConsent: () => boolean;
}): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }

  const onVisibilityChange = () => {
    const settings = params.getSettings();
    const consent = params.getConsent();
    const screen = params.getScreen();
    if (document.visibilityState === 'hidden') {
      if (Capacitor.isNativePlatform()) {
        void hideNativeBannerAd();
      }
    } else if (document.visibilityState === 'visible') {
      void initializeAdMobRuntime(settings, consent).then(() =>
        syncBannerForScreen(settings, screen, consent)
      );
    }
  };

  const onOnline = () => {
    const settings = params.getSettings();
    const consent = params.getConsent();
    lastInitializedKey = '';
    void initializeAdMobRuntime(settings, consent).then(() =>
      syncBannerForScreen(settings, params.getScreen(), consent)
    );
  };

  const onOffline = () => {
    void hideNativeBannerAd();
    if (Capacitor.isNativePlatform()) {
      updateAndroidStatus({
        sdkState: 'offline',
        bannerState: 'offline',
        interstitialState: 'offline',
        rewardedState: 'offline',
        sdkError: 'Device offline; AdMob requests paused.',
      });
    } else {
      updateWebPwaStatus({
        status: 'offline',
        banner: 'offline',
        message: 'Browser offline; development placeholder paused.',
      });
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}
