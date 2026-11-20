import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMatchCoinReward,
  calculateRupeesFromCoins,
  COSMETIC_CATALOG,
  evaluateUnlockedAchievements,
  formatRupees,
  getNonRedeemableCoins,
  getPlayerLeaderboardRank,
  getRedeemableWinningCoins,
  isCosmeticUnlocked,
  MIN_WITHDRAWAL_COINS,
  sortLeaderboard,
  validateAdminCoinAdjustment,
  validateWithdrawalRequest,
} from './coinSystem';
import type { LeaderboardEntry } from '../types/esports';

test('coin to rupee conversion strictly follows 1 coin = 1 rupee', () => {
  assert.equal(calculateRupeesFromCoins(0), 0);
  assert.equal(calculateRupeesFromCoins(50), 50);
  assert.equal(calculateRupeesFromCoins(100), 100);
  assert.equal(calculateRupeesFromCoins(250), 250);
  assert.equal(calculateRupeesFromCoins(1000), 1000);
  assert.equal(formatRupees(50), '₹50');
  assert.equal(formatRupees(125.5), '₹125.50');
});

test('winning prize vs non-redeemable added coin helpers split balances accurately', () => {
  assert.equal(getRedeemableWinningCoins({ coins: 350, winningCoins: 120 }), 120);
  assert.equal(getNonRedeemableCoins({ coins: 350, winningCoins: 120 }), 230);
  // Clamps winningCoins cleanly if somehow greater than total coins
  assert.equal(getRedeemableWinningCoins({ coins: 80, winningCoins: 150 }), 80);
  assert.equal(getNonRedeemableCoins({ coins: 80, winningCoins: 150 }), 0);
  // Legacy profile without winningCoins defaults redeemable to total coins
  assert.equal(getRedeemableWinningCoins({ coins: 200 }), 200);
  assert.equal(getNonRedeemableCoins({ coins: 200 }), 0);
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

test('admin coin adjustment tracks winning vs bonus coins and prevents negative balances', () => {
  assert.deepEqual(
    validateAdminCoinAdjustment({
      currentCoins: 500,
      currentWinningCoins: 100,
      deltaCoins: 250,
      coinType: 'winning',
    }),
    { valid: true, nextCoins: 750, nextWinningCoins: 350, deltaCoins: 250 }
  );
  assert.deepEqual(
    validateAdminCoinAdjustment({
      currentCoins: 500,
      currentWinningCoins: 100,
      deltaCoins: 250,
      coinType: 'bonus',
    }),
    { valid: true, nextCoins: 750, nextWinningCoins: 100, deltaCoins: 250 }
  );
  assert.deepEqual(
    validateAdminCoinAdjustment({
      currentCoins: 150,
      currentWinningCoins: 100,
      deltaCoins: -80,
      coinType: 'bonus',
    }),
    { valid: true, nextCoins: 70, nextWinningCoins: 70, deltaCoins: -80 }
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

test('withdrawal validation enforces 50 coin (₹50) minimum, winning-prize-only rule, and valid payout destination', () => {
  assert.equal(MIN_WITHDRAWAL_COINS, 50);
  assert.equal(
    validateWithdrawalRequest({
      amountCoins: 49,
      availableCoins: 500,
      availableWinningCoins: 500,
      method: 'upi',
      destination: 'spider@upi',
    }).valid,
    false
  );
  // 500 total coins (470 added via QR, only 30 winning prize) CANNOT withdraw 50 coins
  assert.equal(
    validateWithdrawalRequest({
      amountCoins: 50,
      availableCoins: 500,
      availableWinningCoins: 30,
      method: 'upi',
      destination: 'spider@upi',
    }).valid,
    false
  );
  // 500 total coins (400 added via QR, 100 winning prize) CAN withdraw up to 100, NOT 150
  assert.equal(
    validateWithdrawalRequest({
      amountCoins: 150,
      availableCoins: 500,
      availableWinningCoins: 100,
      method: 'upi',
      destination: 'spider@upi',
    }).valid,
    false
  );
  assert.equal(
    validateWithdrawalRequest({
      amountCoins: 50,
      availableCoins: 150,
      availableWinningCoins: 150,
      method: 'upi',
      destination: 'invalid-upi',
    }).valid,
    false
  );
  assert.deepEqual(
    validateWithdrawalRequest({
      amountCoins: 50,
      availableCoins: 250,
      availableWinningCoins: 50,
      method: 'upi',
      destination: 'satyam@okaxis',
    }),
    {
      valid: true,
      coins: 50,
      rupees: 50,
      destination: 'satyam@okaxis',
    }
  );
});

test('achievements and milestone cosmetics unlock via gameplay stats and coins', () => {
  const unlocked = evaluateUnlockedAchievements({
    tournamentsJoined: 1,
    totalKills: 30,
    totalWins: 1,
    coins: 50,
    achievements: [],
  });
  assert.deepEqual(
    unlocked.sort(),
    ['champion-1', 'coin-milestone-50', 'first-drop', 'sharpshooter-25'].sort()
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

  const veteranBadge = COSMETIC_CATALOG.find((c) => c.id === 'badge-arena-supporter')!;
  assert.equal(
    isCosmeticUnlocked(veteranBadge, {
      tournamentsJoined: 3,
      totalKills: 0,
      totalWins: 0,
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
