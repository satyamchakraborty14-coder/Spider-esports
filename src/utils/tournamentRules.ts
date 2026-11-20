import {
  isValidImageDataUrl,
  MAX_TOURNAMENT_BANNER_LENGTH,
} from './imageUpload';
import type {
  StandardTournamentMode,
  TeammateInput,
  Tournament,
  TournamentCategory,
  TournamentMode,
} from '../types/esports';

export interface ModeDefinition {
  mode: TournamentMode;
  category: TournamentCategory;
  teamSize: number;
  requiredTeammates: number;
  defaultMaxSlots: number;
  shortLabel: string;
}

export const TOURNAMENT_MODES: Record<StandardTournamentMode, ModeDefinition> = {
  Solo: {
    mode: 'Solo',
    category: 'Battle Royale',
    teamSize: 1,
    requiredTeammates: 0,
    defaultMaxSlots: 48,
    shortLabel: 'BR Solo',
  },
  Duo: {
    mode: 'Duo',
    category: 'Battle Royale',
    teamSize: 2,
    requiredTeammates: 0,
    defaultMaxSlots: 24,
    shortLabel: 'BR Duo',
  },
  Squad: {
    mode: 'Squad',
    category: 'Battle Royale',
    teamSize: 4,
    requiredTeammates: 0,
    defaultMaxSlots: 12,
    shortLabel: 'BR Squad',
  },
  'CS 1v1': {
    mode: 'CS 1v1',
    category: 'Clash Squad',
    teamSize: 1,
    requiredTeammates: 0,
    defaultMaxSlots: 16,
    shortLabel: 'CS 1v1',
  },
  'CS 2v2': {
    mode: 'CS 2v2',
    category: 'Clash Squad',
    teamSize: 2,
    requiredTeammates: 0,
    defaultMaxSlots: 16,
    shortLabel: 'CS 2v2',
  },
  'CS 4v4': {
    mode: 'CS 4v4',
    category: 'Clash Squad',
    teamSize: 4,
    requiredTeammates: 0,
    defaultMaxSlots: 16,
    shortLabel: 'CS 4v4',
  },
  'Lone Wolf 1v1': {
    mode: 'Lone Wolf 1v1',
    category: 'Lone Wolf',
    teamSize: 1,
    requiredTeammates: 0,
    defaultMaxSlots: 16,
    shortLabel: 'LW 1v1',
  },
  'Lone Wolf 2v2': {
    mode: 'Lone Wolf 2v2',
    category: 'Lone Wolf',
    teamSize: 2,
    requiredTeammates: 0,
    defaultMaxSlots: 16,
    shortLabel: 'LW 2v2',
  },
};

export const CATEGORIES_WITH_MODES: Record<TournamentCategory, StandardTournamentMode[]> = {
  'Battle Royale': ['Solo', 'Duo', 'Squad'],
  'Clash Squad': ['CS 1v1', 'CS 2v2', 'CS 4v4'],
  'Lone Wolf': ['Lone Wolf 1v1', 'Lone Wolf 2v2'],
  Custom: [],
};

export const RANDOM_CUSTOM_MODE_IDEAS: string[] = [
  'Sniper Only 1v1',
  'One-Tap Headshot Duel',
  'Shotgun Rush 2v2',
  'Unlimited Gloo Wall Custom',
  'Random Weapon Chaos 4v4',
  'Pistol & Melee Showdown',
  'Fast Zone Rush Solo',
  'Custom Duo Survival',
];

