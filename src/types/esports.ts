export type TournamentCategory = 'Battle Royale' | 'Clash Squad' | 'Lone Wolf' | 'Custom';

export type StandardTournamentMode =
  | 'Solo'
  | 'Duo'
  | 'Squad'
  | 'CS 1v1'
  | 'CS 2v2'
  | 'CS 4v4'
  | 'Lone Wolf 1v1'
  | 'Lone Wolf 2v2';

export type TournamentMode = StandardTournamentMode | (string & {});

export type TournamentStatus = 'draft' | 'upcoming' | 'live' | 'completed' | 'cancelled';

export type MatchStatus = 'scheduled' | 'room_ready' | 'live' | 'completed' | 'cancelled';

export type ProfileThemeId = 'obsidian' | 'crimson-grid' | 'arachnid-gold' | 'stealth-carbon';

export type WithdrawalMethod = 'upi' | 'bank';

export type WithdrawalStatus = 'pending' | 'approved' | 'rejected';

export interface TeammateInput {
  ign: string;
  uid: string;
}

export interface Tournament {
  id: string;
  title: string;
  category: TournamentCategory;
  mode: TournamentMode;
  mapName: string;
  bannerUrl?: string;
  matchDate: string;
  matchTime: string;
  registrationDeadline: string; // ISO string
  credentialsReleaseAt: string; // ISO string
  maxSlots: number;
  filledSlots: number;
  status: TournamentStatus;
  featured: boolean;
  published: boolean;
  rules: string[];
  entryFeeCoins: number; // 0 = Free entry, > 0 = Entry fee in Spider Coins (1 Coin = ₹1)
  coinReward: number;
  perKillCoins: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Registration {
  id: string;
  tournamentId: string;
  userId: string;
  username: string;
  freeFireIgn: string;
  freeFireUid: string;
  teamName?: string;
  teammates?: TeammateInput[];
  slotNumber: number;
  entryFeePaid?: number;
  entryWinningCoinsPaid?: number;
  status: 'confirmed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface MatchInfo {
  id: string;
  tournamentId: string;
  title: string;
  mode: TournamentMode;
  status: MatchStatus;
  credentialsPublished: boolean;
  credentialsReleaseAt: string;
  updatedAt: string;
}

export interface MatchCredential {
  tournamentId: string;
  roomId: string;
  roomPassword: string;
  releaseAt: string;
  updatedAt: string;
}

export interface ResultStanding {
  rank: number;
  userId?: string;
  playerName: string;
  kills: number;
  points?: number;
  coinsAwarded?: number;
}

export interface TournamentResult {
  id: string;
  tournamentId: string;
  tournamentTitle: string;
  winnerUserId?: string;
  winnerName: string;
  totalKills: number;
  standings: ResultStanding[];
  verified: boolean;
  publishedAt: string;
}

export interface UserProfile {
  uid: string;
  username: string;
  usernameLower: string;
  freeFireIgn: string;
  freeFireUid: string;
  avatarUrl?: string;
  activeTheme: ProfileThemeId;
  activeBadge: string;
  tournamentsJoined: number;
  matchesPlayed: number;
  totalWins: number;
  totalKills: number;
  totalPoints: number;
  coins: number;
  winningCoins?: number;
  lastDepositUtr?: string;
  lastEntryTournamentId?: string;
  unlockedCosmetics: string[];
  achievements: string[];
  suspended: boolean;
  fcmEnabled: boolean;
  lastDailyClaimDate?: string;
  lastDailyClaimAt?: string;
  dailyClaimStreak?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LeaderboardEntry {
  id: string;
  userId: string;
  username: string;
  avatarUrl?: string;
  totalWins: number;
  totalKills: number;
  totalPoints: number;
  weeklyWins: number;
  weeklyKills: number;
  weeklyPoints: number;
  coins: number;
  updatedAt: string;
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  username: string;
  freeFireUid: string;
  coins: number;
  rupees: number;
  method: WithdrawalMethod;
  destination: string;
  status: WithdrawalStatus;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
}

export type CoinDepositStatus = 'verified' | 'rejected';

export interface CoinDeposit {
  id: string; // 12-digit UTR for replay prevention
  utr: string;
  userId: string;
  username: string;
  freeFireUid: string;
  rupees: number;
  coins: number;
  payerUpi?: string;
  screenshotUrl?: string;
  status: CoinDepositStatus;
  verificationNote: string;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string; // uid or 'all'
  title: string;
  body: string;
  type:
    | 'tournament'
    | 'registration'
    | 'room'
    | 'reminder'
    | 'cancellation'
    | 'result'
    | 'achievement'
    | 'withdrawal'
    | 'deposit'
    | 'system';
  tournamentId?: string;
  read: boolean;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: 'normal' | 'high';
  active: boolean;
  createdAt: string;
}

export interface AdminSettings {
  id: string;
  paymentQrDataUrl?: string;
  paymentUpiId?: string;
  paymentReceiverName?: string;
  telegramSupportUrl?: string;
  telegramSupportLabel?: string;
  featuredAnnouncement?: string;
  maintenanceMode: boolean;
  updatedAt: string;
}

export interface CosmeticItem {
  id: string;
  name: string;
  type: 'theme' | 'badge';
  description: string;
  unlockMetric?: 'tournamentsJoined' | 'totalKills' | 'totalWins';
  unlockThreshold: number;
  previewColor: string;
  themeId?: ProfileThemeId;
}

export interface AchievementItem {
  id: string;
  title: string;
  description: string;
  metric: 'tournamentsJoined' | 'totalKills' | 'totalWins' | 'coins';
  threshold: number;
}
