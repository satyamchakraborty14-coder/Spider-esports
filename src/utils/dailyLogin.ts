import type { UserProfile } from '../types/esports';

export const DAILY_LOGIN_COINS = 10;

export interface DailyLoginStatus {
  todayKey: string;
  claimedToday: boolean;
  canClaim: boolean;
  currentStreak: number;
  nextStreak: number;
  reason?: string;
}

/**
 * Returns the UTC calendar date string (YYYY-MM-DD) matching Firestore server timestamps.
 */
export function getUtcDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Returns the previous UTC calendar date string (YYYY-MM-DD).
 */
export function getPreviousUtcDateKey(date: Date = new Date()): string {
  const prev = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1));
  return prev.toISOString().slice(0, 10);
}

export function getDailyLoginStatus(
  profile: Pick<UserProfile, 'suspended' | 'lastDailyClaimDate' | 'dailyClaimStreak'> | null,
  now: Date = new Date()
): DailyLoginStatus {
  const todayKey = getUtcDateKey(now);
  const yesterdayKey = getPreviousUtcDateKey(now);

  if (!profile) {
    return {
      todayKey,
      claimedToday: false,
      canClaim: false,
      currentStreak: 0,
      nextStreak: 1,
      reason: 'Sign in to claim your daily +10 Spider Coins.',
    };
  }

  const lastDate = profile.lastDailyClaimDate;
  const rawStreak = typeof profile.dailyClaimStreak === 'number' && profile.dailyClaimStreak > 0
    ? Math.floor(profile.dailyClaimStreak)
    : 0;

  if (lastDate === todayKey) {
    return {
      todayKey,
      claimedToday: true,
      canClaim: false,
      currentStreak: Math.max(1, rawStreak),
      nextStreak: Math.max(1, rawStreak),
      reason: 'Already claimed today. Come back tomorrow (UTC) for +10 more coins.',
    };
  }

  const isConsecutive = lastDate === yesterdayKey;
  const currentStreak = isConsecutive ? rawStreak : 0;
  const nextStreak = isConsecutive ? rawStreak + 1 : 1;

  if (profile.suspended) {
    return {
      todayKey,
      claimedToday: false,
      canClaim: false,
      currentStreak,
      nextStreak,
      reason: 'Account suspended — daily rewards are paused.',
    };
  }

  return {
    todayKey,
    claimedToday: false,
    canClaim: true,
    currentStreak,
    nextStreak,
  };
}