export function pickRandomCustomModeName(excludeName?: string): string {
  const pool = RANDOM_CUSTOM_MODE_IDEAS.filter(
    (name) => name.toLowerCase() !== (excludeName || '').trim().toLowerCase()
  );
  const candidates = pool.length > 0 ? pool : RANDOM_CUSTOM_MODE_IDEAS;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function getModeDefinition(mode: TournamentMode): ModeDefinition {
  if (Object.prototype.hasOwnProperty.call(TOURNAMENT_MODES, mode)) {
    return TOURNAMENT_MODES[mode as StandardTournamentMode];
  }
  const cleanMode = (mode || 'Custom Mode').trim() || 'Custom Mode';
  return {
    mode: cleanMode,
    category: 'Custom',
    teamSize: 1,
    requiredTeammates: 0,
    defaultMaxSlots: 16,
    shortLabel: cleanMode,
  };
}

export function getModesForMatchesFilter(
  category: 'All' | TournamentCategory,
  tournaments: Pick<Tournament, 'category' | 'mode'>[]
): string[] {
  const standardList: string[] =
    category === 'All'
      ? [
          'Solo',
          'Duo',
          'Squad',
          'CS 1v1',
          'CS 2v2',
          'CS 4v4',
          'Lone Wolf 1v1',
          'Lone Wolf 2v2',
        ]
      : [...CATEGORIES_WITH_MODES[category]];

  const seen = new Set(standardList.map((m) => m.toLowerCase()));
  const dynamicModes: string[] = [];

  for (const t of tournaments) {
    if (category !== 'All' && t.category !== category) continue;
    const trimmed = (t.mode || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      dynamicModes.push(trimmed);
    }
  }

  return [...standardList, ...dynamicModes];
}

export function isTournamentFull(tournament: Pick<Tournament, 'filledSlots' | 'maxSlots'>): boolean {
  return tournament.filledSlots >= tournament.maxSlots;
}

export function getAvailableSlots(tournament: Pick<Tournament, 'filledSlots' | 'maxSlots'>): number {
  return Math.max(0, tournament.maxSlots - tournament.filledSlots);
}

export function validateFreeFireUid(uid: string): string | null {
  const trimmed = uid.trim();
  if (!trimmed) return 'Free Fire UID is required.';
  if (!/^[0-9]{6,16}$/.test(trimmed)) {
    return 'Free Fire UID must be 6 to 16 digits (numbers only).';
  }
  return null;
}

export function validateFreeFireIgn(ign: string): string | null {
  const trimmed = ign.trim();
  if (trimmed.length < 2 || trimmed.length > 32) {
    return 'In-Game Name (IGN) must be between 2 and 32 characters.';
  }
  return null;
}

export function validateTeammates(
  mode: TournamentMode,
  teammates: TeammateInput[],
  captainUid: string
): string | null {
  const def = getModeDefinition(mode);
  if (def.requiredTeammates === 0) return null;

  if (teammates.length !== def.requiredTeammates) {
    return `${mode} requires ${def.requiredTeammates} teammate${def.requiredTeammates > 1 ? 's' : ''}.`;
  }

  const seenUids = new Set<string>([captainUid.trim()]);
  for (let i = 0; i < teammates.length; i++) {
    const mate = teammates[i];
    const ignErr = validateFreeFireIgn(mate.ign);
    if (ignErr) return `Teammate ${i + 1}: ${ignErr}`;

    const uidErr = validateFreeFireUid(mate.uid);
    if (uidErr) return `Teammate ${i + 1}: ${uidErr}`;

    if (seenUids.has(mate.uid.trim())) {
      return `Teammate ${i + 1} UID duplicates another roster player.`;
    }
    seenUids.add(mate.uid.trim());
  }
  return null;
}

export interface JoinEligibilityResult {
  allowed: boolean;
  reason?: string;
}

export const MAX_ENTRY_FEE_COINS = 1_000_000;
export const MAX_PRIZE_POOL_COINS = 10_000_000;
export const MAX_PER_KILL_COINS = 100_000;

export function getTournamentEntryFee(tournament: Pick<Tournament, 'entryFeeCoins'> | null | undefined): number {
  if (!tournament || typeof tournament.entryFeeCoins !== 'number' || !Number.isFinite(tournament.entryFeeCoins)) {
    return 0;
  }
  return Math.max(0, Math.floor(tournament.entryFeeCoins));
}

export function formatEntryFeeLabel(entryFeeCoins: number, compact = false): string {
  const fee = Math.max(0, Math.floor(entryFeeCoins || 0));
  if (fee === 0) return 'FREE';
  return compact ? `${fee.toLocaleString()} Coins` : `${fee.toLocaleString()} Coins (₹${fee.toLocaleString()})`;
}

export function validateCustomModeName(
  modeName: string
): { valid: true; mode: string } | { valid: false; error: string } {
  const trimmed = modeName.trim();
  if (trimmed.length < 2 || trimmed.length > 48) {
    return { valid: false, error: 'Custom mode name must be between 2 and 48 characters.' };
  }
  return { valid: true, mode: trimmed };
}

export function validateEntryFeeCoins(
  entryFeeCoins: number
): { valid: true; entryFeeCoins: number } | { valid: false; error: string } {
  if (!Number.isInteger(entryFeeCoins) || entryFeeCoins < 0 || entryFeeCoins > MAX_ENTRY_FEE_COINS) {
    return {
      valid: false,
      error: `Entry fee must be a whole number from 0 (Free) up to ${MAX_ENTRY_FEE_COINS.toLocaleString()} coins.`,
    };
  }
  return { valid: true, entryFeeCoins };
}

export function validatePrizePoolCoins(
  coinReward: number,
  perKillCoins: number
): { valid: true; coinReward: number; perKillCoins: number } | { valid: false; error: string } {
  if (!Number.isInteger(coinReward) || coinReward < 0 || coinReward > MAX_PRIZE_POOL_COINS) {
    return {
      valid: false,
      error: `Prize pool must be a whole number from 0 up to ${MAX_PRIZE_POOL_COINS.toLocaleString()} coins.`,
    };
  }
  if (!Number.isInteger(perKillCoins) || perKillCoins < 0 || perKillCoins > MAX_PER_KILL_COINS) {
    return {
      valid: false,
      error: `Per-kill coins must be a whole number from 0 up to ${MAX_PER_KILL_COINS.toLocaleString()} coins.`,
    };
  }
  return { valid: true, coinReward, perKillCoins };
}

export function calculateEntryFeeDeduction(params: {
  currentCoins: number;
  currentWinningCoins: number;
  entryFeeCoins: number;
}):
  | {
      valid: true;
      nextCoins: number;
      nextWinningCoins: number;
      entryFeePaid: number;
      winningCoinsSpent: number;
    }
  | { valid: false; error: string } {
  const safeCoins = Math.max(0, Math.floor(params.currentCoins));
  const safeWinning = Math.max(0, Math.min(safeCoins, Math.floor(params.currentWinningCoins)));
  const fee = Math.max(0, Math.floor(params.entryFeeCoins));

  if (safeCoins < fee) {
    return {
      valid: false,
      error: `Insufficient Spider Coins. Entry fee is ${fee.toLocaleString()} coins (₹${fee.toLocaleString()}), and your wallet has ${safeCoins.toLocaleString()} coins. Add coins via QR in Profile.`,
    };
  }

  const nextCoins = safeCoins - fee;
  // Spend non-redeemable added/bonus coins first; preserve winningCoins whenever possible
  const nextWinningCoins = Math.min(nextCoins, safeWinning);
  const winningCoinsSpent = safeWinning - nextWinningCoins;

  return {
    valid: true,
    nextCoins,
    nextWinningCoins,
    entryFeePaid: fee,
    winningCoinsSpent,
  };
}

export function calculateEntryFeeRefund(params: {
  currentCoins: number;
  currentWinningCoins: number;
  entryFeePaid: number;
  entryWinningCoinsPaid: number;
}): { nextCoins: number; nextWinningCoins: number; refundedCoins: number } {
  const safeCoins = Math.max(0, Math.floor(params.currentCoins));
  const safeWinning = Math.max(0, Math.min(safeCoins, Math.floor(params.currentWinningCoins)));
  const feePaid = Math.max(0, Math.floor(params.entryFeePaid));
  const winPaid = Math.max(0, Math.min(feePaid, Math.floor(params.entryWinningCoinsPaid)));

  const nextCoins = safeCoins + feePaid;
  const nextWinningCoins = Math.min(nextCoins, safeWinning + winPaid);

  return {
    nextCoins,
    nextWinningCoins,
    refundedCoins: feePaid,
  };
}

export function canJoinTournament(params: {
  tournament: Tournament;
  alreadyRegistered: boolean;
  userSuspended: boolean;
  userCoins?: number;
  nowMs?: number;
}): JoinEligibilityResult {
  const { tournament, alreadyRegistered, userSuspended, userCoins, nowMs = Date.now() } = params;

  if (userSuspended) {
    return { allowed: false, reason: 'Your account is currently suspended from tournaments.' };
  }
  if (alreadyRegistered) {
    return { allowed: false, reason: 'You are already registered for this tournament.' };
  }
  if (!tournament.published || tournament.status === 'draft') {
    return { allowed: false, reason: 'Tournament is not open for public registration.' };
  }
  if (tournament.status === 'cancelled') {
    return { allowed: false, reason: 'This tournament has been cancelled.' };
  }
  if (tournament.status === 'completed') {
    return { allowed: false, reason: 'This tournament has already concluded.' };
  }
  if (tournament.status === 'live') {
    return { allowed: false, reason: 'Match is already live; registration is closed.' };
  }
  if (isTournamentFull(tournament)) {
    return { allowed: false, reason: 'All tournament slots are full.' };
  }
  const deadlineMs = Date.parse(tournament.registrationDeadline);
  if (!Number.isNaN(deadlineMs) && nowMs > deadlineMs) {
    return { allowed: false, reason: 'Registration deadline has passed.' };
  }
  const entryFee = getTournamentEntryFee(tournament);
  if (typeof userCoins === 'number' && entryFee > 0 && Math.floor(userCoins) < entryFee) {
    return {
      allowed: false,
      reason: `Insufficient balance: entry fee is ${entryFee.toLocaleString()} coins (₹${entryFee.toLocaleString()}), and you have ${Math.max(0, Math.floor(userCoins)).toLocaleString()} coins.`,
    };
  }
  return { allowed: true };
}

export function canCancelRegistration(params: {
  tournament: Tournament;
  isRegistered: boolean;
  nowMs?: number;
}): JoinEligibilityResult {
  const { tournament, isRegistered, nowMs = Date.now() } = params;
  if (!isRegistered) {
    return { allowed: false, reason: 'You are not registered for this tournament.' };
  }
  if (tournament.status === 'live' || tournament.status === 'completed' || tournament.status === 'cancelled') {
    return { allowed: false, reason: `Cannot cancel when match status is ${tournament.status}.` };
  }
  const deadlineMs = Date.parse(tournament.registrationDeadline);
  if (!Number.isNaN(deadlineMs) && nowMs > deadlineMs) {
    return { allowed: false, reason: 'Cancellation window closed after the registration deadline.' };
  }
  return { allowed: true };
}

export function canViewRoomCredentials(params: {
  isAdmin: boolean;
  isRegistered: boolean;
  credentialsPublished: boolean;
  credentialsReleaseAt: string;
  nowMs?: number;
}): { visible: boolean; reason: string } {
  const { isAdmin, isRegistered, credentialsPublished, credentialsReleaseAt, nowMs = Date.now() } = params;

  if (isAdmin) {
    return { visible: true, reason: 'Admin access granted.' };
  }
  if (!isRegistered) {
    return {
      visible: false,
      reason: 'Register for this tournament to unlock Room ID and Password.',
    };
  }
  if (!credentialsPublished) {
    return {
      visible: false,
      reason: 'Admin has not created the custom room yet. Check back closer to match time.',
    };
  }
  const releaseMs = Date.parse(credentialsReleaseAt);
  if (!Number.isNaN(releaseMs) && nowMs < releaseMs) {
    return {
      visible: false,
      reason: `Room credentials unlock at ${new Date(releaseMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
    };
  }
  return { visible: true, reason: 'Unlocked for registered participant.' };
}

export function isTodayIsoDate(matchDateStr: string, now = new Date()): boolean {
  const todayIso = now.toISOString().slice(0, 10);
  return matchDateStr === todayIso;
}

export const SOLE_ADMIN_EMAIL = 'satyamchakraborty14@gmail.com';

export function isStrictSoleAdminEmail(
  email: string | null | undefined,
  emailVerified: boolean | null | undefined
): boolean {
  if (!emailVerified || !email) return false;
  return email.trim().toLowerCase() === SOLE_ADMIN_EMAIL;
}

export function isStrictSoleAdminSession(params: {
  email: string | null | undefined;
  emailVerified: boolean | null | undefined;
  signInProvider: string | null | undefined;
}): boolean {
  const { email, emailVerified, signInProvider } = params;
  if (!isStrictSoleAdminEmail(email, emailVerified)) return false;
  return signInProvider === 'password';
}

export function validateAdminPassword(password: string, confirmPassword?: string): string | null {
  if (password.length < 8) {
    return 'Admin password must be at least 8 characters long.';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Admin password must include at least one letter and one number.';
  }
  if (typeof confirmPassword === 'string' && password !== confirmPassword) {
    return 'Passwords do not match.';
  }
  return null;
}

export const MIN_TOURNAMENT_SLOTS = 2;
export const MAX_TOURNAMENT_SLOTS = 1_000_000;

export function validateAdminSlotUpdate(
  maxSlots: number,
  filledSlots: number
): { valid: true; maxSlots: number; filledSlots: number } | { valid: false; error: string } {
  if (
    !Number.isInteger(maxSlots) ||
    maxSlots < MIN_TOURNAMENT_SLOTS ||
    maxSlots > MAX_TOURNAMENT_SLOTS
  ) {
    return {
      valid: false,
      error: `Max slots must be a whole number of at least ${MIN_TOURNAMENT_SLOTS} (up to ${MAX_TOURNAMENT_SLOTS.toLocaleString()}).`,
    };
  }
  if (!Number.isInteger(filledSlots) || filledSlots < 0) {
    return { valid: false, error: 'Filled slots cannot be negative.' };
  }
  if (filledSlots > maxSlots) {
    return {
      valid: false,
      error: `Filled slots (${filledSlots}) cannot exceed max slots (${maxSlots}).`,
    };
  }
  return { valid: true, maxSlots, filledSlots };
}

export function validateSlotAssignment(
  slotNumber: number,
  maxSlots: number
): { valid: true; slotNumber: number } | { valid: false; error: string } {
  if (!Number.isInteger(slotNumber) || slotNumber < 1) {
    return { valid: false, error: 'Slot number must be at least 1.' };
  }
  if (
    !Number.isInteger(maxSlots) ||
    maxSlots < MIN_TOURNAMENT_SLOTS ||
    maxSlots > MAX_TOURNAMENT_SLOTS
  ) {
    return {
      valid: false,
      error: `Tournament max slots must be between ${MIN_TOURNAMENT_SLOTS} and ${MAX_TOURNAMENT_SLOTS.toLocaleString()}.`,
    };
  }
  if (slotNumber > maxSlots) {
    return {
      valid: false,
      error: `Slot #${slotNumber} exceeds the tournament max of ${maxSlots} slots.`,
    };
  }
  return { valid: true, slotNumber };
}

export function validateTournamentBannerUrl(
  rawUrl: string
): { valid: true; bannerUrl: string } | { valid: false; error: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, error: 'Please upload a match picture or select a preset.' };
  }
  if (trimmed.length > MAX_TOURNAMENT_BANNER_LENGTH) {
    return {
      valid: false,
      error: 'Uploaded match image is too large. Please upload a smaller photo.',
    };
  }
  if (trimmed.startsWith('data:')) {
    if (!isValidImageDataUrl(trimmed)) {
      return {
        valid: false,
        error: 'Uploaded image must be a valid PNG, JPG, or WEBP photo.',
      };
    }
    return { valid: true, bannerUrl: trimmed };
  }
  if (
    !trimmed.startsWith('/src/assets/') &&
    !trimmed.startsWith('/assets/') &&
    !trimmed.startsWith('https://') &&
    !trimmed.startsWith('http://')
  ) {
    return {
      valid: false,
      error: 'Match picture must be an uploaded image, built-in preset, or valid image URL.',
    };
  }
  if (!trimmed.startsWith('data:') && trimmed.length > 300) {
    return { valid: false, error: 'Match picture URL must be 300 characters or less.' };
  }
  return { valid: true, bannerUrl: trimmed };
}

