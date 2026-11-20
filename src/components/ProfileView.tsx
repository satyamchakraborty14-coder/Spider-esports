import { useState } from 'react';
import {
  ArrowDownCircle,
  Award,
  Bell,
  Check,
  CheckCircle2,
  Coins,
  Copy,
  Crown,
  ExternalLink,
  FileText,
  History,
  IndianRupee,
  KeyRound,
  LogOut,
  MessageCircle,
  Palette,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Trophy,
  Upload,
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
  updatePlayerIdentity,
  verifyAndAddCoinsFromQrPayment,
} from '../lib/firestoreService';
import { BRAND_ASSETS, resolveBundledAssetUrl } from '../lib/seedData';
import type {
  AdminSettings,
  CoinDeposit,
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
  COINS_PER_RUPEE,
  COSMETIC_CATALOG,
  formatRupees,
  getNonRedeemableCoins,
  getPlayerLeaderboardRank,
  getRedeemableWinningCoins,
  isCosmeticUnlocked,
  MIN_WITHDRAWAL_COINS,
  MIN_WITHDRAWAL_RUPEES,
  RUPEES_PER_COIN,
  validateWithdrawalRequest,
} from '../utils/coinSystem';
import {
  ADD_COIN_PRESETS,
  MAX_ADD_COIN_RUPEES,
  MIN_ADD_COIN_RUPEES,
} from '../utils/coinDepositVerification';
import {
  ALLOWED_IMAGE_INPUT_ACCEPT,
  compressImageFileToDataUrl,
} from '../utils/imageUpload';
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
import { getTelegramSupportInfo } from '../utils/supportConfig';
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
  deposits?: CoinDeposit[];
  tournaments: Tournament[];
  results: TournamentResult[];
  leaderboard: LeaderboardEntry[];
  adminSettings: AdminSettings;
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
  deposits = [],
  tournaments,
  results,
  leaderboard,
  adminSettings,
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

  // Wallet Tab ('withdraw' | 'add')
  const [walletTab, setWalletTab] = useState<'withdraw' | 'add'>('withdraw');

  // Add Coins via QR State
  const [depositRupees, setDepositRupees] = useState<number>(100);
  const [depositUtr, setDepositUtr] = useState('');
  const [depositPayerUpi, setDepositPayerUpi] = useState('');
  const [depositScreenshotUrl, setDepositScreenshotUrl] = useState('');
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositSuccess, setDepositSuccess] = useState<string | null>(null);
  const [submittingDeposit, setSubmittingDeposit] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);

  // Withdrawal Form & History Modal State
  const [withdrawCoins, setWithdrawCoins] = useState<number>(MIN_WITHDRAWAL_COINS);
  const [withdrawMethod, setWithdrawMethod] = useState<WithdrawalMethod>('upi');
  const [withdrawDest, setWithdrawDest] = useState('');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [submittingWithdraw, setSubmittingWithdraw] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<WithdrawalFilterStatus>('all');

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
  const winningCoins = getRedeemableWinningCoins(profile);
  const addedNonRedeemableCoins = getNonRedeemableCoins(profile);
  const winningRupees = calculateRupeesFromCoins(winningCoins);
  const thresholdPercent = Math.min(100, Math.round((winningCoins / MIN_WITHDRAWAL_COINS) * 100));
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

  const hasPaymentQrConfigured = Boolean(adminSettings.paymentQrDataUrl?.trim());

  const handleDepositScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setDepositError(null);
    setUploadingScreenshot(true);
    try {
      const result = await compressImageFileToDataUrl(file);
      setDepositScreenshotUrl(result.dataUrl);
      onToast(`Payment receipt attached (~${result.approxKb} KB).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to attach payment screenshot.';
      setDepositError(msg);
      onToast(msg);
    } finally {
      setUploadingScreenshot(false);
    }
  };

  const handleCopyAdminUpi = () => {
    const upi = adminSettings.paymentUpiId?.trim();
    if (!upi) return;
    void navigator.clipboard?.writeText(upi).then(() => {
      setCopiedUpi(true);
      onToast(`Copied UPI ID: ${upi}`);
      window.setTimeout(() => setCopiedUpi(false), 2000);
    });
  };

  const handleSubmitDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setDepositError(null);
    setDepositSuccess(null);

    if (!isEmailVerified) {
      setDepositError('Please verify your email address before adding Spider Coins.');
      return;
    }

    setSubmittingDeposit(true);
    try {
      const res = await verifyAndAddCoinsFromQrPayment({
        profile,
        amountRupees: Math.floor(Number(depositRupees)),
        utr: depositUtr,
        payerUpi: depositPayerUpi,
        screenshotUrl: depositScreenshotUrl,
        hasPaymentQrConfigured,
      });
      setDepositUtr('');
      setDepositPayerUpi('');
      setDepositScreenshotUrl('');
      setDepositRupees(100);
      const msg = `Verified UTR ${res.utr}! +${res.coinsAdded.toLocaleString()} Spider Coins added to your wallet (Balance: ${res.nextBalance.toLocaleString()}).`;
      setDepositSuccess(msg);
      onToast(msg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to verify payment & add coins.';
      setDepositError(msg);
      onToast(msg);
    } finally {
      setSubmittingDeposit(false);
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
      availableWinningCoins: winningCoins,
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
            Register with your unique username and Free Fire UID to join community tournaments, win Spider Coins (1 Coin = ₹1, only winning prizes redeemable, Min ₹50), and climb the global ladder.
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
                  src={resolveBundledAssetUrl(profile.avatarUrl, BRAND_ASSETS.defaultAvatar)}
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

            {/* Winning Prize Progress to Minimum Withdrawal */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between text-xs tabular-nums flex-wrap gap-2">
                <span className="font-semibold text-white inline-flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-400" />
                  Winning Prize: {winningCoins.toLocaleString()} Coins ({formatRupees(winningRupees)})
                  {addedNonRedeemableCoins > 0 && (
                    <span className="text-zinc-400 font-normal">
                      · Added (Non-Redeemable): {addedNonRedeemableCoins.toLocaleString()}
                    </span>
                  )}
                </span>
                <span className="text-zinc-400">
                  {winningCoins >= MIN_WITHDRAWAL_COINS
                    ? `Winning prize withdrawal unlocked · ${COINS_PER_RUPEE} Coin = ₹${RUPEES_PER_COIN}`
                    : `${(MIN_WITHDRAWAL_COINS - winningCoins).toLocaleString()} more winning prize coins to unlock ₹${MIN_WITHDRAWAL_RUPEES} withdrawal`}
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
                <p className="text-zinc-400">Winning / Total Coins</p>
                <p className="text-xl font-bold text-amber-400 mt-0.5">
                  {winningCoins.toLocaleString()}{' '}
                  <span className="text-xs font-medium text-zinc-400">
                    / {userCoins.toLocaleString()}
                  </span>
                </p>
              </div>
            </div>
          </section>

          {/* Spider Coin Wallet: Withdraw Coins (Min ₹50) & Add Coins via QR (1 Coin = ₹1) */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 rounded-xl border border-white/10 bg-[#121216] p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                  role="tablist"
                  aria-label="Wallet actions"
                  className="inline-flex rounded-lg border border-white/10 bg-[#09090B] p-1 gap-1"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={walletTab === 'withdraw'}
                    onClick={() => setWalletTab('withdraw')}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                      walletTab === 'withdraw'
                        ? 'bg-[#E11D48] text-white'
                        : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    Withdraw Coins
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={walletTab === 'add'}
                    onClick={() => setWalletTab('add')}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                      walletTab === 'add'
                        ? 'bg-[#E11D48] text-white'
                        : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    Add Coins (QR)
                  </button>
                </div>

                <div className="text-right tabular-nums">
                  <p className="text-[11px] text-zinc-400">Redeemable Winning Prize</p>
                  <p className="text-base font-bold text-amber-400">
                    {winningCoins.toLocaleString()} Coins ({formatRupees(winningRupees)})
                  </p>
                  {addedNonRedeemableCoins > 0 && (
                    <p className="text-[11px] text-zinc-400">
                      Total Wallet: {userCoins.toLocaleString()} ({addedNonRedeemableCoins.toLocaleString()} added)
                    </p>
                  )}
                </div>
              </div>

              {walletTab === 'withdraw' ? (
                <form onSubmit={handleSubmitWithdrawal} className="space-y-4">
                  <div>
                    <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
                      <Wallet className="w-5 h-5 text-amber-400" />
                      Withdraw Winning Prize
                    </h2>
                    <p className="text-xs text-zinc-400 mt-1">
                      <strong className="text-white">Only Winning Prize Coins</strong> earned from matches can be redeemed · Rate: <strong className="text-white">1 Coin = ₹1</strong> · Min:{' '}
                      <strong className="text-white">{MIN_WITHDRAWAL_COINS} Winning Coins (₹{MIN_WITHDRAWAL_RUPEES})</strong>.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[50, 100, 250, 500].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        disabled={winningCoins < preset}
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
                        Winning Coins to Withdraw (Min {MIN_WITHDRAWAL_COINS})
                      </label>
                      <input
                        id="wd-coins"
                        type="number"
                        min={MIN_WITHDRAWAL_COINS}
                        max={Math.max(MIN_WITHDRAWAL_COINS, winningCoins)}
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
                    disabled={submittingWithdraw || winningCoins < MIN_WITHDRAWAL_COINS || profile.suspended}
                    className="w-full min-h-[46px] rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] disabled:opacity-45 disabled:cursor-not-allowed text-xs font-semibold text-white transition-colors"
                  >
                    {submittingWithdraw
                      ? 'Processing Request...'
                      : winningCoins < MIN_WITHDRAWAL_COINS
                        ? `Need ${MIN_WITHDRAWAL_COINS.toLocaleString()} Winning Coins (₹${MIN_WITHDRAWAL_RUPEES}) to Withdraw`
                        : `Redeem ${formatRupees(previewPayout)} Winning Prize`}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSubmitDeposit} className="space-y-4">
                  <div>
                    <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
                      <QrCode className="w-5 h-5 text-emerald-400" />
                      Add Coins via UPI QR
                    </h2>
                    <p className="text-xs text-zinc-400 mt-1">
                      Pay via any UPI app using the official QR code below, then submit your <strong className="text-white">12-digit UTR number</strong> for instant inside verification (<strong className="text-white">₹1 = 1 Coin</strong>). Added coins are non-redeemable; only winning prizes can be withdrawn.
                    </p>
                  </div>

                  {hasPaymentQrConfigured ? (
                    <div className="rounded-xl border border-white/10 bg-[#09090B] p-4 flex flex-col sm:flex-row items-center gap-4">
                      <div className="bg-white p-2.5 rounded-xl shrink-0 border border-white/20">
                        <img
                          src={adminSettings.paymentQrDataUrl}
                          alt="SPIDER ESPORTS Payment QR Code"
                          className="w-36 h-36 object-contain"
                        />
                      </div>
                      <div className="space-y-2 text-xs min-w-0 flex-1 text-center sm:text-left">
                        <p className="font-semibold text-white">
                          {adminSettings.paymentReceiverName?.trim() || 'SPIDER ESPORTS Official Pay'}
                        </p>
                        {adminSettings.paymentUpiId?.trim() && (
                          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                            <code className="px-2.5 py-1 rounded bg-[#121216] border border-white/10 text-emerald-300 font-mono-tabular break-all">
                              {adminSettings.paymentUpiId.trim()}
                            </code>
                            <button
                              type="button"
                              onClick={handleCopyAdminUpi}
                              className="min-h-[30px] px-2.5 py-1 rounded border border-white/15 bg-zinc-800 hover:bg-zinc-700 text-[11px] font-semibold text-white inline-flex items-center gap-1"
                            >
                              {copiedUpi ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" /> Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" /> Copy UPI
                                </>
                              )}
                            </button>
                          </div>
                        )}
                        <p className="text-[11px] text-zinc-400 leading-relaxed">
                          Scan this QR in PhonePe, Google Pay, Paytm, or BHIM. Copy the 12-digit UTR / Ref No. from your payment receipt and verify below.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-amber-500/35 bg-amber-950/20 p-4 text-xs text-amber-200 space-y-1">
                      <p className="font-semibold">Payment QR Not Configured Yet</p>
                      <p className="text-amber-100/80">
                        The administrator has not uploaded a Payment QR code yet. Check back shortly once the QR is uploaded in the Admin Console.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {ADD_COIN_PRESETS.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setDepositRupees(amt)}
                        className={`min-h-[34px] px-3 py-1 rounded-lg border text-xs font-medium tabular-nums transition-colors ${
                          depositRupees === amt
                            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                            : 'border-white/10 bg-[#09090B] text-zinc-200 hover:border-white/25'
                        }`}
                      >
                        ₹{amt} (+{amt} Coins)
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="dep-amount" className="block text-xs text-zinc-300 mb-1">
                        Paid Amount in ₹ (Min ₹{MIN_ADD_COIN_RUPEES})
                      </label>
                      <input
                        id="dep-amount"
                        type="number"
                        min={MIN_ADD_COIN_RUPEES}
                        max={MAX_ADD_COIN_RUPEES}
                        step={1}
                        required
                        value={depositRupees}
                        onChange={(e) => setDepositRupees(Number(e.target.value))}
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm font-mono-tabular text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="dep-utr" className="block text-xs text-zinc-300 mb-1">
                        12-Digit UPI UTR / Ref Number
                      </label>
                      <input
                        id="dep-utr"
                        type="text"
                        inputMode="numeric"
                        maxLength={14}
                        required
                        value={depositUtr}
                        onChange={(e) => setDepositUtr(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
                        placeholder="e.g. 431982745102"
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm font-mono-tabular text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="dep-upi" className="block text-xs text-zinc-300 mb-1">
                        Your UPI ID (Optional)
                      </label>
                      <input
                        id="dep-upi"
                        type="text"
                        value={depositPayerUpi}
                        onChange={(e) => setDepositPayerUpi(e.target.value)}
                        placeholder="e.g. you@okaxis"
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#09090B] text-xs text-white"
                      />
                    </div>
                    <div>
                      <span className="block text-xs text-zinc-300 mb-1">
                        Payment Screenshot (Optional)
                      </span>
                      <label
                        htmlFor="dep-screenshot"
                        className={`min-h-[44px] w-full px-3 py-2 rounded-lg border border-dashed border-white/20 bg-[#09090B] hover:border-emerald-400/60 text-xs font-medium text-zinc-200 flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                          uploadingScreenshot ? 'opacity-60 pointer-events-none' : ''
                        }`}
                      >
                        <Upload className="w-3.5 h-3.5 text-emerald-400" />
                        {uploadingScreenshot
                          ? 'Uploading...'
                          : depositScreenshotUrl
                            ? 'Receipt Attached ✓'
                            : 'Choose Receipt'}
                      </label>
                      <input
                        id="dep-screenshot"
                        type="file"
                        accept={ALLOWED_IMAGE_INPUT_ACCEPT}
                        disabled={uploadingScreenshot}
                        onChange={(e) => void handleDepositScreenshotUpload(e)}
                        className="sr-only"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg bg-[#09090B] border border-white/10 px-4 py-3 flex items-center justify-between text-xs tabular-nums">
                    <span className="text-zinc-400">Inside Verification Credit</span>
                    <span className="text-base font-bold text-amber-400 inline-flex items-center gap-1">
                      <Coins className="w-4 h-4" />
                      +{Number.isFinite(depositRupees) && depositRupees > 0 ? Math.floor(depositRupees).toLocaleString() : 0} Coins
                    </span>
                  </div>

                  {depositError && (
                    <p role="alert" className="text-xs text-[#F43F5E] font-medium">
                      {depositError}
                    </p>
                  )}
                  {depositSuccess && (
                    <p role="status" className="text-xs text-emerald-400 font-medium">
                      {depositSuccess}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submittingDeposit || !hasPaymentQrConfigured || profile.suspended}
                    className="w-full min-h-[46px] rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 disabled:cursor-not-allowed text-xs font-semibold text-white transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <ArrowDownCircle className="w-4 h-4" />
                    {submittingDeposit
                      ? 'Verifying UTR & Crediting Wallet...'
                      : `Verify & Auto-Add ${Number.isFinite(depositRupees) && depositRupees > 0 ? Math.floor(depositRupees).toLocaleString() : 0} Coins`}
                  </button>
                </form>
              )}
            </div>

            {/* Right Column: Recent QR Deposits (on Add tab) + Withdrawal History */}
            <div className="lg:col-span-6 rounded-xl border border-white/10 bg-[#121216] p-6 space-y-4">
              {walletTab === 'add' ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-display text-2xl font-bold text-white">
                        QR Add Coin History ({deposits.length})
                      </h2>
                      <p className="text-[11px] text-zinc-400">
                        1 Coin = ₹1 · Single-use UTR inside verification auto-credits your wallet
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWalletTab('withdraw')}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-white/15 bg-[#09090B] hover:border-[#E11D48]/60 text-xs font-semibold text-white shrink-0"
                    >
                      View Withdrawals ({withdrawals.length})
                    </button>
                  </div>

                  {deposits.length === 0 ? (
                    <div className="rounded-lg bg-[#09090B] border border-white/10 p-6 text-center text-xs text-zinc-400">
                      No QR coin deposits yet. Scan the QR code, enter your 12-digit UTR, and verify to auto-add coins.
                    </div>
                  ) : (
                    <div className="divide-y divide-white/10">
                      {deposits.slice(0, 6).map((dep) => (
                        <div key={dep.id} className="py-3 first:pt-0 last:pb-0 space-y-1 text-xs">
                          <div className="flex items-center justify-between gap-2 tabular-nums">
                            <span className="text-sm font-semibold text-white">
                              +{dep.coins.toLocaleString()} Coins ({formatRupees(dep.rupees)})
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${
                                dep.status === 'verified'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : 'bg-[#E11D48]/15 text-[#FB7185] border-[#E11D48]/30'
                              }`}
                            >
                              {dep.status === 'verified' ? 'Auto-Verified' : 'Reversed'}
                            </span>
                          </div>
                          <p className="text-zinc-400 font-mono-tabular">
                            UTR: {dep.utr} · {new Date(dep.createdAt).toLocaleString()}
                          </p>
                          {dep.adminNote && (
                            <p className="text-[#FB7185] bg-[#09090B] rounded px-2.5 py-1.5 border border-white/5">
                              Admin Note: {dep.adminNote}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-display text-2xl font-bold text-white">
                        Withdrawal History ({withdrawals.length})
                      </h2>
                      <p className="text-[11px] text-zinc-400">
                        1 Coin = ₹1 · Min ₹{MIN_WITHDRAWAL_RUPEES} · Click any request for full details
                      </p>
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
                        No withdrawals requested yet. Win matches and eliminations to reach the ₹{MIN_WITHDRAWAL_RUPEES} winning prize withdrawal threshold.
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
                </>
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
                Non-cash themes &amp; emblems unlocked via Free Fire milestones
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {COSMETIC_CATALOG.map((item) => {
                const unlocked = isCosmeticUnlocked(item, profile);
                const equipped =
                  (item.type === 'theme' && profile.activeTheme === item.themeId) ||
                  (item.type === 'badge' && profile.activeBadge === item.id);
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

      {/* Customer Support (24/7 Telegram) */}
      {(() => {
        const supportInfo = getTelegramSupportInfo(adminSettings);
        return (
          <section
            aria-label="Customer Support"
            className="rounded-xl border border-sky-500/30 bg-[#121216] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5 text-sky-400" />
              </div>
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-white">
                  Customer Support Available 24/7 · Telegram
                </h2>
                <p className="text-xs text-zinc-400">
                  {supportInfo.configured
                    ? `Have a problem with a match, room ID, coin deposit, or payout? Message ${supportInfo.displayHandle} directly on Telegram.`
                    : 'Need help with matches, coin deposits, or withdrawals? Reach our Telegram help desk once connected by admin.'}
                </p>
              </div>
            </div>
            {supportInfo.configured ? (
              <a
                href={supportInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-bold text-slate-950 inline-flex items-center justify-center gap-2 shrink-0 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                Customer Support
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : (
              <button
                type="button"
                onClick={() =>
                  onToast(
                    'Telegram support link is being connected by the admin. Please check back shortly.'
                  )
                }
                className="min-h-[44px] px-5 py-2 rounded-lg border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 text-xs font-semibold text-sky-300 inline-flex items-center justify-center gap-2 shrink-0 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                Customer Support
              </button>
            )}
          </section>
        );
      })()}

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
              Wallet &amp; Withdrawal Policy
            </button>
          </div>
        </div>

        {legalDoc === 'privacy' && (
          <div className="rounded-lg bg-[#09090B] border border-white/10 p-4 text-xs text-zinc-300 space-y-2 leading-relaxed">
            <p className="font-semibold text-white">SPIDER ESPORTS Privacy Policy</p>
            <p>
              We collect only your email address (isolated in private Firestore storage), unique username, Free Fire IGN/UID, and optional UPI UTR payment reference data submitted when you add coins or request withdrawals. SPIDER ESPORTS contains zero third-party ad networks or ad trackers. You may delete your account and personal records permanently at any time.
            </p>
          </div>
        )}

        {legalDoc === 'terms' && (
          <div className="rounded-lg bg-[#09090B] border border-white/10 p-4 text-xs text-zinc-300 space-y-2 leading-relaxed">
            <p className="font-semibold text-white">Terms &amp; Conditions</p>
            <p>
              SPIDER ESPORTS hosts competitive Free Fire tournaments with an ad-free experience. Players earn Spider Coins through verified match performance or add coins via the official UPI QR option (1 Coin = ₹1). All UTR submissions undergo inside format, uniqueness, and admin audit checks; fraudulent references are reversed automatically.
            </p>
          </div>
        )}

        {legalDoc === 'playstore' && (
          <div className="rounded-lg bg-[#09090B] border border-white/10 p-4 text-xs text-zinc-300 space-y-2 leading-relaxed">
            <p className="font-semibold text-white">Spider Coin Wallet, QR Add &amp; Winning Prize Withdrawal Rules</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Single Currency: 1 Spider Coin = ₹1 across tournament prizes, QR deposits, and withdrawals.</li>
              <li>Winning Prize Redemption Only: Only Winning Prize Coins earned from verified tournament victories and eliminations can be redeemed (minimum 50 Winning Coins = ₹50) via UPI ID or Bank Transfer.</li>
              <li>Add Coins via QR (Non-Redeemable): Pay using the admin QR code and submit your unique 12-digit UPI UTR for instant inside verification. Added coins cannot be withdrawn directly.</li>
              <li>Audit &amp; Security: Admins audit UTR deposits and verify payout details before approving withdrawals.</li>
            </ul>
          </div>
        )}

        <p className="text-xs text-zinc-400 border-t border-white/10 pt-3">
          SPIDER ESPORTS is an independent community tournament platform. It is not affiliated with, endorsed by, or sponsored by Garena or Free Fire.
        </p>
      </section>

      <WithdrawalHistoryModal
        open={historyModalOpen}
        withdrawals={withdrawals}
        availableCoins={userCoins}
        winningCoins={winningCoins}
        initialFilter={historyFilter}
        onClose={() => setHistoryModalOpen(false)}
        onToast={onToast}
      />
    </div>
  );
}
