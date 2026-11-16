import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMOB_OFFICIAL_TEST_IDS,
  ADMOB_PRODUCTION_CREDENTIALS,
  buildAppAdsTxtLine,
  buildInitialAndroidFormatStates,
  canDisplayLoadedAd,
  extractAdMobPublisherId,
  resolveEffectiveAdMobConfig,
  shouldDisplayBannerAtScreen,
  validateAdMobAppId,
  validateAdMobUnitId,
  validateAdSenseClientId,
  validateInterstitialCooldownSeconds,
} from './admobHelpers';
import type { AdminSettings } from '../types/esports';

test('validateAdMobAppId, validateAdMobUnitId, and cooldown validation enforce valid Google AdMob formats', () => {
  assert.equal(validateAdMobAppId(ADMOB_OFFICIAL_TEST_IDS.appId), null);
  assert.equal(validateAdMobAppId(ADMOB_PRODUCTION_CREDENTIALS.appId), null);
  assert.equal(validateAdMobUnitId(ADMOB_PRODUCTION_CREDENTIALS.banner, 'Banner Ad Unit ID'), null);
  assert.equal(
    validateAdMobUnitId(ADMOB_PRODUCTION_CREDENTIALS.interstitial, 'Interstitial Ad Unit ID'),
    null
  );
  assert.equal(
    validateAdMobUnitId(ADMOB_PRODUCTION_CREDENTIALS.rewarded, 'Rewarded Ad Unit ID'),
    null
  );

  assert.notEqual(validateAdMobAppId('ca-app-pub-123~456'), null);
  assert.notEqual(validateAdMobUnitId('ca-app-pub-5622658710249262~5604296331', 'Banner'), null);
  assert.equal(validateAdSenseClientId(''), null);
  assert.equal(validateAdSenseClientId('ca-pub-5622658710249262'), null);
  assert.notEqual(validateAdSenseClientId('pub-5622658710249262'), null);

  assert.equal(validateInterstitialCooldownSeconds(90), null);
  assert.notEqual(validateInterstitialCooldownSeconds(10), null);
  assert.notEqual(validateInterstitialCooldownSeconds(999), null);
});

test('extractAdMobPublisherId and buildAppAdsTxtLine generate exact Google seller verification lines', () => {
  assert.equal(
    extractAdMobPublisherId(ADMOB_PRODUCTION_CREDENTIALS.appId),
    'pub-5622658710249262'
  );
  assert.equal(
    buildAppAdsTxtLine(ADMOB_PRODUCTION_CREDENTIALS.banner),
    ADMOB_PRODUCTION_CREDENTIALS.appAdsTxt
  );
});

test('resolveEffectiveAdMobConfig forces Google test IDs in test/debug mode and uses configured production IDs in release', () => {
  const baseSettings: AdminSettings = {
    id: 'default',
    adMobMode: 'test',
    adMobAppId: ADMOB_PRODUCTION_CREDENTIALS.appId,
    bannerAdUnitId: ADMOB_PRODUCTION_CREDENTIALS.banner,
    interstitialAdUnitId: ADMOB_PRODUCTION_CREDENTIALS.interstitial,
    rewardedAdUnitId: ADMOB_PRODUCTION_CREDENTIALS.rewarded,
    bannerAdsEnabled: true,
    interstitialAdsEnabled: true,
    rewardedAdsEnabled: true,
    interstitialCooldownSeconds: 120,
    bannerPlacement: 'home_and_matches',
    maintenanceMode: false,
    updatedAt: '2026-11-15T00:00:00.000Z',
  };

  const testResolved = resolveEffectiveAdMobConfig(baseSettings);
  assert.equal(testResolved.isTestMode, true);
  assert.equal(testResolved.appId, ADMOB_OFFICIAL_TEST_IDS.appId);
  assert.equal(testResolved.bannerId, ADMOB_OFFICIAL_TEST_IDS.banner);
  assert.equal(testResolved.interstitialCooldownMs, 120_000);

  const forcedDebugResolved = resolveEffectiveAdMobConfig(
    { ...baseSettings, adMobMode: 'production' },
    { forceTestMode: true }
  );
  assert.equal(forcedDebugResolved.isTestMode, true);
  assert.equal(forcedDebugResolved.bannerId, ADMOB_OFFICIAL_TEST_IDS.banner);

  const prodResolved = resolveEffectiveAdMobConfig({ ...baseSettings, adMobMode: 'production' });
  assert.equal(prodResolved.isTestMode, false);
  assert.equal(prodResolved.appId, ADMOB_PRODUCTION_CREDENTIALS.appId);
  assert.equal(prodResolved.bannerId, ADMOB_PRODUCTION_CREDENTIALS.banner);
  assert.equal(prodResolved.interstitialId, ADMOB_PRODUCTION_CREDENTIALS.interstitial);
  assert.equal(prodResolved.rewardedId, ADMOB_PRODUCTION_CREDENTIALS.rewarded);
});

test('shouldDisplayBannerAtScreen honors banner enable toggle and placement rules', () => {
  const settings: AdminSettings = {
    id: 'default',
    adMobMode: 'test',
    bannerAdUnitId: ADMOB_OFFICIAL_TEST_IDS.banner,
    interstitialAdUnitId: ADMOB_OFFICIAL_TEST_IDS.interstitial,
    rewardedAdUnitId: ADMOB_OFFICIAL_TEST_IDS.rewarded,
    bannerAdsEnabled: true,
    bannerPlacement: 'home_and_matches',
    maintenanceMode: false,
    updatedAt: '2026-11-15T00:00:00.000Z',
  };

  assert.equal(shouldDisplayBannerAtScreen(settings, 'home'), true);
  assert.equal(shouldDisplayBannerAtScreen(settings, 'matches'), true);
  assert.equal(shouldDisplayBannerAtScreen(settings, 'results'), false);
  assert.equal(shouldDisplayBannerAtScreen({ ...settings, bannerPlacement: 'home_only' }, 'matches'), false);
  assert.equal(shouldDisplayBannerAtScreen({ ...settings, bannerAdsEnabled: false }, 'home'), false);
});

test('buildInitialAndroidFormatStates never marks ads loaded on SDK init and canDisplayLoadedAd strictly checks loaded', () => {
  const initialOnline = buildInitialAndroidFormatStates(
    { bannerAdsEnabled: true, interstitialAdsEnabled: true, rewardedAdsEnabled: false },
    true
  );
  assert.equal(initialOnline.bannerState, 'idle');
  assert.equal(initialOnline.interstitialState, 'idle');
  assert.equal(initialOnline.rewardedState, 'disabled');

  assert.equal(canDisplayLoadedAd('idle'), false);
  assert.equal(canDisplayLoadedAd('loading'), false);
  assert.equal(canDisplayLoadedAd('failed'), false);
  assert.equal(canDisplayLoadedAd('disabled'), false);
  assert.equal(canDisplayLoadedAd('offline'), false);
  assert.equal(canDisplayLoadedAd('loaded'), true);
});
