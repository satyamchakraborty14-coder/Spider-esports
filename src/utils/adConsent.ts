export const SPIDER_AD_CONSENT_STORAGE_KEY = 'spider_ad_consent';
export const SPIDER_AD_CONSENT_EVENT = 'spider-ad-consent-changed';

export interface AdConsentStateSnapshot {
  personalizedAdsEnabled: boolean;
  hasExplicitChoice: boolean;
  rawValue: '1' | '0' | null;
}

export interface AdConsentSummary {
  personalizedAdsEnabled: boolean;
  optedOut: boolean;
  npa: boolean;
  shortLabel: string;
  modeHeadline: string;
  modeDescription: string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function getSafeStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Reads the global `spider_ad_consent` preference.
 * GDPR-safe default: if unset (`null`), defaults to non-personalized ads (`personalizedAdsEnabled: false`).
 */
export function readGlobalAdConsent(storage?: StorageLike | null): AdConsentStateSnapshot {
  const target = getSafeStorage(storage);
  if (!target) {
    return { personalizedAdsEnabled: false, hasExplicitChoice: false, rawValue: null };
  }
  try {
    const raw = target.getItem(SPIDER_AD_CONSENT_STORAGE_KEY);
    if (raw === '1') {
      return { personalizedAdsEnabled: true, hasExplicitChoice: true, rawValue: '1' };
    }
    if (raw === '0') {
      return { personalizedAdsEnabled: false, hasExplicitChoice: true, rawValue: '0' };
    }
    return { personalizedAdsEnabled: false, hasExplicitChoice: false, rawValue: null };
  } catch {
    return { personalizedAdsEnabled: false, hasExplicitChoice: false, rawValue: null };
  }
}

/**
 * Persists the global `spider_ad_consent` preference (`'1'` or `'0'`) and notifies global listeners.
 */
export function writeGlobalAdConsent(
  personalizedAdsEnabled: boolean,
  storage?: StorageLike | null
): '1' | '0' {
  const serialized: '1' | '0' = personalizedAdsEnabled ? '1' : '0';
  const target = getSafeStorage(storage);
  if (target) {
    try {
      target.setItem(SPIDER_AD_CONSENT_STORAGE_KEY, serialized);
    } catch {
      // Ignore storage quota or private-mode restrictions
    }
  }
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent(SPIDER_AD_CONSENT_EVENT, {
          detail: { personalizedAdsEnabled },
        })
      );
    } catch {
      // Ignore event dispatch failure
    }
  }
  return serialized;
}

export function getAdConsentSummary(personalizedAdsEnabled: boolean): AdConsentSummary {
  if (personalizedAdsEnabled) {
    return {
      personalizedAdsEnabled: true,
      optedOut: false,
      npa: false,
      shortLabel: 'Personalized',
      modeHeadline: 'Personalized Ads Enabled',
      modeDescription:
        'Google AdMob may use device advertising IDs and interest signals to serve relevant ads that help keep all tournaments 100% free.',
    };
  }
  return {
    personalizedAdsEnabled: false,
    optedOut: true,
    npa: true,
    shortLabel: 'Non-Personalized',
    modeHeadline: 'Opted Out · Non-Personalized Ads Only',
    modeDescription:
      'Ad personalization is turned off (NPA=1). Ads use only contextual tournament information without behavioral profiling or cross-app tracking.',
  };
}
