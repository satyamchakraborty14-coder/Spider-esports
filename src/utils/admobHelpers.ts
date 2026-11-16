import type { AdBannerPlacement, AdminSettings } from '../types/esports';

export const ADMOB_OFFICIAL_TEST_IDS = {
  publisherId: 'pub-3940256099942544',
  appId: 'ca-app-pub-3940256099942544~3347511713',
  banner: 'ca-app-pub-3940256099942544/6300978111',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
} as const;

export const ADMOB_PRODUCTION_CREDENTIALS = {
  publisherId: 'pub-5622658710249262',
  appId: 'ca-app-pub-5622658710249262~5604296331',
  banner: 'ca-app-pub-5622658710249262/8095883252',
  interstitial: 'ca-app-pub-5622658710249262/2009646191',
  rewarded: 'ca-app-pub-5622658710249262/8948644970',
  appAdsTxt: 'google.com, pub-5622658710249262, DIRECT, f08c47fec0942fa0',
} as const;

export const MIN_INTERSTITIAL_COOLDOWN_SECONDS = 30;
export const MAX_INTERSTITIAL_COOLDOWN_SECONDS = 600;
export const DEFAULT_INTERSTITIAL_COOLDOWN_SECONDS = 90;

const ADMOB_APP_ID_REGEX = /^ca-app-pub-\d{16}~\d{10}$/;
const ADMOB_UNIT_ID_REGEX = /^ca-app-pub-\d{16}\/\d{10}$/;
const ADSENSE_CLIENT_REGEX = /^ca-pub-\d{16}$/;
const PUB_ID_EXTRACT_REGEX = /ca-(?:app-)?pub-(\d{16})/;

export function validateAdMobAppId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'AdMob App ID is required (format: ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY).';
  }
  if (!ADMOB_APP_ID_REGEX.test(trimmed)) {
    return 'Invalid AdMob App ID. Expected format: ca-app-pub-1234567890123456~1234567890.';
  }
  return null;
}

export function validateAdMobUnitId(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return `${label} is required (format: ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY).`;
  }
  if (!ADMOB_UNIT_ID_REGEX.test(trimmed)) {
    return `Invalid ${label}. Expected format: ca-app-pub-1234567890123456/1234567890.`;
  }
  return null;
}

export function validateAdSenseClientId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null; // Optional for Android-only AdMob
  if (!ADSENSE_CLIENT_REGEX.test(trimmed)) {
    return 'Invalid Web AdSense Publisher ID. Expected format: ca-pub-1234567890123456.';
  }
  return null;
}

export function validateInterstitialCooldownSeconds(seconds: number): string | null {
  if (
    !Number.isInteger(seconds) ||
    seconds < MIN_INTERSTITIAL_COOLDOWN_SECONDS ||
    seconds > MAX_INTERSTITIAL_COOLDOWN_SECONDS
  ) {
    return `Interstitial frequency cooldown must be a whole number between ${MIN_INTERSTITIAL_COOLDOWN_SECONDS} and ${MAX_INTERSTITIAL_COOLDOWN_SECONDS} seconds.`;
  }
  return null;
}

export function extractAdMobPublisherId(idOrUnit: string): string | null {
  const match = idOrUnit.trim().match(PUB_ID_EXTRACT_REGEX);
  return match ? `pub-${match[1]}` : null;
}

export function buildAppAdsTxtLine(idOrUnit: string): string {
  const pubId = extractAdMobPublisherId(idOrUnit) || ADMOB_PRODUCTION_CREDENTIALS.publisherId;
  return `google.com, ${pubId}, DIRECT, f08c47fec0942fa0`;
}

export interface EffectiveAdMobConfig {
  isTestMode: boolean;
  appId: string;
  bannerId: string;
  interstitialId: string;
  rewardedId: string;
  adSenseClientId?: string;
  bannerAdsEnabled: boolean;
  interstitialAdsEnabled: boolean;
  rewardedAdsEnabled: boolean;
  interstitialCooldownSeconds: number;
  interstitialCooldownMs: number;
  bannerPlacement: AdBannerPlacement;
}

