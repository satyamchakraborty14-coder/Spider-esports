import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_LOGIN_COINS,
  getDailyLoginStatus,
  getPreviousUtcDateKey,
  getUtcDateKey,
} from './dailyLogin';

test('DAILY_LOGIN_COINS equals 10 and UTC date keys compute accurately across month boundaries', () => {
  assert.equal(DAILY_LOGIN_COINS, 10);
  const marchFirst = new Date('2026-03-01T08:15:00.000Z');
  assert.equal(getUtcDateKey(marchFirst), '2026-03-01');
  assert.equal(getPreviousUtcDateKey(marchFirst), '2026-02-28');
});

test('getDailyLoginStatus blocks duplicate claims on same UTC day and increments streak on consecutive days', () => {
  const now = new Date('2026-11-16T13:30:00.000Z');

  // Unauthenticated
  assert.equal(getDailyLoginStatus(null, now).canClaim, false);

  // First-ever claim
  const fresh = getDailyLoginStatus({ suspended: false }, now);
  assert.equal(fresh.canClaim, true);
  assert.equal(fresh.claimedToday, false);
  assert.equal(fresh.nextStreak, 1);

  // Claimed yesterday -> streak increments
  const consecutive = getDailyLoginStatus(
    { suspended: false, lastDailyClaimDate: '2026-11-15', dailyClaimStreak: 4 },
    now
  );
  assert.equal(consecutive.canClaim, true);
  assert.equal(consecutive.currentStreak, 4);
  assert.equal(consecutive.nextStreak, 5);

  // Missed a day -> streak resets cleanly to 1
  const missed = getDailyLoginStatus(
    { suspended: false, lastDailyClaimDate: '2026-11-13', dailyClaimStreak: 7 },
    now
  );
  assert.equal(missed.canClaim, true);
  assert.equal(missed.currentStreak, 0);
  assert.equal(missed.nextStreak, 1);

  // Already claimed today -> blocked
  const already = getDailyLoginStatus(
    { suspended: false, lastDailyClaimDate: '2026-11-16', dailyClaimStreak: 5 },
    now
  );
  assert.equal(already.canClaim, false);
  assert.equal(already.claimedToday, true);
  assert.equal(already.currentStreak, 5);

  // Suspended -> blocked
  const suspended = getDailyLoginStatus({ suspended: true }, now);
  assert.equal(suspended.canClaim, false);
});
