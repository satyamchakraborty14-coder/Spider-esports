import type {
  AchievementItem,
  CosmeticItem,
  LeaderboardEntry,
  UserProfile,
  WithdrawalMethod,
} from '../types/esports';

export const COINS_PER_10_INR = 100;
export const INR_PER_100_COINS = 10;
export const MIN_WITHDRAWAL_COINS = 100;
export const MAX_WITHDRAWAL_COINS = 10_000_000;

export const COSMETIC_CATALOG: CosmeticItem[] = [
  {
    id: 'theme-obsidian',
    name: 'Obsidian Core',
    type: 'theme',
    description: 'Standard matte-black Spider Esports competitive card frame.',
    unlockThreshold: 0,
    previewColor: '#18181b',
    themeId: 'obsidian',
  },
  {
    id: 'theme-crimson-grid',
    name: 'Crimson Vector',
    type: 'theme',
    description: 'Unlocked after joining 1 free community tournament.',
    unlockMetric: 'tournamentsJoined',
    unlockThreshold: 1,
    previewColor: '#e11d48',
    themeId: 'crimson-grid',
  },
  {
    id: 'theme-stealth-carbon',
    name: 'Stealth Carbon',
    type: 'theme',
    description: 'Unlocked after recording 10 verified eliminations.',
    unlockMetric: 'totalKills',
    unlockThreshold: 10,
    previewColor: '#52525b',
    themeId: 'stealth-carbon',
  },
  {
    id: 'theme-arachnid-gold',
    name: 'Apex Gold',
    type: 'theme',
    description: 'Champion amber-gold accent border unlocked upon 1 verified win.',
    unlockMetric: 'totalWins',
    unlockThreshold: 1,
    previewColor: '#f59e0b',
    themeId: 'arachnid-gold',
  },
  {
    id: 'badge-web-striker',
    name: 'Web Striker',
    type: 'badge',
    description: 'Community competitor emblem.',
    unlockThreshold: 0,
    previewColor: '#e11d48',
  },
  {
    id: 'badge-crimson-fang',
    name: 'Crimson Fang',
    type: 'badge',
    description: 'Unlocked after recording 25 verified eliminations.',
    unlockMetric: 'totalKills',
    unlockThreshold: 25,
    previewColor: '#fb7185',
  },
  {
    id: 'badge-arena-phantom',
    name: 'Arena Phantom',
    type: 'badge',
    description: 'Elite emblem unlocked upon claiming 3 verified match wins.',
    unlockMetric: 'totalWins',
    unlockThreshold: 3,
    previewColor: '#a1a1aa',
  },
  {
    id: 'badge-arena-supporter',
    name: 'Arena Supporter',
    type: 'badge',
    description:
      'Optional non-cash cosmetic emblem unlocked via Rewarded Ad (never awards Spider Coins or cash).',
    unlockThreshold: 1,
    rewardedAdUnlock: true,
    previewColor: '#fbbf24',
  },
];

export const REWARDED_COSMETIC_ID = 'badge-arena-supporter';

export const ACHIEVEMENTS_CATALOG: AchievementItem[] = [
  {
    id: 'first-drop',
    title: 'First Drop',
    description: 'Join your first free SPIDER ESPORTS tournament.',
    metric: 'tournamentsJoined',
    threshold: 1,
  },
  {
    id: 'sharpshooter-25',
    title: 'Headhunter',
    description: 'Record 25 verified eliminations across community matches.',
    metric: 'totalKills',
    threshold: 25,
  },
  {
    id: 'champion-1',
    title: 'Booyah Tactician',
    description: 'Claim 1 verified tournament victory.',
    metric: 'totalWins',
    threshold: 1,
  },
  {
    id: 'coin-milestone-1000',
    title: '100 Coin Earner',
    description: 'Accumulate 100 Spider Coins (₹10 payout threshold) from match rewards.',
    metric: 'coins',
    threshold: 100,
  },
];

export function calculateRupeesFromCoins(coins: number): number {
  if (!Number.isFinite(coins) || coins <= 0) return 0;
  return Math.round(((coins * INR_PER_100_COINS) / COINS_PER_10_INR) * 100) / 100;
}

export function formatRupees(rupees: number): string {
  return Number.isInteger(rupees) ? `₹${rupees}` : `₹${rupees.toFixed(2)}`;
}

export function calculateMatchCoinReward(params: {
  winBonusCoins: number;
  kills: number;
  coinsPerKill: number;
}): number {
  const win = Math.max(0, Math.floor(params.winBonusCoins || 0));
  const kills = Math.max(0, Math.floor(params.kills || 0));
  const perKill = Math.max(0, Math.floor(params.coinsPerKill || 0));
  return win + kills * perKill;
}