export function resolveEffectiveAdMobConfig(
  settings: AdminSettings,
  options?: { forceTestMode?: boolean }
): EffectiveAdMobConfig {
  const isTestMode = Boolean(options?.forceTestMode) || settings.adMobMode !== 'production';
  const rawCooldown = settings.interstitialCooldownSeconds ?? DEFAULT_INTERSTITIAL_COOLDOWN_SECONDS;
  const clampedCooldown = Math.min(
    MAX_INTERSTITIAL_COOLDOWN_SECONDS,
    Math.max(MIN_INTERSTITIAL_COOLDOWN_SECONDS, Math.round(rawCooldown))
  );
  const bannerPlacement: AdBannerPlacement = settings.bannerPlacement || 'all_screens';
  const bannerAdsEnabled = settings.bannerAdsEnabled !== false;
  const interstitialAdsEnabled = settings.interstitialAdsEnabled !== false;
  const rewardedAdsEnabled = settings.rewardedAdsEnabled !== false;

  if (isTestMode) {
    return {
      isTestMode: true,
      appId: ADMOB_OFFICIAL_TEST_IDS.appId,
      bannerId: ADMOB_OFFICIAL_TEST_IDS.banner,
      interstitialId: ADMOB_OFFICIAL_TEST_IDS.interstitial,
      rewardedId: ADMOB_OFFICIAL_TEST_IDS.rewarded,
      adSenseClientId: settings.adSenseClientId?.trim() || undefined,
      bannerAdsEnabled,
      interstitialAdsEnabled,
      rewardedAdsEnabled,
      interstitialCooldownSeconds: clampedCooldown,
      interstitialCooldownMs: clampedCooldown * 1000,
      bannerPlacement,
    };
  }

  return {
    isTestMode: false,
    appId: settings.adMobAppId?.trim() || ADMOB_PRODUCTION_CREDENTIALS.appId,
    bannerId: settings.bannerAdUnitId?.trim() || ADMOB_PRODUCTION_CREDENTIALS.banner,
    interstitialId:
      settings.interstitialAdUnitId?.trim() || ADMOB_PRODUCTION_CREDENTIALS.interstitial,
    rewardedId: settings.rewardedAdUnitId?.trim() || ADMOB_PRODUCTION_CREDENTIALS.rewarded,
    adSenseClientId: settings.adSenseClientId?.trim() || undefined,
    bannerAdsEnabled,
    interstitialAdsEnabled,
    rewardedAdsEnabled,
    interstitialCooldownSeconds: clampedCooldown,
    interstitialCooldownMs: clampedCooldown * 1000,
    bannerPlacement,
  };
}

export type AdBannerScreen = 'home' | 'matches' | 'results' | 'leaderboard' | 'profile';

export type AdLifecycleState =
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'displayed'
  | 'dismissed'
  | 'failed'
  | 'disabled'
  | 'offline';

export type AndroidSdkState =
  | 'not-running-in-browser'
  | 'idle'
  | 'initializing'
  | 'initialized'
  | 'error'
  | 'offline';

export function shouldDisplayBannerAtScreen(
  settings: AdminSettings,
  screen: AdBannerScreen
): boolean {
  if (settings.bannerAdsEnabled === false) return false;
  const placement = settings.bannerPlacement || 'all_screens';
  if (placement === 'home_only') return screen === 'home';
  if (placement === 'home_and_matches') return screen === 'home' || screen === 'matches';
  return true;
}

/**
 * Strict display guard: an ad is eligible to display ONLY when its own ad request succeeded ('loaded').
 * Never returns true just because the SDK initialized ('idle') or failed ('failed').
 */
export function canDisplayLoadedAd(state: AdLifecycleState): boolean {
  return state === 'loaded';
}

/**
 * Returns initial format states right after SDK initialization without falsely marking ads as loaded/ready.
 */
export function buildInitialAndroidFormatStates(
  config: Pick<EffectiveAdMobConfig, 'bannerAdsEnabled' | 'interstitialAdsEnabled' | 'rewardedAdsEnabled'>,
  isOnline: boolean
): {
  bannerState: AdLifecycleState;
  interstitialState: AdLifecycleState;
  rewardedState: AdLifecycleState;
} {
  if (!isOnline) {
    return {
      bannerState: config.bannerAdsEnabled ? 'offline' : 'disabled',
      interstitialState: config.interstitialAdsEnabled ? 'offline' : 'disabled',
      rewardedState: config.rewardedAdsEnabled ? 'offline' : 'disabled',
    };
  }
  return {
    bannerState: config.bannerAdsEnabled ? 'idle' : 'disabled',
    interstitialState: config.interstitialAdsEnabled ? 'idle' : 'disabled',
    rewardedState: config.rewardedAdsEnabled ? 'idle' : 'disabled',
  };
}

