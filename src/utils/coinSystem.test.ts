import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMatchCoinReward,
  calculateRupeesFromCoins,
  canShowInterstitial,
  COSMETIC_CATALOG,
  evaluateUnlockedAchievements,
  formatRupees,
  getPlayerLeaderboardRank,
  isCosmeticUnlocked,
  sortLeaderboard,
  validateAdminCoinAdjustment,
  validateWithdrawalRequest,
} from './coinSystem';
import type { LeaderboardEntry } from '../types/esports';

test('coin to rupee conversion strictly follows 1000 coins = 10 rupees', () => {
  assert.equal(calculateRupeesFromCoins(0), 0);
  assert.equal(calculateRupeesFromCoins(1000), 10);
  assert.equal(calculateRupeesFromCoins(2500), 25);
  assert.equal(calculateRupeesFromCoins(1250), 12.5);
  assert.equal(formatRupees(10), '₹10');
  assert.equal(formatRupees(12.5), '₹12.50');
});

test('match coin reward combines win bonus and kill coins cleanly', () => {
  assert.equal(
    calculateMatchCoinReward({ winBonusCoins: 200, kills: 8, coinsPerKill: 15 }),
    320
  );
  assert.equal(
    calculateMatchCoinReward({ winBonusCoins: 0, kills: 5, coinsPerKill: 10 }),
    50
  );
});

test('admin coin adjustment validates non-zero integers and prevents negative balances', () => {
  assert.deepEqual(
    validateAdminCoinAdjustment({ currentCoins: 500, deltaCoins: 250 }),
    { valid: true, nextCoins: 750, deltaCoins: 250 }
  );
  assert.equal(
    validateAdminCoinAdjustment({ currentCoins: 100, deltaCoins: -150 }).valid,
    false
  );
  assert.equal(
    validateAdminCoinAdjustment({ currentCoins: 100, deltaCoins: 0 }).valid,
    false
  );
  assert.equal(
    validateAdminCoinAdjustment({ currentCoins: 100, deltaCoins: 12.5 }).valid,
    false
  );
});

test('withdrawal validation enforces 1000 coin minimum, balance limit, and valid payout destination', () => {
  assert.equal(
    validateWithdrawalRequest({
      amountCoins: 900,
      availableCoins: 5000,
      method: 'upi',
      destination: 'spider@upi',
    }).valid,
    false
  );
  assert.equal(
    validateWithdrawalRequest({
      amountCoins: 2000,
      availableCoins: 1500,
      method: 'upi',
      destination: 'spider@upi',
    }).valid,
    false
  );
  assert.equal(
    validateWithdrawalRequest({
      amountCoins: 1000,
      availableCoins: 1500,
      method: 'upi',
      destination: 'invalid-upi',
    }).valid,
    false
  );
  assert.deepEqual(
    validateWithdrawalRequest({
      amountCoins: 1500,
      availableCoins: 2000,
      method: 'upi',
      destination: 'satyam@okaxis',
    }),
    {
      valid: true,
      coins: 1500,
      rupees: 15,
      destination: 'satyam@okaxis',
    }
  );
});

test('achievements and milestone cosmetics unlock via gameplay stats and coins', () => {
  const unlocked = evaluateUnlockedAchievements({
    tournamentsJoined: 1,
    totalKills: 30,
    totalWins: 1,
    coins: 1200,
    achievements: [],
  });
  assert.deepEqual(
    unlocked.sort(),
    ['champion-1', 'coin-milestone-1000', 'first-drop', 'sharpshooter-25'].sort()
  );

  const goldTheme = COSMETIC_CATALOG.find((c) => c.id === 'theme-arachnid-gold')!;
  assert.equal(
    isCosmeticUnlocked(goldTheme, {
      tournamentsJoined: 1,
      totalKills: 5,
      totalWins: 0,
      unlockedCosmetics: [],
    }),
    false
  );
  assert.equal(
    isCosmeticUnlocked(goldTheme, {
      tournamentsJoined: 1,
      totalKills: 5,
      totalWins: 1,
      unlockedCosmetics: [],
    }),
    true
  );
});

test('leaderboard sorts properly by global coins and weekly wins/kills standings', () => {
  const entries: LeaderboardEntry[] = [
    {
      id: 'u1',
      userId: 'u1',
      username: 'AlphaSpider',
      totalWins: 5,
      totalKills: 42,
      totalPoints: 0,
      weeklyWins: 0,
      weeklyKills: 4,
      weeklyPoints: 0,
      coins: 900,
      updatedAt: '2026-11-14T10:00:00.000Z',
    },
    {
      id: 'u2',
      userId: 'u2',
      username: 'CrimsonFang',
      totalWins: 2,
      totalKills: 25,
      totalPoints: 0,
      weeklyWins: 2,
      weeklyKills: 18,
      weeklyPoints: 0,
      coins: 600,
      updatedAt: '2026-11-14T10:00:00.000Z',
    },
  ];

  const globalSorted = sortLeaderboard(entries, 'global');
  assert.equal(globalSorted[0].userId, 'u1');

  const weeklySorted = sortLeaderboard(entries, 'weekly');
  assert.equal(weeklySorted[0].userId, 'u2');

  assert.equal(getPlayerLeaderboardRank(entries, 'u2', 'global'), 2);
  assert.equal(getPlayerLeaderboardRank(entries, 'u2', 'weekly'), 1);
});

test('AdMob interstitial gating never interrupts live matches and enforces cooldowns', () => {
  assert.equal(
    canShowInterstitial({ lastShownAtMs: 0, nowMs: 100000, isLiveMatchOrJoining: true }),
    false
  );
  assert.equal(
    canShowInterstitial({ lastShownAtMs: 100000, nowMs: 120000, isLiveMatchOrJoining: false }),
    false
  );
  assert.equal(
    canShowInterstitial({ lastShownAtMs: 100000, nowMs: 200000, isLiveMatchOrJoining: false }),
    true
  );
  assert.equal(
    canShowInterstitial({
      lastShownAtMs: 100000,
      nowMs: 150000,
      cooldownMs: 45_000,
      isLiveMatchOrJoining: false,
    }),
    true
  );
});

test('rewarded ad cosmetic starts locked and unlocks strictly via unlockedCosmetics without granting coins', () => {
  const supporterItem = COSMETIC_CATALOG.find((c) => c.id === 'badge-arena-supporter');
  assert.ok(supporterItem);
  assert.equal(supporterItem.rewardedAdUnlock, true);
  assert.equal(
    isCosmeticUnlocked(supporterItem, {
      tournamentsJoined: 10,
      totalKills: 100,
      totalWins: 10,
      unlockedCosmetics: [],
    }),
    false
  );
  assert.equal(
    isCosmeticUnlocked(supporterItem, {
      tournamentsJoined: 0,
      totalKills: 0,
      totalWins: 0,
      unlockedCosmetics: ['badge-arena-supporter'],
    }),
    true
  );
});
