import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAdConsentSummary,
  readGlobalAdConsent,
  SPIDER_AD_CONSENT_STORAGE_KEY,
  writeGlobalAdConsent,
} from './adConsent';

function createMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

test('readGlobalAdConsent defaults safely to non-personalized when spider_ad_consent is unset', () => {
  const storage = createMemoryStorage();
  const state = readGlobalAdConsent(storage);
  assert.equal(state.personalizedAdsEnabled, false);
  assert.equal(state.hasExplicitChoice, false);
  assert.equal(state.rawValue, null);
});

test('writeGlobalAdConsent persists spider_ad_consent as "1" or "0" and readGlobalAdConsent restores it', () => {
  const storage = createMemoryStorage();

  const savedOptIn = writeGlobalAdConsent(true, storage);
  assert.equal(savedOptIn, '1');
  assert.equal(storage.getItem(SPIDER_AD_CONSENT_STORAGE_KEY), '1');

  const optInState = readGlobalAdConsent(storage);
  assert.equal(optInState.personalizedAdsEnabled, true);
  assert.equal(optInState.hasExplicitChoice, true);
  assert.equal(optInState.rawValue, '1');

  const savedOptOut = writeGlobalAdConsent(false, storage);
  assert.equal(savedOptOut, '0');
  assert.equal(storage.getItem(SPIDER_AD_CONSENT_STORAGE_KEY), '0');

  const optOutState = readGlobalAdConsent(storage);
  assert.equal(optOutState.personalizedAdsEnabled, false);
  assert.equal(optOutState.hasExplicitChoice, true);
  assert.equal(optOutState.rawValue, '0');
});

test('getAdConsentSummary flips npa flag and readable GDPR labels accurately', () => {
  const personalized = getAdConsentSummary(true);
  assert.equal(personalized.npa, false);
  assert.equal(personalized.optedOut, false);
  assert.equal(personalized.shortLabel, 'Personalized');

  const nonPersonalized = getAdConsentSummary(false);
  assert.equal(nonPersonalized.npa, true);
  assert.equal(nonPersonalized.optedOut, true);
  assert.equal(nonPersonalized.shortLabel, 'Non-Personalized');
});