export function validateAdminCoinAdjustment(params: {
  currentCoins: number;
  deltaCoins: number;
}): { valid: true; nextCoins: number; deltaCoins: number } | { valid: false; error: string } {
  const { currentCoins, deltaCoins } = params;
  if (!Number.isInteger(deltaCoins) || deltaCoins === 0) {
    return { valid: false, error: 'Enter a non-zero whole number of coins.' };
  }
  if (Math.abs(deltaCoins) > 1_000_000) {
    return { valid: false, error: 'Single coin adjustment cannot exceed 1,000,000 coins.' };
  }
  const nextCoins = Math.floor(currentCoins) + deltaCoins;
  if (nextCoins < 0) {
    return { valid: false, error: 'Player coin balance cannot drop below 0.' };
  }
  return { valid: true, nextCoins, deltaCoins };
}

export function validateWithdrawalRequest(params: {
  amountCoins: number;
  availableCoins: number;
  method: WithdrawalMethod;
  destination: string;
}):
  | { valid: true; coins: number; rupees: number; destination: string }
  | { valid: false; error: string } {
  const { amountCoins, availableCoins, method, destination } = params;
  if (!Number.isInteger(amountCoins) || amountCoins < MIN_WITHDRAWAL_COINS) {
    return {
      valid: false,
      error: `Minimum withdrawal is ${MIN_WITHDRAWAL_COINS.toLocaleString()} coins (₹${INR_PER_100_COINS}).`,
    };
  }
  if (amountCoins > MAX_WITHDRAWAL_COINS) {
    return {
      valid: false,
      error: `Maximum single withdrawal is ${MAX_WITHDRAWAL_COINS.toLocaleString()} coins.`,
    };
  }
  if (amountCoins > availableCoins) {
    return {
      valid: false,
      error: `Insufficient coins. Available balance: ${availableCoins.toLocaleString()} coins.`,
    };
  }

  const trimmedDest = destination.trim();
  if (method === 'upi') {
    if (!/^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,32}$/.test(trimmedDest)) {
      return {
        valid: false,
        error: 'Enter a valid UPI ID (e.g. playername@upi).',
      };
    }
  } else {
    if (trimmedDest.length < 8 || trimmedDest.length > 120) {
      return {
        valid: false,
        error: 'Enter valid bank account number and IFSC code (8–120 characters).',
      };
    }
  }

  return {
    valid: true,
    coins: amountCoins,
    rupees: calculateRupeesFromCoins(amountCoins),
    destination: trimmedDest,
  };
}

export function isCosmeticUnlocked(
  item: CosmeticItem,
  profile: Pick<UserProfile, 'tournamentsJoined' | 'totalKills' | 'totalWins' | 'unlockedCosmetics'>
): boolean {
  if (item.rewardedAdUnlock) {
    return Boolean(profile.unlockedCosmetics?.includes(item.id));
  }
  if (item.unlockThreshold <= 0) return true;
  if (profile.unlockedCosmetics?.includes(item.id)) return true;
  if (!item.unlockMetric) return true;
  return (profile[item.unlockMetric] ?? 0) >= item.unlockThreshold;
}

export function evaluateUnlockedAchievements(
  profile: Pick<UserProfile, 'tournamentsJoined' | 'totalKills' | 'totalWins' | 'coins' | 'achievements'>
): string[] {
  const current = new Set(profile.achievements || []);
  for (const item of ACHIEVEMENTS_CATALOG) {
    const val = profile[item.metric] ?? 0;
    if (val >= item.threshold) {
      current.add(item.id);
    }
  }
  return Array.from(current);
}

export function sortLeaderboard(
  entries: LeaderboardEntry[],
  scope: 'global' | 'weekly'
): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (scope === 'weekly') {
      if (b.weeklyWins !== a.weeklyWins) return b.weeklyWins - a.weeklyWins;
      if (b.weeklyKills !== a.weeklyKills) return b.weeklyKills - a.weeklyKills;
      return (b.coins ?? 0) - (a.coins ?? 0);
    }
    if ((b.coins ?? 0) !== (a.coins ?? 0)) return (b.coins ?? 0) - (a.coins ?? 0);
    if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
    return b.totalKills - a.totalKills;
  });
}

export function getPlayerLeaderboardRank(
  entries: LeaderboardEntry[],
  userId: string,
  scope: 'global' | 'weekly' = 'global'
): number | null {
  const sorted = sortLeaderboard(entries, scope);
  const index = sorted.findIndex((entry) => entry.userId === userId);
  return index === -1 ? null : index + 1;
}

// AdMob policy-compliant frequency gating
export const INTERSTITIAL_COOLDOWN_MS = 90_000;

export function canShowInterstitial(params: {
  lastShownAtMs: number;
  nowMs?: number;
  cooldownMs?: number;
  isLiveMatchOrJoining: boolean;
}): boolean {
  const {
    lastShownAtMs,
    nowMs = Date.now(),
    cooldownMs = INTERSTITIAL_COOLDOWN_MS,
    isLiveMatchOrJoining,
  } = params;
  if (isLiveMatchOrJoining) return false;
  if (lastShownAtMs <= 0) return true;
  return nowMs - lastShownAtMs >= cooldownMs;
}
