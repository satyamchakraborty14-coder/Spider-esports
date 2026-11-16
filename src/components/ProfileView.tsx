import { useState } from 'react';
import {
  Award,
  Bell,
  CheckCircle2,
  Coins,
  Crown,
  FileText,
  History,
  IndianRupee,
  KeyRound,
  LogOut,
  Palette,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Trophy,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import {
  deleteAccountCompletely,
  equipCosmetic,
  logoutUser,
  requestCoinWithdrawal,
  setOrUpdateAppPassword,
  unlockRewardedAdCosmetic,
  updatePlayerIdentity,
} from '../lib/firestoreService';
import { showRewardedAdForCosmetic } from '../lib/admobBridge';
import { BRAND_ASSETS } from '../lib/seedData';
import type {
  AdminSettings,
  LeaderboardEntry,
  Registration,
  Tournament,
  TournamentResult,
  UserProfile,
  WithdrawalMethod,
  WithdrawalRequest,
} from '../types/esports';
import {
  ACHIEVEMENTS_CATALOG,
  calculateRupeesFromCoins,
  COINS_PER_10_INR,
  COSMETIC_CATALOG,
  formatRupees,
  getPlayerLeaderboardRank,
  INR_PER_1000_COINS,
  isCosmeticUnlocked,
  MIN_WITHDRAWAL_COINS,
  validateWithdrawalRequest,
} from '../utils/coinSystem';
import {
  isStrictSoleAdminEmail,
  validateAdminPassword,
  validateFreeFireIgn,
  validateFreeFireUid,
} from '../utils/tournamentRules';
import { buildPlayedMatchesWithResults } from '../utils/resultHelpers';
import {
  getWithdrawalStatusMeta,
  summarizeWithdrawals,
  type WithdrawalFilterStatus,
} from '../utils/withdrawalHistory';
import { getAdConsentSummary } from '../utils/adConsent';
import { AdMobBannerSlot } from './AdMobUnits';
import { ConsentManagementModal } from './ConsentManagementModal';
import { WithdrawalHistoryModal } from './WithdrawalHistoryModal';
import { sendEmailVerification } from 'firebase/auth';

interface ProfileViewProps {
  profile: UserProfile | null;
  isSignedIn: boolean;
  isEmailVerified: boolean;
  userEmail: string | null;
  signInProvider?: string | null;
  registrations: Registration[];
  withdrawals: WithdrawalRequest[];
  tournaments: Tournament[];
  results: TournamentResult[];
  leaderboard: LeaderboardEntry[];
  adminSettings: AdminSettings;
  consentAccepted?: boolean;
  onUpdateConsent?: (accepted: boolean) => void;
  onOpenAuth: () => void;
  onNavigateResults: () => void;
  onSelectTournament?: (t: Tournament) => void;
  onToast: (msg: string) => void;
  onRefreshVerification: () => Promise<void>;
}

export function ProfileView({
  profile,
  isSignedIn,
  isEmailVerified,
  userEmail,
  signInProvider,
  registrations,
  withdrawals,
  tournaments,
  results,
  leaderboard,
  adminSettings,
  consentAccepted = false,
  onUpdateConsent,
  onOpenAuth,
  onNavigateResults,
  onSelectTournament,
  onToast,
  onRefreshVerification,
}: ProfileViewProps) {
  const [ignEdit, setIgnEdit] = useState(profile?.freeFireIgn || '');
  const [uidEdit, setUidEdit] = useState(profile?.freeFireUid || '');
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [legalDoc, setLegalDoc] = useState<'privacy' | 'terms' | 'playstore' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [appPassword, setAppPassword] = useState('');
  const [appPasswordConfirm, setAppPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  // Rewarded Ad Cosmetic Unlock State (strictly non-cash, 0 Spider Coins)
  const [watchingRewardAd, setWatchingRewardAd] = useState(false);
  const [rewardAdError, setRewardAdError] = useState<string | null>(null);

  // Withdrawal Form & History Modal State
  const [withdrawCoins, setWithdrawCoins] = useState<number>(MIN_WITHDRAWAL_COINS);
  const [withdrawMethod, setWithdrawMethod] = useState<WithdrawalMethod>('upi');
  const [withdrawDest, setWithdrawDest] = useState('');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [submittingWithdraw, setSubmittingWithdraw] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<WithdrawalFilterStatus>('all');
  const [consentModalOpen, setConsentModalOpen] = useState(false);

  const openHistoryModal = (filter: WithdrawalFilterStatus = 'all') => {
    setHistoryFilter(filter);
    setHistoryModalOpen(true);
  };

  const withdrawalSummary = summarizeWithdrawals(withdrawals);

  const showOwnerPasswordSetup =
    isSignedIn &&
    isEmailVerified &&
    isStrictSoleAdminEmail(userEmail, isEmailVerified) &&
    signInProvider !== 'password';

  const playedMatches = buildPlayedMatchesWithResults({
    registrations,
    tournaments,
    results,
    userId: profile?.uid,
    username: profile?.username,
    freeFireIgn: profile?.freeFireIgn,
  });
  const rank = profile ? getPlayerLeaderboardRank(leaderboard, profile.uid, 'global') : null;
  const userCoins = profile?.coins ?? 0;
  const walletRupees = calculateRupeesFromCoins(userCoins);
  const thresholdPercent = Math.min(100, Math.round((userCoins / MIN_WITHDRAWAL_COINS) * 100));
  const previewPayout = calculateRupeesFromCoins(Number.isFinite(withdrawCoins) ? withdrawCoins : 0);

  const themeAccentClass =
    profile?.activeTheme === 'crimson-grid'
      ? 'border-[#E11D48]/60'
      : profile?.activeTheme === 'arachnid-gold'
        ? 'border-amber-500/60'
        : profile?.activeTheme === 'stealth-carbon'
          ? 'border-zinc-500/60'
          : 'border-white/10';

  const handleSaveIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setErrorMsg(null);
    if (!isEmailVerified) {
      setErrorMsg('Please verify your email address first using the banner above (Resend Link -> click link -> Refresh Status).');
      return;
    }
    const ignErr = validateFreeFireIgn(ignEdit);
    if (ignErr) {
      setErrorMsg(ignErr);
      return;
    }
    const uidErr = validateFreeFireUid(uidEdit);
    if (uidErr) {
      setErrorMsg(uidErr);
      return;
    }
    setSaving(true);
    try {
      await updatePlayerIdentity(profile.uid, {
        freeFireIgn: ignEdit,
        freeFireUid: uidEdit,
      });
      setEditingIdentity(false);
      onToast('Free Fire identity updated.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFcm = async () => {
    if (!profile) return;
    if (!isEmailVerified) {
      onToast('Verify your email address first (Resend Link -> Refresh Status) before updating alerts.');
      return;
    }
    try {
      const next = !profile.fcmEnabled;
      if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      await updatePlayerIdentity(profile.uid, {
        freeFireIgn: profile.freeFireIgn,
        freeFireUid: profile.freeFireUid,
        fcmEnabled: next,
      });
      onToast(next ? 'Push notifications enabled.' : 'Push notifications paused.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to update notification preference.');
    }
  };

  const handleEquipCosmetic = async (itemId: string) => {
    if (!profile) return;
    if (!isEmailVerified) {
      onToast('Verify your email address first (Resend Link -> Refresh Status) before equipping cosmetics.');
      return;
    }
    const item = COSMETIC_CATALOG.find((c) => c.id === itemId);
    if (!item) return;
    try {
      await equipCosmetic({
        profile,
        cosmeticId: item.id,
        type: item.type,
        themeId: item.themeId,
      });
      onToast(`${item.name} equipped on your profile.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to equip cosmetic.');
    }
  };

  const handleWatchRewardedAd = async (cosmeticId: string) => {
    if (!profile) return;
    setRewardAdError(null);
    if (!isEmailVerified) {
      const msg = 'Verify your email address first before unlocking cosmetics.';
      setRewardAdError(msg);
      onToast(msg);
      return;
    }
    if (profile.unlockedCosmetics?.includes(cosmeticId)) {
      onToast('Arena Supporter emblem is already unlocked on your profile.');
      return;
    }
    setWatchingRewardAd(true);
    try {
      const res = await showRewardedAdForCosmetic(adminSettings, consentAccepted);
      if (res.outcome === 'rewarded') {
        const unlockRes = await unlockRewardedAdCosmetic({ profile, cosmeticId });
        onToast(
          unlockRes.alreadyUnlocked
            ? 'Arena Supporter emblem was already unlocked.'
            : 'Ad completed! Arena Supporter cosmetic emblem unlocked & equipped (0 Coins).'
        );
      } else {
        const msg =
          res.error || 'Rewarded ad did not complete. Cosmetic remains locked (0 rewards granted).';
        setRewardAdError(msg);
        onToast(msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to unlock cosmetic via rewarded ad.';
      setRewardAdError(msg);
      onToast(msg);
    } finally {
      setWatchingRewardAd(false);
    }
  };

  const handleSubmitWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setWithdrawError(null);

    if (!isEmailVerified) {
      setWithdrawError('Please verify your email address before requesting a withdrawal.');
      return;
    }

    const validation = validateWithdrawalRequest({
      amountCoins: Math.floor(Number(withdrawCoins)),
      availableCoins: profile.coins,
      method: withdrawMethod,
      destination: withdrawDest,
    });
    if (!validation.valid) {
      setWithdrawError(validation.error);
      return;
    }

    setSubmittingWithdraw(true);
    try {
      await requestCoinWithdrawal({
        profile,
        amountCoins: validation.coins,
        method: withdrawMethod,
        destination: validation.destination,
      });
      setWithdrawDest('');
      setWithdrawCoins(MIN_WITHDRAWAL_COINS);
      onToast(
        `Withdrawal requested: ${formatRupees(validation.rupees)} (${validation.coins.toLocaleString()} coins).`
      );
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : 'Unable to submit withdrawal.');
    } finally {
      setSubmittingWithdraw(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!profile) return;
    if (!isEmailVerified) {
      setErrorMsg('Please verify your email address first before deleting your account.');
      return;
    }
    setSaving(true);
    try {
      await deleteAccountCompletely(profile);
      setConfirmDelete(false);
      onToast('Your SPIDER ESPORTS account and profile data have been permanently deleted.');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Recent login required before deleting account. Sign out and sign back in to confirm.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      onToast('Verification email sent. Check your inbox.');
    } catch {
      onToast('Verification email recently sent. Please check your inbox.');
    }
  };

  const handleSetAppPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    const err = validateAdminPassword(appPassword, appPasswordConfirm);
    if (err) {
      setPasswordError(err);
      return;
    }
    setSavingPassword(true);
    try {
      const outcome = await setOrUpdateAppPassword(appPassword, appPasswordConfirm);
      setAppPassword('');
      setAppPasswordConfirm('');
      onToast(
        outcome === 'linked'
          ? 'App password set! Sign out and log in with your Email & Password to open the Admin Console.'
          : 'App password updated! Sign out and log in with your Email & Password to open the Admin Console.'
      );
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Unable to save app password.');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Unauthenticated Banner */}
      {!isSignedIn || !profile ? (
        <section className="rounded-2xl border border-white/10 bg-[#121216] p-8 text-center space-y-4">
          <img
            src={BRAND_ASSETS.defaultAvatar}
            alt="Default player emblem"
            referrerPolicy="no-referrer"
            className="w-20 h-20 rounded-2xl mx-auto object-cover border border-white/10"
          />
          <h1 className="font-display text-3xl font-extrabold text-white">
            Create Your SPIDER ESPORTS Profile
          </h1>
          <p className="text-sm text-zinc-400 max-w-lg mx-auto">
            Register with your unique username and Free Fire UID to join free community tournaments, earn Spider Coins from playing, kills, and wins (1,000 Coins = ₹10), and climb the global ladder.
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="min-h-[48px] px-6 py-3 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-sm font-semibold text-white"
          >
            Sign In or Register
          </button>
        </section>
      ) : (
        <>
          {/* Email Verification Alert */}
          {!isEmailVerified && (
            <section className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-300">Verify Your Email Address</p>
                <p className="text-xs text-zinc-300">
                  Email verification is required before updating your profile, joining tournaments, requesting coin withdrawals, or unlocking admin access ({userEmail}). Click Resend Link, open the link in your inbox, then click Refresh Status.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleResendVerification}
                  className="min-h-[40px] px-3.5 py-2 rounded-lg border border-white/15 text-xs font-semibold text-white hover:bg-white/5"
                >
                  Resend Link
                </button>
                <button
                  type="button"
                  onClick={onRefreshVerification}
                  className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh Status
                </button>
              </div>
            </section>
          )}

          {/* Profile Header Card */}
          <section className={`rounded-2xl border ${themeAccentClass} bg-[#121216] p-6 space-y-6`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                <img
                  src={profile.avatarUrl || BRAND_ASSETS.defaultAvatar}
                  alt={profile.username}
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-white/15 shrink-0"
                />
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    <span className="text-[#F43F5E] font-semibold">
                      {COSMETIC_CATALOG.find((c) => c.id === profile.activeBadge)?.name || 'Competitor'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Rank {rank ? `#${rank}` : 'Unranked'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{profile.suspended ? 'Suspended' : 'Active'}</span>
                  </div>
                  <h1 className="font-display text-3xl font-extrabold text-white">{profile.username}</h1>
                  <p className="text-xs text-zinc-400 font-mono-tabular">
                    IGN: {profile.freeFireIgn} · FF UID: {profile.freeFireUid}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIgnEdit(profile.freeFireIgn);
                    setUidEdit(profile.freeFireUid);
                    setEditingIdentity((prev) => !prev);
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-white/15 hover:bg-white/5 text-xs font-semibold text-white"
                >
                  {editingIdentity ? 'Close Edit' : 'Edit FF UID'}
                </button>
                <button
                  type="button"
                  onClick={handleToggleFcm}
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-white/15 hover:bg-white/5 text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5"
                >
                  <Bell className="w-3.5 h-3.5 text-[#E11D48]" />
                  {profile.fcmEnabled ? 'Alerts On' : 'Enable Alerts'}
                </button>
                <button
                  type="button"
                  onClick={() => openHistoryModal('all')}
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-white/15 hover:bg-white/5 text-xs font-semibold text-white inline-flex items-center gap-1.5"
                >
                  <History className="w-3.5 h-3.5 text-amber-400" />
                  Withdrawal History ({withdrawals.length})
                </button>
                <button
                  type="button"
                  onClick={logoutUser}
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-xs font-semibold text-zinc-300 inline-flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            </div>

            {editingIdentity && (
              <form
                onSubmit={handleSaveIdentity}
                className="rounded-xl border border-white/10 bg-[#09090B] p-4 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-ign" className="block text-xs text-zinc-400 mb-1">
                      Free Fire IGN
                    </label>
                    <input
                      id="edit-ign"
                      type="text"
                      value={ignEdit}
                      onChange={(e) => setIgnEdit(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-white/10 bg-[#121216] text-sm text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-uid" className="block text-xs text-zinc-400 mb-1">
                      Free Fire UID
                    </label>
                    <input
                      id="edit-uid"
                      type="text"
                      inputMode="numeric"
                      value={uidEdit}
                      onChange={(e) => setUidEdit(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-white/10 bg-[#121216] text-sm font-mono-tabular text-white"
                    />
                  </div>
                </div>
                {errorMsg && <p className="text-xs text-[#F43F5E]">{errorMsg}</p>}
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-5 py-2 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white"
                >
                  {saving ? 'Saving...' : 'Save Identity'}
                </button>
              </form>
            )}

            {/* Single Spider Coin Progress to Minimum Withdrawal */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between text-xs tabular-nums flex-wrap gap-2">
                <span className="font-semibold text-white inline-flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-400" />
                  {userCoins.toLocaleString()} Spider Coins ({formatRupees(walletRupees)})
                </span>
                <span className="text-zinc-400">
                  {userCoins >= MIN_WITHDRAWAL_COINS
                    ? 'Withdrawal unlocked · 1,000 Coins = ₹10'
                    : `${(MIN_WITHDRAWAL_COINS - userCoins).toLocaleString()} more coins to unlock ₹10 withdrawal`}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all"
                  style={{ width: `${thresholdPercent}%` }}
                />
              </div>
            </div>

            {/* Career Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-2 border-t border-white/10 text-xs tabular-nums">
              <div>
                <p className="text-zinc-400">Tournaments</p>
                <p className="text-xl font-bold text-white mt-0.5">{profile.tournamentsJoined}</p>
              </div>
              <div>
                <p className="text-zinc-400">Matches</p>
                <p className="text-xl font-bold text-white mt-0.5">{profile.matchesPlayed}</p>
              </div>
              <div>
                <p className="text-zinc-400">Wins</p>
                <p className="text-xl font-bold text-white mt-0.5">{profile.totalWins}</p>
              </div>
              <div>
                <p className="text-zinc-400">Kills</p>
                <p className="text-xl font-bold text-white mt-0.5">{profile.totalKills}</p>
              </div>
              <div>
                <p className="text-zinc-400">Spider Coins</p>
                <p className="text-xl font-bold text-amber-400 mt-0.5">{userCoins.toLocaleString()}</p>
              </div>
            </div>
          </section>

          {/* Spider Coin Wallet & Withdrawal (1,000 Coins = ₹10) */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleSubmitWithdrawal}
              className="lg:col-span-6 rounded-xl border border-white/10 bg-[#121216] p-6 space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-amber-400" />
                    Withdraw Spider Coins
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Rate: <strong className="text-white">{COINS_PER_10_INR.toLocaleString()} Coins = ₹{INR_PER_1000_COINS}</strong>. Coins are earned through match play, verified kills, and tournament wins credited by admin.
                  </p>
                </div>
                <div className="text-right shrink-0 tabular-nums">
                  <p className="text-[11px] text-zinc-400">Available</p>
                  <p className="text-base font-bold text-amber-400">{userCoins.toLocaleString()}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {[1000, 2500, 5000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={userCoins < preset}
                    onClick={() => setWithdrawCoins(preset)}
                    className="min-h-[36px] px-3 py-1 rounded-lg border border-white/10 bg-[#09090B] hover:border-amber-400/50 disabled:opacity-40 text-xs font-medium text-zinc-200 tabular-nums"
                  >
                    {preset.toLocaleString()} Coins ({formatRupees(calculateRupeesFromCoins(preset))})
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="wd-coins" className="block text-xs text-zinc-300 mb-1">
                    Coins to Withdraw (Min 1,000)
                  </label>
                  <input
                    id="wd-coins"
                    type="number"
                    min={MIN_WITHDRAWAL_COINS}
                    max={Math.max(MIN_WITHDRAWAL_COINS, userCoins)}
                    step={1}
                    required
                    value={withdrawCoins}
                    onChange={(e) => setWithdrawCoins(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm font-mono-tabular text-white"
                  />
                </div>
                <div>
                  <label htmlFor="wd-method" className="block text-xs text-zinc-300 mb-1">
                    Payout Method
                  </label>
                  <select
                    id="wd-method"
                    value={withdrawMethod}
                    onChange={(e) => setWithdrawMethod(e.target.value as WithdrawalMethod)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
                  >
                    <option value="upi">UPI ID (PhonePe / GPay / Paytm)</option>
                    <option value="bank">Bank Transfer (Account + IFSC)</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="wd-dest" className="block text-xs text-zinc-300 mb-1">
                  {withdrawMethod === 'upi' ? 'UPI ID' : 'Bank Account Number & IFSC Code'}
                </label>
                <input
                  id="wd-dest"
                  type="text"
                  required
                  value={withdrawDest}
                  onChange={(e) => setWithdrawDest(e.target.value)}
                  placeholder={
                    withdrawMethod === 'upi' ? 'e.g. playername@okaxis' : 'e.g. 123456789012 · SBIN0001234'
                  }
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
                />
              </div>

              <div className="rounded-lg bg-[#09090B] border border-white/10 px-4 py-3 flex items-center justify-between text-xs tabular-nums">
                <span className="text-zinc-400">Estimated Payout</span>
                <span className="text-base font-bold text-emerald-400 inline-flex items-center gap-1">
                  <IndianRupee className="w-4 h-4" />
                  {formatRupees(previewPayout).replace('₹', '')}
                </span>
              </div>

              {withdrawError && (
                <p role="alert" className="text-xs text-[#F43F5E] font-medium">
                  {withdrawError}
                </p>
              )}

              <button
                type="submit"
                disabled={submittingWithdraw || userCoins < MIN_WITHDRAWAL_COINS || profile.suspended}
                className="w-full min-h-[46px] rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] disabled:opacity-45 disabled:cursor-not-allowed text-xs font-semibold text-white transition-colors"
              >
                {submittingWithdraw
                  ? 'Submitting Request...'
                  : userCoins < MIN_WITHDRAWAL_COINS
                    ? `Need ${MIN_WITHDRAWAL_COINS.toLocaleString()} Coins (₹10) to Withdraw`
                    : `Request ${formatRupees(previewPayout)} Withdrawal`}
              </button>
            </form>

            {/* Withdrawal History */}
            <div className="lg:col-span-6 rounded-xl border border-white/10 bg-[#121216] p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-2xl font-bold text-white">
                    Withdrawal History ({withdrawals.length})
                  </h2>
                  <p className="text-[11px] text-zinc-400">1,000 Coins = ₹10 · Click any request or open modal for full details</p>
                </div>
                <button
                  type="button"
                  onClick={() => openHistoryModal('all')}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-white/15 bg-[#09090B] hover:border-[#E11D48]/60 text-xs font-semibold text-white inline-flex items-center gap-1.5 shrink-0"
                >
                  <History className="w-3.5 h-3.5 text-amber-400" />
                  View Detailed History
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
                <button
                  type="button"
                  onClick={() => openHistoryModal('pending')}
                  className="rounded-lg border border-amber-500/20 bg-[#09090B] hover:border-amber-500/50 p-2.5 text-left transition-colors"
                >
                  <p className="text-[11px] text-zinc-400">Pending</p>
                  <p className="text-base font-bold text-amber-300 mt-0.5">
                    {withdrawalSummary.pendingCount}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => openHistoryModal('processed')}
                  className="rounded-lg border border-emerald-500/20 bg-[#09090B] hover:border-emerald-500/50 p-2.5 text-left transition-colors"
                >
                  <p className="text-[11px] text-zinc-400">Processed</p>
                  <p className="text-base font-bold text-emerald-300 mt-0.5">
                    {withdrawalSummary.processedCount}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => openHistoryModal('rejected')}
                  className="rounded-lg border border-[#E11D48]/25 bg-[#09090B] hover:border-[#E11D48]/60 p-2.5 text-left transition-colors"
                >
                  <p className="text-[11px] text-zinc-400">Rejected</p>
                  <p className="text-base font-bold text-[#FB7185] mt-0.5">
                    {withdrawalSummary.rejectedCount}
                  </p>
                </button>
              </div>

              {withdrawals.length === 0 ? (
                <div className="rounded-lg bg-[#09090B] border border-white/10 p-6 text-center text-xs text-zinc-400 space-y-3">
                  <p>
                    No withdrawals requested yet. Play matches and earn verified kills/wins to accumulate Spider Coins.
                  </p>
                  <button
                    type="button"
                    onClick={() => openHistoryModal('all')}
                    className="min-h-[36px] px-3.5 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-xs font-semibold text-zinc-200"
                  >
                    Open History Modal
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="divide-y divide-white/10">
                    {withdrawals.slice(0, 4).map((wd) => {
                      const meta = getWithdrawalStatusMeta(wd);
                      return (
                        <div key={wd.id} className="py-3 first:pt-0 last:pb-0 space-y-1 text-xs">
                          <div className="flex items-center justify-between gap-2 tabular-nums">
                            <button
                              type="button"
                              onClick={() => openHistoryModal(meta.bucket)}
                              className="text-sm font-semibold text-white hover:text-[#F43F5E] text-left transition-colors"
                            >
                              {formatRupees(wd.rupees)} · {wd.coins.toLocaleString()} Coins
                            </button>
                            <span
                              className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${meta.badgeClass}`}
                            >
                              {meta.label}
                            </span>
                          </div>
                          <p className="text-zinc-400">
                            {wd.method.toUpperCase()} · {wd.destination} · {new Date(wd.createdAt).toLocaleDateString()}
                          </p>
                          {wd.adminNote && (
                            <p className="text-zinc-300 bg-[#09090B] rounded px-2.5 py-1.5 border border-white/5">
                              Admin Note: {wd.adminNote}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {withdrawals.length > 4 && (
                    <button
                      type="button"
                      onClick={() => openHistoryModal('all')}
                      className="w-full min-h-[38px] rounded-lg border border-white/10 bg-[#09090B] hover:border-white/20 text-xs font-semibold text-zinc-200"
                    >
                      View All {withdrawals.length} Redemption Requests
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Owner-Only Admin App Password Setup (never rendered for non-owners) */}
          {showOwnerPasswordSetup && (
            <section className="rounded-xl border border-[#E11D48]/40 bg-[#121216] p-6 space-y-4">
              <div className="space-y-1">
                <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-[#E11D48]" />
                  Owner App Password Required for Admin Console
                </h2>
                <p className="text-xs text-zinc-400">
                  Admin access is restricted to Email &amp; Password sign-in for {userEmail}. Set or update your app password here, then sign out and sign back in using your Email &amp; Password.
                </p>
              </div>
              <form onSubmit={handleSetAppPassword} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label htmlFor="owner-app-pass" className="block text-xs text-zinc-300 mb-1">
                    New App Password
                  </label>
                  <input
                    id="owner-app-pass"
                    type="password"
                    required
                    minLength={8}
                    value={appPassword}
                    onChange={(e) => setAppPassword(e.target.value)}
                    placeholder="8+ chars, letter + number"
                    className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
                  />
                </div>
                <div>
                  <label htmlFor="owner-app-pass-confirm" className="block text-xs text-zinc-300 mb-1">
                    Confirm Password
                  </label>
                  <input
                    id="owner-app-pass-confirm"
                    type="password"
                    required
                    minLength={8}
                    value={appPasswordConfirm}
                    onChange={(e) => setAppPasswordConfirm(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="min-h-[44px] px-4 py-2 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white"
                >
                  {savingPassword ? 'Saving...' : 'Save App Password'}
                </button>
              </form>
              {passwordError && (
                <p role="alert" className="text-xs text-[#F43F5E]">
                  {passwordError}
                </p>
              )}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    void logoutUser().then(() => onOpenAuth());
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-lg border border-white/15 hover:bg-white/5 text-xs font-semibold text-white"
                >
                  Sign Out &amp; Login with Email + Password
                </button>
              </div>
            </section>
          )}

          {/* Milestone Cosmetic Customization */}
          <section className="rounded-xl border border-white/10 bg-[#121216] p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
                <Palette className="w-5 h-5 text-[#E11D48]" />
                Profile Cosmetics
              </h2>
              <span className="text-xs text-zinc-400">
                Non-cash themes &amp; emblems via Free Fire milestones or optional Rewarded Ad
              </span>
            </div>
            {rewardAdError && (
              <p role="alert" className="text-xs text-[#F43F5E] bg-[#09090B] border border-[#E11D48]/30 rounded-lg px-3 py-2">
                {rewardAdError}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {COSMETIC_CATALOG.map((item) => {
                const unlocked = isCosmeticUnlocked(item, profile);
                const equipped =
                  (item.type === 'theme' && profile.activeTheme === item.themeId) ||
                  (item.type === 'badge' && profile.activeBadge === item.id);
                const isRewardedAdItem = Boolean(item.rewardedAdUnlock);
                const rewardedDisabled = adminSettings.rewardedAdsEnabled === false;
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-white/10 bg-[#09090B] p-4 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">{item.name}</span>
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/20"
                          style={{ backgroundColor: item.previewColor }}
                        />
                      </div>
                      <p className="text-xs text-zinc-400">{item.description}</p>
                    </div>
                    {isRewardedAdItem && !unlocked ? (
                      <button
                        type="button"
                        disabled={rewardedDisabled || watchingRewardAd}
                        onClick={() => void handleWatchRewardedAd(item.id)}
                        className={`min-h-[40px] w-full rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
                          rewardedDisabled
                            ? 'bg-zinc-900 text-zinc-500 border border-white/5 cursor-not-allowed'
                            : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5" />
                        {watchingRewardAd
                          ? 'Loading Ad...'
                          : rewardedDisabled
                            ? 'Rewarded Ads Paused'
                            : 'Watch Ad to Unlock (0 Coins)'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={equipped || !unlocked}
                        onClick={() => handleEquipCosmetic(item.id)}
                        className={`min-h-[40px] w-full rounded-lg text-xs font-semibold transition-colors ${
                          equipped
                            ? 'bg-zinc-800 text-emerald-400 cursor-default'
                            : unlocked
                              ? 'bg-[#E11D48] hover:bg-[#F43F5E] text-white'
                              : 'bg-zinc-900 text-zinc-500 border border-white/5 cursor-not-allowed'
                        }`}
                      >
                        {equipped ? 'Equipped' : unlocked ? 'Equip' : 'Locked Milestone'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Achievements + Tournament History */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-white/10 bg-[#121216] p-6 space-y-4">
              <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-[#E11D48]" />
                Achievements
              </h2>
              <div className="divide-y divide-white/10">
                {ACHIEVEMENTS_CATALOG.map((ach) => {
                  const unlocked =
                    profile.achievements?.includes(ach.id) ||
                    (profile[ach.metric] ?? 0) >= ach.threshold;
                  return (
                    <div key={ach.id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{ach.title}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">{ach.description}</p>
                      </div>
                      <span
                        className={`text-xs font-semibold shrink-0 inline-flex items-center gap-1 ${
                          unlocked ? 'text-emerald-400' : 'text-zinc-500'
                        }`}
                      >
                        {unlocked ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Unlocked
                          </>
                        ) : (
                          'Locked'
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#121216] p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-[#E11D48]" />
                  My Matches &amp; Results ({playedMatches.length})
                </h2>
                <button
                  type="button"
                  onClick={onNavigateResults}
                  className="text-xs font-semibold text-[#F43F5E] hover:text-white inline-flex items-center gap-1 shrink-0"
                >
                  <Trophy className="w-3.5 h-3.5" />
                  All Results
                </button>
              </div>
              {playedMatches.length === 0 ? (
                <p className="text-xs text-zinc-400">
                  You have not joined any community tournaments yet. Join an upcoming match to see your slot and verified results here.
                </p>
              ) : (
                <div className="divide-y divide-white/10">
                  {playedMatches.map((entry) => {
                    const t = entry.tournament;
                    const res = entry.result;
                    const standing = entry.playerStanding;
                    const badgeClass =
                      entry.statusCategory === 'published'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : entry.statusCategory === 'review'
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : entry.statusCategory === 'live'
                            ? 'bg-[#E11D48]/15 text-[#F43F5E] border-[#E11D48]/30'
                            : entry.statusCategory === 'cancelled'
                              ? 'bg-zinc-800 text-zinc-400 border-white/10'
                              : 'bg-white/5 text-zinc-300 border-white/10';
                    return (
                      <div key={entry.registration.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2 text-xs">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                              {t?.title || res?.tournamentTitle || entry.registration.tournamentId}
                            </p>
                            <p className="text-zinc-400 mt-0.5">
                              Slot #{entry.registration.slotNumber} · {t?.mode || 'Match'} · {t?.matchDate || ''}
                            </p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded border text-[11px] font-semibold shrink-0 ${badgeClass}`}
                          >
                            {entry.statusLabel}
                          </span>
                        </div>

                        {res ? (
                          <div className="rounded-lg bg-[#09090B] border border-white/10 p-2.5 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-zinc-300">
                              <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span>
                                Winner: <strong className="text-white">{res.winnerName}</strong>
                              </span>
                            </div>
                            {standing ? (
                              <span className="font-semibold text-amber-300 font-mono-tabular">
                                Your Rank #{standing.rank} · {standing.kills} Kills · +{(standing.coinsAwarded ?? 0).toLocaleString()} Coins
                              </span>
                            ) : (
                              <span className="text-zinc-400 font-mono-tabular">
                                {res.totalKills} Verified Kills
                              </span>
                            )}
                          </div>
                        ) : entry.statusCategory === 'review' ? (
                          <p className="text-[11px] text-amber-300">
                            Match finished — results are under Admin review and will appear here once published.
                          </p>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-3">
                          {t && onSelectTournament && (
                            <button
                              type="button"
                              onClick={() => onSelectTournament(t)}
                              className="text-[11px] font-semibold text-zinc-300 hover:text-white underline underline-offset-2"
                            >
                              Open Match Details
                            </button>
                          )}
                          {res && (
                            <button
                              type="button"
                              onClick={onNavigateResults}
                              className="text-[11px] font-semibold text-[#F43F5E] hover:text-white underline underline-offset-2"
                            >
                              View Full Standings
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Account Deletion */}
          <section className="rounded-xl border border-white/10 bg-[#121216] p-6 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#F43F5E]" />
                  Account Deletion &amp; Data Removal
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Permanently remove your SPIDER ESPORTS profile, private email record, username reservation, and Firebase Auth account.
                </p>
              </div>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-[#E11D48]/50 text-xs font-semibold text-[#F43F5E] hover:bg-[#E11D48]/10 shrink-0 inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Account
                </button>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-white/10 text-xs text-zinc-300"
                  >
                    Keep Account
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleDeleteAccount}
                    className="min-h-[40px] px-4 py-1.5 rounded-lg bg-[#E11D48] text-xs font-semibold text-white"
                  >
                    {saving ? 'Deleting...' : 'Confirm Permanent Delete'}
                  </button>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* Play Store Compliance, Policies & Disclaimer */}
      <section className="rounded-xl border border-white/10 bg-[#121216] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#E11D48]" />
            Legal, Data Safety &amp; Platform Rules
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setLegalDoc(legalDoc === 'privacy' ? null : 'privacy')}
              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-white/10 text-xs text-zinc-300 hover:text-white"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => setLegalDoc(legalDoc === 'terms' ? null : 'terms')}
              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-white/10 text-xs text-zinc-300 hover:text-white"
            >
              Terms &amp; Conditions
            </button>
            <button
              type="button"
              onClick={() => setLegalDoc(legalDoc === 'playstore' ? null : 'playstore')}
              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-white/10 text-xs text-zinc-300 hover:text-white"
            >
              Reward &amp; Withdrawal Policy
            </button>
            <button
              type="button"
              data-testid="open-gdpr-consent-btn"
              onClick={() => setConsentModalOpen(true)}
              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#E11D48]/35 bg-[#E11D48]/10 text-xs font-medium text-white hover:bg-[#E11D48]/20 inline-flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#E11D48]" />
              Ad Privacy &amp; GDPR Consent ({getAdConsentSummary(consentAccepted).shortLabel})
            </button>
          </div>
        </div>

        {legalDoc === 'privacy' && (
          <div className="rounded-lg bg-[#09090B] border border-white/10 p-4 text-xs text-zinc-300 space-y-2 leading-relaxed">
            <p className="font-semibold text-white">SPIDER ESPORTS Privacy Policy</p>
            <p>
              We collect only your email address (isolated in private Firestore storage), unique username, and Free Fire IGN/UID to verify identity and manage free tournament brackets. Google AdMob and Google User Messaging Platform (UMP) serve policy-compliant ads and honor your consent choices. Rewarded ads only unlock non-cash profile emblems (never coins or cash). You may delete your account and personal records permanently at any time.
            </p>
          </div>
        )}

        {legalDoc === 'terms' && (
          <div className="rounded-lg bg-[#09090B] border border-white/10 p-4 text-xs text-zinc-300 space-y-2 leading-relaxed">
            <p className="font-semibold text-white">Terms &amp; Conditions</p>
            <p>
              SPIDER ESPORTS hosts strictly free-to-play community tournaments with zero entry fees, zero deposits, and zero paid participation. Players earn Spider Coins exclusively through verified gameplay (playing, kills, and wins) credited by administrators, redeemable at 1,000 Spider Coins = ₹10.
            </p>
          </div>
        )}

        {legalDoc === 'playstore' && (
          <div className="rounded-lg bg-[#09090B] border border-white/10 p-4 text-xs text-zinc-300 space-y-2 leading-relaxed">
            <p className="font-semibold text-white">Spider Coin Reward &amp; Withdrawal Rules</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Single Currency: Spider Coins are the only redeemable reward unit in SPIDER ESPORTS.</li>
              <li>Earning Rules: Coins are credited strictly by admins for verified match play, eliminations, and tournament wins.</li>
              <li>Ad Policy: Rewarded ads never grant Spider Coins, cash, prizes, or tournament entry — only optional non-cash profile emblems.</li>
              <li>Conversion Rate: 1,000 Spider Coins = ₹10 (minimum withdrawal: 1,000 Coins).</li>
              <li>Verification: Admins verify match results and withdrawal payout details (UPI / Bank) before approval.</li>
            </ul>
          </div>
        )}

        <p className="text-xs text-zinc-400 border-t border-white/10 pt-3">
          SPIDER ESPORTS is an independent community tournament platform. It is not affiliated with, endorsed by, or sponsored by Garena or Free Fire.
        </p>
      </section>

      <AdMobBannerSlot
        settings={adminSettings}
        screen="profile"
        placementLabel="Profile Footer"
        consentAccepted={consentAccepted}
        onAcceptConsent={() => onUpdateConsent?.(true)}
      />

      <WithdrawalHistoryModal
        open={historyModalOpen}
        withdrawals={withdrawals}
        availableCoins={userCoins}
        initialFilter={historyFilter}
        onClose={() => setHistoryModalOpen(false)}
        onToast={onToast}
      />

      <ConsentManagementModal
        open={consentModalOpen}
        consentAccepted={consentAccepted}
        onUpdateConsent={(next) => onUpdateConsent?.(next)}
        onClose={() => setConsentModalOpen(false)}
        onToast={onToast}
      />
    </div>
  );
}
