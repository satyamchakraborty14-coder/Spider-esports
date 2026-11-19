import { useEffect, useState } from 'react';
import {
  Ban,
  Bell,
  CheckCircle2,
  Coins,
  Database,
  Edit3,
  FileCheck2,
  Image as ImageIcon,
  KeyRound,
  Megaphone,
  Plus,
  Send,
  Settings,
  Shield,
  Trash2,
  Trophy,
  Upload,
  Users,
  Wallet,
} from 'lucide-react';
import type {
  AdBannerPlacement,
  AdminSettings,
  NotificationItem,
  Registration,
  ResultStanding,
  Tournament,
  TournamentCategory,
  TournamentMode,
  TournamentResult,
  TournamentStatus,
  UserProfile,
  WithdrawalRequest,
  WithdrawalStatus,
} from '../types/esports';
import {
  CATEGORIES_WITH_MODES,
  getModeDefinition,
  isStrictSoleAdminSession,
  MAX_TOURNAMENT_SLOTS,
  MIN_TOURNAMENT_SLOTS,
  SOLE_ADMIN_EMAIL,
  validateAdminPassword,
  validateAdminSlotUpdate,
  validateSlotAssignment,
  validateTournamentBannerUrl,
} from '../utils/tournamentRules';
import {
  calculateMatchCoinReward,
  calculateRupeesFromCoins,
  formatRupees,
} from '../utils/coinSystem';
import { validateResultStandings } from '../utils/resultHelpers';
import {
  ADMOB_OFFICIAL_TEST_IDS,
  ADMOB_PRODUCTION_CREDENTIALS,
  buildAppAdsTxtLine,
  DEFAULT_INTERSTITIAL_COOLDOWN_SECONDS,
  MAX_INTERSTITIAL_COOLDOWN_SECONDS,
  MIN_INTERSTITIAL_COOLDOWN_SECONDS,
  validateAdMobAppId,
  validateAdMobUnitId,
  validateAdSenseClientId,
  validateInterstitialCooldownSeconds,
} from '../utils/admobHelpers';
import {
  detectAdMobRuntime,
  getAdMobIntegrationStatus,
  getAdMobRuntimeLabel,
  subscribeAdMobStatus,
  type AdMobIntegrationStatus,
} from '../lib/admobBridge';
import {
  adminAdjustUserCoins,
  adminDeleteMatchResult,
  adminDeleteTournament,
  adminFetchAllUsers,
  adminProcessWithdrawal,
  adminPublishAnnouncement,
  adminPublishMatchResult,
  adminPublishRoomCredentials,
  adminRemoveRegistration,
  adminSaveTournament,
  adminSendNotification,
  adminSubscribeWithdrawals,
  adminToggleUserSuspension,
  adminUpdateRegistrationSlot,
  adminUpdateSettings,
  adminUpdateTournamentBanner,
  adminUpdateTournamentSlots,
  seedFirestoreIfEmpty,
  setOrUpdateAppPassword,
  subscribeTournamentRegistrations,
} from '../lib/firestoreService';
import { BRAND_ASSETS, MATCH_BANNER_PRESETS, resolveBundledAssetUrl } from '../lib/seedData';
import {
  ALLOWED_IMAGE_INPUT_ACCEPT,
  compressImageFileToDataUrl,
  estimateDataUrlSizeKb,
} from '../utils/imageUpload';

interface AdminDashboardProps {
  adminUid: string;
  adminEmail: string | null;
  adminEmailVerified: boolean;
  signInProvider: string | null;
  tournaments: Tournament[];
  results: TournamentResult[];
  adminSettings: AdminSettings;
  onToast: (msg: string) => void;
}

type AdminSection = 'tournaments' | 'rooms' | 'players' | 'withdrawals' | 'app';

export function AdminDashboard({
  adminUid,
  adminEmail,
  adminEmailVerified,
  signInProvider,
  tournaments,
  results,
  adminSettings,
  onToast,
}: AdminDashboardProps) {
  const isSoleOwner = isStrictSoleAdminSession({
    email: adminEmail,
    emailVerified: adminEmailVerified,
    signInProvider,
  });
  const [section, setSection] = useState<AdminSection>('tournaments');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  const [savingAdminPassword, setSavingAdminPassword] = useState(false);

  // Tournament Editor State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TournamentCategory>('Battle Royale');
  const [mode, setMode] = useState<TournamentMode>('Squad');
  const [mapName, setMapName] = useState('Bermuda');
  const [matchDate, setMatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [matchTime, setMatchTime] = useState('20:00');
  const [deadlineLocal, setDeadlineLocal] = useState(
    new Date(Date.now() + 3_600_000 * 3).toISOString().slice(0, 16)
  );
  const [releaseLocal, setReleaseLocal] = useState(
    new Date(Date.now() + 3_600_000 * 3.5).toISOString().slice(0, 16)
  );
  const [maxSlots, setMaxSlots] = useState(12);
  const [filledSlots, setFilledSlots] = useState(0);
  const [bannerUrl, setBannerUrl] = useState(BRAND_ASSETS.battleRoyaleBanner);
  const [coinReward, setCoinReward] = useState(300);
  const [perKillCoins, setPerKillCoins] = useState(10);
  const [status, setStatus] = useState<TournamentStatus>('upcoming');
  const [published, setPublished] = useState(true);
  const [featured, setFeatured] = useState(false);
  const [rulesText, setRulesText] = useState('Free entry community match\nNo emulators allowed');

  // Inline Bracket Slot & Picture Drafts (filledSlots updates automatically via player joins)
  const [slotDrafts, setSlotDrafts] = useState<Record<string, number>>({});
  const [savingSlotId, setSavingSlotId] = useState<string | null>(null);
  const [bannerDrafts, setBannerDrafts] = useState<Record<string, string>>({});
  const [savingBannerId, setSavingBannerId] = useState<string | null>(null);
  const [uploadingFormBanner, setUploadingFormBanner] = useState(false);
  const [formBannerError, setFormBannerError] = useState<string | null>(null);
  const [uploadingInlineBannerId, setUploadingInlineBannerId] = useState<string | null>(null);
  const [regSlotDrafts, setRegSlotDrafts] = useState<Record<string, number>>({});
  const [savingRegSlotId, setSavingRegSlotId] = useState<string | null>(null);

  // Player Coin Adjustment State
  const [coinDrafts, setCoinDrafts] = useState<Record<string, string>>({});
  const [coinReasons, setCoinReasons] = useState<Record<string, string>>({});
  const [savingCoinUid, setSavingCoinUid] = useState<string | null>(null);

  // Withdrawals State
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [withdrawalFilter, setWithdrawalFilter] = useState<'all' | WithdrawalStatus>('all');
  const [withdrawalNotes, setWithdrawalNotes] = useState<Record<string, string>>({});
  const [processingWdId, setProcessingWdId] = useState<string | null>(null);

  // Room & Results State
  const [selectedMatchId, setSelectedMatchId] = useState<string>(tournaments[0]?.id || '');
  const [roomId, setRoomId] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [roomReleaseAt, setRoomReleaseAt] = useState(
    new Date(Date.now() + 600_000).toISOString().slice(0, 16)
  );
  const [standingsDraft, setStandingsDraft] = useState<ResultStanding[]>([
    { rank: 1, playerName: '', kills: 0, coinsAwarded: 100 },
  ]);
  const [participationCoins, setParticipationCoins] = useState(0);
  const [savingResultMode, setSavingResultMode] = useState<'draft' | 'publish' | 'delete' | null>(null);
  const [resultFormError, setResultFormError] = useState<string | null>(null);
  const [matchRegistrations, setMatchRegistrations] = useState<Registration[]>([]);

  // Announcements & Notifications
  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annPriority, setAnnPriority] = useState<'normal' | 'high'>('normal');
  const [notifUserId, setNotifUserId] = useState('all');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [notifType, setNotifType] = useState<NotificationItem['type']>('tournament');

  // AdMob Settings State
  const [adMobMode, setAdMobMode] = useState<'test' | 'production'>(adminSettings.adMobMode);
  const [adMobAppId, setAdMobAppId] = useState(
    adminSettings.adMobAppId || ADMOB_OFFICIAL_TEST_IDS.appId
  );
  const [adSenseClientId, setAdSenseClientId] = useState(adminSettings.adSenseClientId || '');
  const [bannerUnit, setBannerUnit] = useState(adminSettings.bannerAdUnitId);
  const [interstitialUnit, setInterstitialUnit] = useState(adminSettings.interstitialAdUnitId);
  const [rewardedUnit, setRewardedUnit] = useState(adminSettings.rewardedAdUnitId);
  const [bannerAdsEnabled, setBannerAdsEnabled] = useState<boolean>(
    adminSettings.bannerAdsEnabled !== false
  );
  const [interstitialAdsEnabled, setInterstitialAdsEnabled] = useState<boolean>(
    adminSettings.interstitialAdsEnabled !== false
  );
  const [rewardedAdsEnabled, setRewardedAdsEnabled] = useState<boolean>(
    adminSettings.rewardedAdsEnabled !== false
  );
  const [interstitialCooldownSeconds, setInterstitialCooldownSeconds] = useState<number>(
    adminSettings.interstitialCooldownSeconds ?? DEFAULT_INTERSTITIAL_COOLDOWN_SECONDS
  );
  const [bannerPlacement, setBannerPlacement] = useState<AdBannerPlacement>(
    adminSettings.bannerPlacement || 'all_screens'
  );
  const [featuredAnn, setFeaturedAnn] = useState(adminSettings.featuredAnnouncement || '');
  const [adMobError, setAdMobError] = useState<string | null>(null);
  const [copiedAppAdsTxt, setCopiedAppAdsTxt] = useState(false);
  const [adMobStatus, setAdMobStatus] = useState<AdMobIntegrationStatus>(() =>
    getAdMobIntegrationStatus()
  );

  useEffect(() => {
    return subscribeAdMobStatus(setAdMobStatus);
  }, []);

  useEffect(() => {
    setAdMobMode(adminSettings.adMobMode);
    setAdMobAppId(adminSettings.adMobAppId || ADMOB_OFFICIAL_TEST_IDS.appId);
    setAdSenseClientId(adminSettings.adSenseClientId || '');
    setBannerUnit(adminSettings.bannerAdUnitId);
    setInterstitialUnit(adminSettings.interstitialAdUnitId);
    setRewardedUnit(adminSettings.rewardedAdUnitId);
    setBannerAdsEnabled(adminSettings.bannerAdsEnabled !== false);
    setInterstitialAdsEnabled(adminSettings.interstitialAdsEnabled !== false);
    setRewardedAdsEnabled(adminSettings.rewardedAdsEnabled !== false);
    setInterstitialCooldownSeconds(
      adminSettings.interstitialCooldownSeconds ?? DEFAULT_INTERSTITIAL_COOLDOWN_SECONDS
    );
    setBannerPlacement(adminSettings.bannerPlacement || 'all_screens');
    setFeaturedAnn(adminSettings.featuredAnnouncement || '');
  }, [adminSettings]);

  useEffect(() => {
    setSlotDrafts(() => {
      const next: Record<string, number> = {};
      for (const t of tournaments) {
        next[t.id] = t.maxSlots;
      }
      return next;
    });
    setBannerDrafts(() => {
      const next: Record<string, string> = {};
      for (const t of tournaments) {
        next[t.id] = resolveBundledAssetUrl(
          t.bannerUrl,
          t.category === 'Clash Squad'
            ? BRAND_ASSETS.clashSquadBanner
            : t.category === 'Lone Wolf'
              ? BRAND_ASSETS.loneWolfBanner
              : BRAND_ASSETS.battleRoyaleBanner
        );
      }
      return next;
    });
  }, [tournaments]);

  useEffect(() => {
    if (!selectedMatchId && tournaments[0]) {
      setSelectedMatchId(tournaments[0].id);
    }
  }, [tournaments, selectedMatchId]);

  const selectedTournament = tournaments.find((t) => t.id === selectedMatchId);
  const existingSelectedResult = results.find((r) => r.tournamentId === selectedMatchId);

  useEffect(() => {
    setResultFormError(null);
    if (existingSelectedResult && existingSelectedResult.standings.length > 0) {
      setStandingsDraft(
        existingSelectedResult.standings.map((row, idx) => ({
          rank: idx + 1,
          userId: row.userId || '',
          playerName: row.playerName,
          kills: row.kills,
          coinsAwarded: row.coinsAwarded ?? 0,
        }))
      );
      return;
    }
    const baseReward = selectedTournament?.coinReward ?? 100;
    setStandingsDraft([
      {
        rank: 1,
        userId: '',
        playerName: '',
        kills: 0,
        coinsAwarded: baseReward,
      },
    ]);
  }, [selectedMatchId, existingSelectedResult?.id, existingSelectedResult?.verified, selectedTournament?.coinReward]);

  useEffect(() => {
    if (!selectedMatchId || !isSoleOwner) return;
    const unsub = subscribeTournamentRegistrations(selectedMatchId, (items) => {
      setMatchRegistrations(items);
      const nextDrafts: Record<string, number> = {};
      for (const item of items) {
        nextDrafts[item.id] = item.slotNumber;
      }
      setRegSlotDrafts(nextDrafts);
    });
    return () => unsub();
  }, [selectedMatchId, isSoleOwner]);

  useEffect(() => {
    if (!isSoleOwner) return;
    const unsub = adminSubscribeWithdrawals(setWithdrawals);
    return () => unsub();
  }, [isSoleOwner]);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const list = await adminFetchAllUsers();
      setUsers(list);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to fetch players.');
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (section === 'players' || section === 'rooms') {
      void loadUsers();
    }
  }, [section]);

  const getDefaultCategoryBanner = (cat: TournamentCategory) =>
    cat === 'Clash Squad'
      ? BRAND_ASSETS.clashSquadBanner
      : cat === 'Lone Wolf'
        ? BRAND_ASSETS.loneWolfBanner
        : BRAND_ASSETS.battleRoyaleBanner;

  const resetTournamentForm = () => {
    setEditingId(null);
    setTitle('');
    setCategory('Battle Royale');
    setMode('Squad');
    setMapName('Bermuda');
    setMaxSlots(12);
    setFilledSlots(0);
    setBannerUrl(BRAND_ASSETS.battleRoyaleBanner);
    setCoinReward(300);
    setPerKillCoins(10);
    setStatus('upcoming');
    setPublished(true);
    setFeatured(false);
    setRulesText('Free entry community match\nNo emulators allowed');
  };

  const handleEditTournament = (t: Tournament) => {
    setEditingId(t.id);
    setTitle(t.title);
    setCategory(t.category);
    setMode(t.mode);
    setMapName(t.mapName);
    setMatchDate(t.matchDate);
    setMatchTime(t.matchTime);
    setDeadlineLocal(t.registrationDeadline.slice(0, 16));
    setReleaseLocal(t.credentialsReleaseAt.slice(0, 16));
    setMaxSlots(t.maxSlots);
    setFilledSlots(t.filledSlots);
    setBannerUrl(resolveBundledAssetUrl(t.bannerUrl, getDefaultCategoryBanner(t.category)));
    setFormBannerError(null);
    setCoinReward(t.coinReward);
    setPerKillCoins(t.perKillCoins);
    setStatus(t.status);
    setPublished(t.published);
    setFeatured(t.featured);
    setRulesText(t.rules.join('\n'));
  };

  const handleSaveTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextMax = Number(maxSlots);
    const liveFilled = editingId ? filledSlots : 0;
    const slotValidation = validateAdminSlotUpdate(nextMax, liveFilled);
    if (!slotValidation.valid) {
      onToast(slotValidation.error);
      return;
    }

    const bannerValidation = validateTournamentBannerUrl(bannerUrl);
    if (!bannerValidation.valid) {
      onToast(bannerValidation.error);
      return;
    }

    const id = editingId || `sp-${Date.now()}`;

    try {
      await adminSaveTournament(
        {
          id,
          title: title.trim(),
          category,
          mode,
          mapName: mapName.trim(),
          bannerUrl: bannerValidation.bannerUrl,
          matchDate,
          matchTime,
          registrationDeadline: new Date(deadlineLocal).toISOString(),
          credentialsReleaseAt: new Date(releaseLocal).toISOString(),
          maxSlots: slotValidation.maxSlots,
          filledSlots: liveFilled,
          status,
          featured,
          published,
          rules: rulesText
            .split('\n')
            .map((r) => r.trim())
            .filter(Boolean),
          coinReward: Math.max(0, Math.floor(Number(coinReward))),
          perKillCoins: Math.max(0, Math.floor(Number(perKillCoins))),
          createdBy: adminUid,
        },
        !editingId
      );
      onToast(editingId ? 'Tournament updated.' : 'Tournament created in Firestore.');
      resetTournamentForm();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to save tournament.');
    }
  };

  const handleInlineSlotSave = async (tournament: Tournament) => {
    const nextMax = Number(slotDrafts[tournament.id] ?? tournament.maxSlots);
    const check = validateAdminSlotUpdate(nextMax, tournament.filledSlots);
    if (!check.valid) {
      onToast(check.error);
      return;
    }
    setSavingSlotId(tournament.id);
    try {
      await adminUpdateTournamentSlots(tournament.id, check.maxSlots);
      onToast(`Max slots updated for ${tournament.title} (${tournament.filledSlots}/${check.maxSlots}).`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to update slots.');
    } finally {
      setSavingSlotId(null);
    }
  };

  const handleFormBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setFormBannerError(null);
    setUploadingFormBanner(true);
    try {
      const result = await compressImageFileToDataUrl(file);
      setBannerUrl(result.dataUrl);
      onToast(`Image uploaded (${result.width}x${result.height}, ~${result.approxKb} KB).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to process selected image.';
      setFormBannerError(msg);
      onToast(msg);
    } finally {
      setUploadingFormBanner(false);
    }
  };

  const handleInlineBannerUpload = async (
    tournament: Tournament,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadingInlineBannerId(tournament.id);
    try {
      const result = await compressImageFileToDataUrl(file);
      setBannerDrafts((prev) => ({ ...prev, [tournament.id]: result.dataUrl }));
      await adminUpdateTournamentBanner(tournament.id, result.dataUrl);
      onToast(`Uploaded & saved match picture for ${tournament.title} (~${result.approxKb} KB).`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to upload match picture.');
    } finally {
      setUploadingInlineBannerId(null);
    }
  };

  const handleInlineBannerSave = async (tournament: Tournament) => {
    const draftUrl = bannerDrafts[tournament.id] ?? '';
    const check = validateTournamentBannerUrl(draftUrl);
    if (!check.valid) {
      onToast(check.error);
      return;
    }
    setSavingBannerId(tournament.id);
    try {
      await adminUpdateTournamentBanner(tournament.id, check.bannerUrl);
      onToast(`Match picture updated for ${tournament.title}.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to update match picture.');
    } finally {
      setSavingBannerId(null);
    }
  };

  const handleSaveParticipantSlot = async (reg: Registration, maxBracketSlots: number) => {
    const nextSlot = Number(regSlotDrafts[reg.id] ?? reg.slotNumber);
    const check = validateSlotAssignment(nextSlot, maxBracketSlots);
    if (!check.valid) {
      onToast(check.error);
      return;
    }
    setSavingRegSlotId(reg.id);
    try {
      await adminUpdateRegistrationSlot(reg.id, check.slotNumber, maxBracketSlots);
      onToast(`${reg.freeFireIgn} moved to Slot #${check.slotNumber}.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to update participant slot.');
    } finally {
      setSavingRegSlotId(null);
    }
  };

  const handleAdjustCoins = async (user: UserProfile) => {
    const rawDelta = Number(coinDrafts[user.uid]);
    const reason = coinReasons[user.uid] || 'Match reward credited by admin';
    setSavingCoinUid(user.uid);
    try {
      const nextBalance = await adminAdjustUserCoins({
        userId: user.uid,
        deltaCoins: rawDelta,
        reason,
      });
      setCoinDrafts((prev) => ({ ...prev, [user.uid]: '' }));
      setCoinReasons((prev) => ({ ...prev, [user.uid]: '' }));
      onToast(`${user.username} wallet updated to ${nextBalance.toLocaleString()} coins.`);
      await loadUsers();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to adjust coins.');
    } finally {
      setSavingCoinUid(null);
    }
  };

  const handleProcessWithdrawal = async (
    withdrawal: WithdrawalRequest,
    decision: 'approved' | 'rejected'
  ) => {
    setProcessingWdId(withdrawal.id);
    try {
      await adminProcessWithdrawal({
        withdrawal,
        status: decision,
        adminNote: withdrawalNotes[withdrawal.id] || '',
      });
      onToast(
        decision === 'approved'
          ? `Approved ${formatRupees(withdrawal.rupees)} payout for ${withdrawal.username}.`
          : `Rejected request and refunded ${withdrawal.coins.toLocaleString()} coins to ${withdrawal.username}.`
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to process withdrawal.');
    } finally {
      setProcessingWdId(null);
    }
  };

  const handlePublishRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = tournaments.find((t) => t.id === selectedMatchId);
    if (!target) return;
    try {
      await adminPublishRoomCredentials({
        tournament: target,
        roomId,
        roomPassword,
        releaseAtIso: new Date(roomReleaseAt).toISOString(),
      });
      onToast('Room credentials saved and encrypted for registered players.');
      setRoomId('');
      setRoomPassword('');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to publish room.');
    }
  };

  const handleLoadJoinedRoster = () => {
    setResultFormError(null);
    if (matchRegistrations.length === 0) {
      onToast('No players have joined this match yet.');
      return;
    }
    const confirmed = matchRegistrations.filter((r) => r.status === 'confirmed');
    const source = confirmed.length > 0 ? confirmed : matchRegistrations;
    const baseWinCoins = selectedTournament?.coinReward ?? 100;
    setStandingsDraft(
      source.map((reg, idx) => ({
        rank: idx + 1,
        userId: reg.userId,
        playerName: reg.teamName ? `${reg.teamName} (${reg.freeFireIgn})` : reg.freeFireIgn,
        kills: 0,
        coinsAwarded: idx === 0 ? baseWinCoins : 0,
      }))
    );
    onToast(`Loaded ${source.length} joined player(s) into standings for review.`);
  };

  const handleAddStandingRow = () => {
    setResultFormError(null);
    setStandingsDraft((prev) => [
      ...prev,
      {
        rank: prev.length + 1,
        userId: '',
        playerName: '',
        kills: 0,
        coinsAwarded: 0,
      },
    ]);
  };

  const handleUpdateStandingRow = (index: number, patch: Partial<ResultStanding>) => {
    setResultFormError(null);
    setStandingsDraft((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, ...patch, rank: idx + 1 } : row))
    );
  };

  const handleAutoCalcChampionCoins = (index: number) => {
    if (!selectedTournament) return;
    const row = standingsDraft[index];
    if (!row) return;
    const computed = calculateMatchCoinReward({
      winBonusCoins: index === 0 ? selectedTournament.coinReward : 0,
      kills: Number(row.kills) || 0,
      coinsPerKill: selectedTournament.perKillCoins,
    });
    handleUpdateStandingRow(index, { coinsAwarded: computed });
  };

  const handleRemoveStandingRow = (index: number) => {
    setResultFormError(null);
    setStandingsDraft((prev) => {
      if (prev.length <= 1) return prev;
      return prev
        .filter((_, idx) => idx !== index)
        .map((row, idx) => ({ ...row, rank: idx + 1 }));
    });
  };

  const handleSaveOrPublishResult = async (verified: boolean) => {
    setResultFormError(null);
    const target = tournaments.find((t) => t.id === selectedMatchId);
    if (!target) {
      setResultFormError('Select a tournament match first.');
      return;
    }
    const validation = validateResultStandings(standingsDraft);
    if (!validation.valid) {
      setResultFormError(validation.error);
      return;
    }

    setSavingResultMode(verified ? 'publish' : 'draft');
    try {
      const outcome = await adminPublishMatchResult({
        tournament: target,
        winnerUserId: validation.winnerUserId,
        winnerName: validation.winnerName,
        totalKills: validation.totalKills,
        winnerCoins: validation.standings[0]?.coinsAwarded ?? 0,
        participationCoins: Number(participationCoins) || 0,
        standings: validation.standings,
        verified,
      });

      if (!outcome.published) {
        onToast('Result saved as private Admin Draft for review (not visible to players yet).');
      } else if (outcome.alreadyPublished) {
        onToast('Published result standings updated for everyone (coins preserved without double-crediting).');
      } else {
        onToast('Match result verified & published to everyone! Spider Coins and leaderboard updated.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save match result.';
      setResultFormError(msg);
      onToast(msg);
    } finally {
      setSavingResultMode(null);
    }
  };

  const handleDeleteDraftResult = async () => {
    if (!existingSelectedResult || existingSelectedResult.verified) return;
    setSavingResultMode('delete');
    try {
      await adminDeleteMatchResult(existingSelectedResult.id);
      onToast('Unpublished result draft removed.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to delete result draft.');
    } finally {
      setSavingResultMode(null);
    }
  };

  const handleSeedDatabase = async () => {
    try {
      const seeded = await seedFirestoreIfEmpty(adminUid);
      onToast(
        seeded
          ? 'Initial Free Fire tournaments and leaderboard seeded to Firestore.'
          : 'Firestore tournament records verified and synced.'
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Seed failed.');
    }
  };

  const pendingWithdrawalsCount = withdrawals.filter((w) => w.status === 'pending').length;
  const visibleWithdrawals = withdrawals.filter((w) =>
    withdrawalFilter === 'all' ? true : w.status === withdrawalFilter
  );

  if (!isSoleOwner) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white flex items-center gap-2.5">
            <Shield className="w-7 h-7 text-[#E11D48]" />
            SPIDER ESPORTS Admin Console
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Owner-locked control center ({SOLE_ADMIN_EMAIL}) for tournaments, live slots, Spider Coins, withdrawals, rooms, and AdMob.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSeedDatabase}
          className="min-h-[42px] px-4 py-2 rounded-lg border border-white/15 bg-[#121216] hover:bg-[#18181D] text-xs font-semibold text-white inline-flex items-center gap-2 shrink-0"
        >
          <Database className="w-4 h-4 text-[#E11D48]" />
          Sync Starter Brackets to Firestore
        </button>
      </div>

      {/* Section Tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Admin sections">
        {(
          [
            { id: 'tournaments', label: 'Tournaments', icon: Plus },
            { id: 'rooms', label: 'Rooms & Results', icon: KeyRound },
            { id: 'players', label: 'Players, Slots & Coins', icon: Users },
            {
              id: 'withdrawals',
              label:
                pendingWithdrawalsCount > 0
                  ? `Withdrawals (${pendingWithdrawalsCount})`
                  : 'Withdrawals',
              icon: Wallet,
            },
            { id: 'app', label: 'Alerts & AdMob', icon: Settings },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = section === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSection(tab.id)}
              className={`min-h-[42px] px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
                active
                  ? 'bg-[#E11D48] text-white'
                  : 'bg-[#121216] text-zinc-300 border border-white/10 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 1. TOURNAMENT MANAGEMENT */}
      {section === 'tournaments' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSaveTournament}
            className="lg:col-span-5 rounded-xl border border-white/10 bg-[#121216] p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-white">
                {editingId ? 'Edit Tournament' : 'Create Free Tournament'}
              </h2>
              {editingId && (
                <button
                  type="button"
                  onClick={resetTournamentForm}
                  className="text-xs text-zinc-400 hover:text-white"
                >
                  New Form
                </button>
              )}
            </div>

            <div>
              <label htmlFor="adm-title" className="block text-xs text-zinc-300 mb-1">
                Tournament Title
              </label>
              <input
                id="adm-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Friday Night Squad Scrims"
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="adm-cat" className="block text-xs text-zinc-300 mb-1">
                  Category
                </label>
                <select
                  id="adm-cat"
                  value={category}
                  onChange={(e) => {
                    const nextCat = e.target.value as TournamentCategory;
                    const prevDefault = getDefaultCategoryBanner(category);
                    setCategory(nextCat);
                    const firstMode = CATEGORIES_WITH_MODES[nextCat][0];
                    setMode(firstMode);
                    setMaxSlots(getModeDefinition(firstMode).defaultMaxSlots);
                    if (!editingId && bannerUrl === prevDefault) {
                      setBannerUrl(getDefaultCategoryBanner(nextCat));
                    }
                  }}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
                >
                  <option value="Battle Royale">Battle Royale</option>
                  <option value="Clash Squad">Clash Squad</option>
                  <option value="Lone Wolf">Lone Wolf</option>
                </select>
              </div>
              <div>
                <label htmlFor="adm-mode" className="block text-xs text-zinc-300 mb-1">
                  Mode
                </label>
                <select
                  id="adm-mode"
                  value={mode}
                  onChange={(e) => {
                    const nextMode = e.target.value as TournamentMode;
                    setMode(nextMode);
                    setMaxSlots(getModeDefinition(nextMode).defaultMaxSlots);
                  }}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
                >
                  {CATEGORIES_WITH_MODES[category].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="adm-map" className="block text-xs text-zinc-300 mb-1">
                  Map
                </label>
                <input
                  id="adm-map"
                  type="text"
                  required
                  value={mapName}
                  onChange={(e) => setMapName(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="adm-slots" className="block text-xs text-zinc-300 mb-1">
                  Max Slots
                </label>
                <input
                  id="adm-slots"
                  type="number"
                  min={editingId ? Math.max(MIN_TOURNAMENT_SLOTS, filledSlots) : MIN_TOURNAMENT_SLOTS}
                  max={MAX_TOURNAMENT_SLOTS}
                  value={maxSlots}
                  onChange={(e) => setMaxSlots(Number(e.target.value))}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm font-mono-tabular text-white"
                />
              </div>
            </div>

            <p className="text-[11px] text-zinc-400">
              {editingId
                ? `Filled Slots (Auto from player joins): ${filledSlots} / ${maxSlots}`
                : 'Filled Slots start at 0 and automatically increase (+1) as players join inside the app.'}
            </p>

            {/* Match Banner Picture Uploader & Presets */}
            <div className="rounded-lg border border-white/10 bg-[#09090B] p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#E11D48]" />
                  Match Picture
                </span>
                <span className="text-[11px] text-zinc-400">
                  {bannerUrl.startsWith('data:image/')
                    ? `Uploaded photo (~${estimateDataUrlSizeKb(bannerUrl)} KB)`
                    : MATCH_BANNER_PRESETS.find((p) => p.url === bannerUrl)?.label || 'Custom image'}
                </span>
              </div>
              <div className="aspect-video w-full rounded-md overflow-hidden border border-white/10 bg-[#121216]">
                <img
                  src={resolveBundledAssetUrl(bannerUrl, getDefaultCategoryBanner(category))}
                  alt="Match banner preview"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <label
                htmlFor="adm-banner-upload"
                className={`min-h-[42px] w-full px-3 py-2 rounded-lg border border-dashed border-[#E11D48]/60 bg-[#121216] hover:bg-[#18181D] text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                  uploadingFormBanner ? 'opacity-60 pointer-events-none' : ''
                }`}
              >
                <Upload className="w-4 h-4 text-[#F43F5E]" />
                {uploadingFormBanner ? 'Compressing & Preparing Image...' : 'Upload Match Image (PNG / JPG / WEBP)'}
              </label>
              <input
                id="adm-banner-upload"
                type="file"
                accept={ALLOWED_IMAGE_INPUT_ACCEPT}
                disabled={uploadingFormBanner}
                onChange={(e) => void handleFormBannerUpload(e)}
                className="sr-only"
              />
              {formBannerError && (
                <p role="alert" className="text-[11px] text-[#FB7185] font-medium">
                  {formBannerError}
                </p>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                {MATCH_BANNER_PRESETS.map((preset) => {
                  const selected = bannerUrl === preset.url;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setFormBannerError(null);
                        setBannerUrl(preset.url);
                      }}
                      className={`min-h-[34px] px-2.5 py-1 rounded text-[11px] font-medium text-left truncate border transition-colors ${
                        selected
                          ? 'bg-[#E11D48]/20 border-[#E11D48] text-white'
                          : 'bg-[#121216] border-white/10 text-zinc-300 hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="adm-coins" className="block text-xs text-zinc-300 mb-1">
                  1st Position Coins (Win Bonus)
                </label>
                <input
                  id="adm-coins"
                  type="number"
                  min={0}
                  max={100000}
                  value={coinReward}
                  onChange={(e) => setCoinReward(Number(e.target.value))}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm font-mono-tabular text-white"
                />
              </div>
              <div>
                <label htmlFor="adm-kill-coins" className="block text-xs text-zinc-300 mb-1">
                  Per-Kill Coins
                </label>
                <input
                  id="adm-kill-coins"
                  type="number"
                  min={0}
                  max={10000}
                  value={perKillCoins}
                  onChange={(e) => setPerKillCoins(Number(e.target.value))}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm font-mono-tabular text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="adm-date" className="block text-xs text-zinc-300 mb-1">
                  Match Date
                </label>
                <input
                  id="adm-date"
                  type="date"
                  value={matchDate}
                  onChange={(e) => setMatchDate(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="adm-time" className="block text-xs text-zinc-300 mb-1">
                  Match Time
                </label>
                <input
                  id="adm-time"
                  type="time"
                  value={matchTime}
                  onChange={(e) => setMatchTime(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="adm-deadline" className="block text-xs text-zinc-300 mb-1">
                  Reg. Deadline
                </label>
                <input
                  id="adm-deadline"
                  type="datetime-local"
                  value={deadlineLocal}
                  onChange={(e) => setDeadlineLocal(e.target.value)}
                  className="w-full min-h-[42px] px-2.5 py-2 rounded-lg border border-white/10 bg-[#09090B] text-xs text-white"
                />
              </div>
              <div>
                <label htmlFor="adm-release" className="block text-xs text-zinc-300 mb-1">
                  Room Unlock
                </label>
                <input
                  id="adm-release"
                  type="datetime-local"
                  value={releaseLocal}
                  onChange={(e) => setReleaseLocal(e.target.value)}
                  className="w-full min-h-[42px] px-2.5 py-2 rounded-lg border border-white/10 bg-[#09090B] text-xs text-white"
                />
              </div>
            </div>

            <div>
              <label htmlFor="adm-status" className="block text-xs text-zinc-300 mb-1">
                Status
              </label>
              <select
                id="adm-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TournamentStatus)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
              >
                <option value="upcoming">Upcoming</option>
                <option value="live">Live</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="draft">Draft</option>
              </select>
            </div>

            <div>
              <label htmlFor="adm-rules" className="block text-xs text-zinc-300 mb-1">
                Tournament Rules (one per line)
              </label>
              <textarea
                id="adm-rules"
                rows={3}
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
                className="w-full p-3 rounded-lg border border-white/10 bg-[#09090B] text-xs text-white"
              />
            </div>

            <div className="flex items-center gap-5 text-xs text-zinc-300">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                  className="accent-[#E11D48]"
                />
                Published
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={featured}
                  onChange={(e) => setFeatured(e.target.checked)}
                  className="accent-[#E11D48]"
                />
                Featured Banner
              </label>
            </div>

            <button
              type="submit"
              className="w-full min-h-[46px] rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white"
            >
              {editingId ? 'Save Tournament Changes' : 'Publish Free Tournament'}
            </button>
          </form>

          <div className="lg:col-span-7 rounded-xl border border-white/10 bg-[#121216] p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-bold text-white">
                Active Brackets, Pictures &amp; Slots ({tournaments.length})
              </h2>
              <span className="text-[11px] text-zinc-400">Filled slots update live as players join</span>
            </div>
            <div className="divide-y divide-white/10">
              {tournaments.map((t) => {
                const draftMax = slotDrafts[t.id] ?? t.maxSlots;
                const isSlotDirty = draftMax !== t.maxSlots;
                const currentBanner = resolveBundledAssetUrl(
                  t.bannerUrl,
                  getDefaultCategoryBanner(t.category)
                );
                const draftBanner = bannerDrafts[t.id] ?? currentBanner;
                const isBannerDirty = draftBanner.trim() !== currentBanner;
                const isUploadingInline = uploadingInlineBannerId === t.id;
                return (
                  <div key={t.id} className="py-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={draftBanner || currentBanner}
                          alt={`${t.title} thumbnail`}
                          referrerPolicy="no-referrer"
                          className="w-16 h-10 rounded-md object-cover border border-white/10 bg-[#09090B] shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{t.title}</p>
                          <p className="text-xs text-zinc-400 tabular-nums">
                            {t.category} · {t.mode} · {t.filledSlots}/{t.maxSlots} joined · +{t.coinReward} Coins · {t.status}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleEditTournament(t)}
                          aria-label={`Edit ${t.title}`}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-white/10 text-zinc-300 hover:text-white"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            adminDeleteTournament(t.id)
                              .then(() => onToast('Tournament deleted.'))
                              .catch((err) =>
                                onToast(err instanceof Error ? err.message : 'Delete failed.')
                              )
                          }
                          aria-label={`Delete ${t.title}`}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-white/10 text-[#F43F5E] hover:bg-[#E11D48]/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                      {/* Max Slots (Filled is read-only & auto-incremented on player join) */}
                      <div className="flex flex-wrap items-end justify-between gap-2.5 rounded-lg bg-[#09090B] border border-white/10 p-2.5">
                        <div>
                          <p className="text-[11px] text-zinc-400">Filled (Auto)</p>
                          <p className="text-xs font-mono-tabular font-semibold text-emerald-400 mt-1">
                            {t.filledSlots} / {t.maxSlots}
                          </p>
                        </div>
                        <div className="flex items-end gap-2">
                          <div>
                            <label
                              htmlFor={`max-${t.id}`}
                              className="block text-[11px] text-zinc-400 mb-1"
                            >
                              Max Slots
                            </label>
                            <input
                              id={`max-${t.id}`}
                              type="number"
                              min={Math.max(MIN_TOURNAMENT_SLOTS, t.filledSlots)}
                              max={MAX_TOURNAMENT_SLOTS}
                              value={draftMax}
                              onChange={(e) =>
                                setSlotDrafts((prev) => ({
                                  ...prev,
                                  [t.id]: Number(e.target.value),
                                }))
                              }
                              className="w-24 min-h-[36px] px-2.5 py-1 rounded-md border border-white/10 bg-[#121216] text-xs font-mono-tabular text-white"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={savingSlotId === t.id || !isSlotDirty}
                            onClick={() => void handleInlineSlotSave(t)}
                            className="min-h-[36px] px-3 py-1.5 rounded-md bg-[#E11D48] hover:bg-[#F43F5E] disabled:bg-zinc-800 disabled:text-zinc-500 text-xs font-semibold text-white transition-colors"
                          >
                            {savingSlotId === t.id ? 'Saving...' : 'Save Max'}
                          </button>
                        </div>
                      </div>

                      {/* Quick Match Picture Upload & Preset */}
                      <div className="flex flex-col gap-1.5 rounded-lg bg-[#09090B] border border-white/10 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                            <ImageIcon className="w-3 h-3 text-[#E11D48]" />
                            Match Picture
                          </span>
                          <select
                            aria-label={`Choose preset picture for ${t.title}`}
                            value={
                              MATCH_BANNER_PRESETS.some((p) => p.url === draftBanner)
                                ? draftBanner
                                : ''
                            }
                            onChange={(e) => {
                              if (e.target.value) {
                                setBannerDrafts((prev) => ({ ...prev, [t.id]: e.target.value }));
                              }
                            }}
                            className="max-w-[140px] px-2 py-0.5 rounded border border-white/10 bg-[#121216] text-[11px] text-zinc-200"
                          >
                            <option value="">Presets...</option>
                            {MATCH_BANNER_PRESETS.map((preset) => (
                              <option key={preset.id} value={preset.url}>
                                {preset.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor={`pic-upload-${t.id}`}
                            className={`min-w-0 flex-1 min-h-[36px] px-2.5 py-1.5 rounded-md border border-dashed border-[#E11D48]/50 bg-[#121216] hover:bg-[#18181D] text-xs font-medium text-zinc-200 inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                              isUploadingInline ? 'opacity-60 pointer-events-none' : ''
                            }`}
                          >
                            <Upload className="w-3.5 h-3.5 text-[#F43F5E] shrink-0" />
                            <span className="truncate">
                              {isUploadingInline ? 'Uploading...' : 'Upload Image'}
                            </span>
                          </label>
                          <input
                            id={`pic-upload-${t.id}`}
                            type="file"
                            accept={ALLOWED_IMAGE_INPUT_ACCEPT}
                            disabled={isUploadingInline}
                            onChange={(e) => void handleInlineBannerUpload(t, e)}
                            className="sr-only"
                          />
                          <button
                            type="button"
                            disabled={savingBannerId === t.id || !isBannerDirty}
                            onClick={() => void handleInlineBannerSave(t)}
                            className="min-h-[36px] px-3 py-1.5 rounded-md bg-[#E11D48] hover:bg-[#F43F5E] disabled:bg-zinc-800 disabled:text-zinc-500 text-xs font-semibold text-white shrink-0 transition-colors"
                          >
                            {savingBannerId === t.id ? 'Saving...' : 'Save Pic'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 2. ROOM CREDENTIALS & VERIFIED RESULTS */}
      {section === 'rooms' && (
        <div className="space-y-6">
          {/* Result Review Queue */}
          <div className="rounded-xl border border-white/10 bg-[#121216] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
                  <FileCheck2 className="w-5 h-5 text-[#E11D48]" />
                  Match Result Review Queue
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Review joined players, build standings, save private drafts, and publish final results so everyone can see them on Results &amp; My Matches.
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px] shrink-0">
                <span className="px-2.5 py-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
                  {tournaments.filter((t) => {
                    const r = results.find((res) => res.tournamentId === t.id);
                    return (!r || !r.verified) && (t.status === 'live' || t.status === 'completed' || Boolean(r));
                  }).length}{' '}
                  Pending Review
                </span>
                <span className="px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                  {results.filter((r) => r.verified).length} Published
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {tournaments.map((t) => {
                const matchResult = results.find((r) => r.tournamentId === t.id);
                const isSelected = selectedMatchId === t.id;
                const badge = matchResult?.verified
                  ? { label: 'Published', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' }
                  : matchResult && !matchResult.verified
                    ? { label: 'Draft Under Review', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' }
                    : t.status === 'completed' || t.status === 'live'
                      ? { label: 'Needs Result Review', cls: 'bg-[#E11D48]/15 text-[#F43F5E] border-[#E11D48]/30' }
                      : { label: t.status, cls: 'bg-white/5 text-zinc-400 border-white/10' };

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedMatchId(t.id)}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      isSelected
                        ? 'border-[#E11D48] bg-[#E11D48]/10'
                        : 'border-white/10 bg-[#09090B] hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-white line-clamp-1">{t.title}</p>
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold shrink-0 ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {t.mode} · {t.filledSlots}/{t.maxSlots} Joined · {t.matchDate}
                    </p>
                  </button>
                );
              })}
            </div>

            <div>
              <label htmlFor="select-match" className="block text-xs text-zinc-400 mb-1.5">
                Selected Tournament Match
              </label>
              <select
                id="select-match"
                value={selectedMatchId}
                onChange={(e) => setSelectedMatchId(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
              >
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.mode} · {t.status})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={handlePublishRoom}
              className="lg:col-span-4 rounded-xl border border-white/10 bg-[#121216] p-5 space-y-4"
            >
              <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-[#E11D48]" />
                Publish Custom Room Credentials
              </h2>
              <div>
                <label htmlFor="room-id" className="block text-xs text-zinc-300 mb-1">
                  Free Fire Custom Room ID
                </label>
                <input
                  id="room-id"
                  type="text"
                  required
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="e.g. 48291048"
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm font-mono-tabular text-white"
                />
              </div>
              <div>
                <label htmlFor="room-pass" className="block text-xs text-zinc-300 mb-1">
                  Room Password
                </label>
                <input
                  id="room-pass"
                  type="text"
                  required
                  value={roomPassword}
                  onChange={(e) => setRoomPassword(e.target.value)}
                  placeholder="e.g. SPIDER99"
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm font-mono-tabular text-white"
                />
              </div>
              <div>
                <label htmlFor="room-rel" className="block text-xs text-zinc-300 mb-1">
                  Visible to Registered Players At
                </label>
                <input
                  id="room-rel"
                  type="datetime-local"
                  value={roomReleaseAt}
                  onChange={(e) => setRoomReleaseAt(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-xs text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full min-h-[44px] rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white"
              >
                Publish Room Credentials
              </button>
            </form>

            <div className="lg:col-span-8 rounded-xl border border-white/10 bg-[#121216] p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-[#E11D48]" />
                    Review &amp; Publish Match Result
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {selectedTournament
                      ? `${selectedTournament.title} · 1st Position: ${selectedTournament.coinReward} Coins · Per Kill: ${selectedTournament.perKillCoins} Coins`
                      : 'Select a match above'}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded border text-[11px] font-semibold shrink-0 ${
                    existingSelectedResult?.verified
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : existingSelectedResult
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-white/5 text-zinc-300 border-white/10'
                  }`}
                >
                  {existingSelectedResult?.verified
                    ? 'Published to Everyone'
                    : existingSelectedResult
                      ? 'Draft Under Review'
                      : 'Not Saved Yet'}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#09090B] p-3">
                <p className="text-xs text-zinc-300">
                  Joined Players in Match:{' '}
                  <strong className="text-white font-mono-tabular">{matchRegistrations.length}</strong>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoadJoinedRoster}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-white/15 bg-[#121216] hover:bg-white/5 text-xs font-semibold text-white"
                  >
                    Load Joined Roster ({matchRegistrations.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleAddStandingRow}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Rank Row
                  </button>
                </div>
              </div>

              {/* Multi-row Standings Editor */}
              <div className="space-y-3">
                {standingsDraft.map((row, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-white/10 bg-[#09090B] p-3.5 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-[#E11D48]/15 text-[#F43F5E] font-mono-tabular">
                          Rank #{index + 1}
                        </span>
                        {index === 0 && (
                          <span className="text-amber-400 text-[11px] font-semibold">Champion</span>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAutoCalcChampionCoins(index)}
                          className="text-[11px] text-amber-300 hover:text-amber-200 underline underline-offset-2"
                        >
                          Calc Coins from Kills
                        </button>
                        {standingsDraft.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveStandingRow(index)}
                            aria-label={`Remove rank ${index + 1}`}
                            className="p-1.5 rounded border border-white/10 text-zinc-400 hover:text-[#F43F5E]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor={`standing-user-${index}`}
                          className="block text-[11px] text-zinc-400 mb-1"
                        >
                          Link Registered Account (credits Coins &amp; My Matches)
                        </label>
                        <select
                          id={`standing-user-${index}`}
                          value={row.userId || ''}
                          onChange={(e) => {
                            const uid = e.target.value;
                            const matchedUser = users.find((u) => u.uid === uid);
                            const matchedReg = matchRegistrations.find((r) => r.userId === uid);
                            const nextName = matchedReg
                              ? matchedReg.teamName
                                ? `${matchedReg.teamName} (${matchedReg.freeFireIgn})`
                                : matchedReg.freeFireIgn
                              : matchedUser?.username || row.playerName;
                            handleUpdateStandingRow(index, {
                              userId: uid,
                              playerName: nextName,
                            });
                          }}
                          className="w-full min-h-[38px] px-2.5 py-1.5 rounded border border-white/10 bg-[#121216] text-xs text-white"
                        >
                          <option value="">Manual entry / unlinked player</option>
                          {matchRegistrations.length > 0 && (
                            <optgroup label="Joined This Match">
                              {matchRegistrations.map((reg) => (
                                <option key={`reg-${reg.id}`} value={reg.userId}>
                                  Slot #{reg.slotNumber}: {reg.freeFireIgn}
                                  {reg.teamName ? ` (${reg.teamName})` : ''}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="All Registered Accounts">
                            {users.map((u) => (
                              <option key={`usr-${u.uid}`} value={u.uid}>
                                {u.username} (UID: {u.freeFireUid})
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor={`standing-name-${index}`}
                          className="block text-[11px] text-zinc-400 mb-1"
                        >
                          Player / Squad Name (Shown Publicly)
                        </label>
                        <input
                          id={`standing-name-${index}`}
                          type="text"
                          value={row.playerName}
                          onChange={(e) =>
                            handleUpdateStandingRow(index, { playerName: e.target.value })
                          }
                          placeholder="e.g. KuroSpider"
                          className="w-full min-h-[38px] px-2.5 py-1.5 rounded border border-white/10 bg-[#121216] text-xs text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor={`standing-kills-${index}`}
                          className="block text-[11px] text-zinc-400 mb-1"
                        >
                          Kills
                        </label>
                        <input
                          id={`standing-kills-${index}`}
                          type="number"
                          min={0}
                          max={500}
                          value={row.kills}
                          onChange={(e) => {
                            const nextKills = Math.max(0, Number(e.target.value) || 0);
                            const autoCoins = selectedTournament
                              ? calculateMatchCoinReward({
                                  winBonusCoins: index === 0 ? selectedTournament.coinReward : 0,
                                  kills: nextKills,
                                  coinsPerKill: selectedTournament.perKillCoins,
                                })
                              : row.coinsAwarded ?? 0;
                            handleUpdateStandingRow(index, {
                              kills: nextKills,
                              coinsAwarded: autoCoins,
                            });
                          }}
                          className="w-full min-h-[38px] px-2.5 py-1.5 rounded border border-white/10 bg-[#121216] text-xs font-mono-tabular text-white"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`standing-coins-${index}`}
                          className="block text-[11px] text-zinc-400 mb-1"
                        >
                          Coins Awarded {index === 0 ? '(1st Pos + Kills)' : '(Per-Kill Coins)'}
                        </label>
                        <input
                          id={`standing-coins-${index}`}
                          type="number"
                          min={0}
                          max={1000000}
                          value={row.coinsAwarded ?? 0}
                          onChange={(e) =>
                            handleUpdateStandingRow(index, {
                              coinsAwarded: Number(e.target.value),
                            })
                          }
                          className="w-full min-h-[38px] px-2.5 py-1.5 rounded border border-white/10 bg-[#121216] text-xs font-mono-tabular text-amber-400"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label htmlFor="res-part-coins" className="block text-xs text-zinc-300 mb-1">
                    Participation Coins (Unlisted Confirmed Players)
                  </label>
                  <input
                    id="res-part-coins"
                    type="number"
                    min={0}
                    max={100000}
                    value={participationCoins}
                    onChange={(e) => setParticipationCoins(Number(e.target.value))}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm font-mono-tabular text-white"
                  />
                </div>

                <div className="rounded-lg border border-white/10 bg-[#09090B] p-3 text-xs space-y-1">
                  <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
                    Review Summary
                  </p>
                  <p className="text-zinc-300">
                    Champion (#1):{' '}
                    <strong className="text-white">
                      {standingsDraft[0]?.playerName?.trim() || 'Not set'}
                    </strong>
                  </p>
                  <p className="text-zinc-300">
                    Total Kills:{' '}
                    <strong className="text-white font-mono-tabular">
                      {standingsDraft.reduce((acc, r) => acc + (Number(r.kills) || 0), 0)}
                    </strong>{' '}
                    · Total Coins:{' '}
                    <strong className="text-amber-400 font-mono-tabular">
                      {standingsDraft
                        .reduce((acc, r) => acc + (Number(r.coinsAwarded) || 0), 0)
                        .toLocaleString()}
                    </strong>
                  </p>
                </div>
              </div>

              {resultFormError && (
                <div
                  role="alert"
                  className="rounded-lg border border-[#E11D48]/50 bg-[#E11D48]/10 px-3.5 py-2.5 text-xs text-[#F43F5E]"
                >
                  {resultFormError}
                </div>
              )}

              <div className="flex flex-col sm:flex-row flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  disabled={savingResultMode !== null}
                  onClick={() => void handleSaveOrPublishResult(false)}
                  className="flex-1 min-h-[44px] px-4 rounded-lg border border-white/15 bg-zinc-900 hover:bg-zinc-800 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {savingResultMode === 'draft' ? 'Saving Draft...' : 'Save Draft for Review'}
                </button>
                <button
                  type="button"
                  disabled={savingResultMode !== null}
                  onClick={() => void handleSaveOrPublishResult(true)}
                  className="flex-1 min-h-[44px] px-4 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {savingResultMode === 'publish'
                    ? 'Publishing...'
                    : existingSelectedResult?.verified
                      ? 'Update Published Result'
                      : 'Publish Result to Everyone'}
                </button>
                {existingSelectedResult && !existingSelectedResult.verified && (
                  <button
                    type="button"
                    disabled={savingResultMode !== null}
                    onClick={() => void handleDeleteDraftResult()}
                    className="min-h-[44px] px-4 rounded-lg border border-[#E11D48]/40 text-xs font-semibold text-[#F43F5E] hover:bg-[#E11D48]/10 disabled:opacity-50"
                  >
                    Delete Draft
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. PLAYER, COIN CREDITING & SLOT MANAGEMENT */}
      {section === 'players' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-xl border border-white/10 bg-[#121216] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-white">
                Registered Users &amp; Coin Wallets ({users.length})
              </h2>
              <button
                type="button"
                onClick={loadUsers}
                className="text-xs text-[#F43F5E] hover:text-white"
              >
                Refresh
              </button>
            </div>
            {loadingUsers ? (
              <p className="text-xs text-zinc-400">Loading player accounts...</p>
            ) : users.length === 0 ? (
              <p className="text-xs text-zinc-400">No player profiles stored yet.</p>
            ) : (
              <div className="divide-y divide-white/10">
                {users.map((u) => (
                  <div key={u.uid} className="py-4 space-y-3 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {u.username} {u.suspended ? '(Suspended)' : ''}
                        </p>
                        <p className="text-zinc-400 font-mono-tabular">
                          IGN: {u.freeFireIgn} · UID: {u.freeFireUid} · {u.totalWins}W / {u.totalKills}K
                        </p>
                        <p className="text-amber-400 font-semibold font-mono-tabular mt-0.5 inline-flex items-center gap-1">
                          <Coins className="w-3.5 h-3.5" />
                          {u.coins.toLocaleString()} Coins ({formatRupees(calculateRupeesFromCoins(u.coins))})
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          adminToggleUserSuspension(u.uid, !u.suspended).then(() => {
                            onToast(u.suspended ? 'Player restored.' : 'Player suspended.');
                            void loadUsers();
                          })
                        }
                        className={`min-h-[36px] px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 ${
                          u.suspended
                            ? 'border-emerald-500/40 text-emerald-400'
                            : 'border-[#E11D48]/40 text-[#F43F5E]'
                        }`}
                      >
                        {u.suspended ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Unsuspend
                          </>
                        ) : (
                          <>
                            <Ban className="w-3.5 h-3.5" /> Suspend
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[#09090B] border border-white/10 p-2.5">
                      <input
                        type="number"
                        aria-label={`Coins to credit ${u.username}`}
                        value={coinDrafts[u.uid] ?? ''}
                        onChange={(e) =>
                          setCoinDrafts((prev) => ({ ...prev, [u.uid]: e.target.value }))
                        }
                        placeholder="+Coins (e.g. 200)"
                        className="w-32 min-h-[36px] px-2.5 py-1 rounded-md border border-white/10 bg-[#121216] text-xs font-mono-tabular text-white"
                      />
                      <input
                        type="text"
                        aria-label={`Reward note for ${u.username}`}
                        value={coinReasons[u.uid] ?? ''}
                        onChange={(e) =>
                          setCoinReasons((prev) => ({ ...prev, [u.uid]: e.target.value }))
                        }
                        placeholder="Reason (e.g. 5 Kills + Match Play)"
                        className="flex-1 min-w-[160px] min-h-[36px] px-2.5 py-1 rounded-md border border-white/10 bg-[#121216] text-xs text-white"
                      />
                      <button
                        type="button"
                        disabled={savingCoinUid === u.uid || !coinDrafts[u.uid]}
                        onClick={() => void handleAdjustCoins(u)}
                        className="min-h-[36px] px-3 py-1 rounded-md bg-[#E11D48] hover:bg-[#F43F5E] disabled:bg-zinc-800 disabled:text-zinc-500 text-xs font-semibold text-white"
                      >
                        {savingCoinUid === u.uid ? 'Crediting...' : 'Credit Coins'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 rounded-xl border border-white/10 bg-[#121216] p-5 space-y-4">
            <h2 className="font-display text-xl font-bold text-white">
              Bracket Roster ({matchRegistrations.length})
            </h2>
            <select
              aria-label="Select tournament roster"
              value={selectedMatchId}
              onChange={(e) => setSelectedMatchId(e.target.value)}
              className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-white/10 bg-[#09090B] text-xs text-white"
            >
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <div className="divide-y divide-white/10">
              {matchRegistrations.length === 0 ? (
                <p className="text-xs text-zinc-400 py-3">No active registrations for this match.</p>
              ) : (
                matchRegistrations.map((reg) => {
                  const maxBracketSlots = selectedTournament?.maxSlots ?? MAX_TOURNAMENT_SLOTS;
                  const draftSlot = regSlotDrafts[reg.id] ?? reg.slotNumber;
                  return (
                    <div key={reg.id} className="py-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate">
                            Slot #{reg.slotNumber} · {reg.freeFireIgn}
                          </p>
                          <p className="text-zinc-400 font-mono-tabular">UID: {reg.freeFireUid}</p>
                        </div>
                        {selectedTournament && (
                          <button
                            type="button"
                            onClick={() =>
                              adminRemoveRegistration(reg, selectedTournament)
                                .then(() => onToast('Registration removed.'))
                                .catch((err) =>
                                  onToast(err instanceof Error ? err.message : 'Remove failed.')
                                )
                            }
                            className="min-h-[36px] px-2.5 rounded-md border border-[#E11D48]/30 text-[#F43F5E] hover:bg-[#E11D48]/10 shrink-0"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <label htmlFor={`reg-slot-${reg.id}`} className="text-[11px] text-zinc-400">
                          Slot #
                        </label>
                        <input
                          id={`reg-slot-${reg.id}`}
                          type="number"
                          min={1}
                          max={maxBracketSlots}
                          value={draftSlot}
                          onChange={(e) =>
                            setRegSlotDrafts((prev) => ({
                              ...prev,
                              [reg.id]: Number(e.target.value),
                            }))
                          }
                          className="w-20 min-h-[36px] px-2.5 py-1 rounded-md border border-white/10 bg-[#09090B] text-xs font-mono-tabular text-white"
                        />
                        <button
                          type="button"
                          disabled={savingRegSlotId === reg.id || draftSlot === reg.slotNumber}
                          onClick={() => void handleSaveParticipantSlot(reg, maxBracketSlots)}
                          className="min-h-[36px] px-3 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-semibold text-white"
                        >
                          {savingRegSlotId === reg.id ? 'Saving...' : 'Move Slot'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. WITHDRAWALS MANAGEMENT (100 Coins = ₹10) */}
      {section === 'withdrawals' && (
        <div className="rounded-xl border border-white/10 bg-[#121216] p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
                <Wallet className="w-5 h-5 text-amber-400" />
                Player Withdrawal Requests (100 Coins = ₹10)
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Approve paid payouts or reject to automatically refund Spider Coins to the player wallet.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['all', 'pending', 'approved', 'rejected'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setWithdrawalFilter(st)}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold capitalize ${
                    withdrawalFilter === st
                      ? 'bg-[#E11D48] text-white'
                      : 'bg-[#09090B] text-zinc-400 border border-white/10 hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {visibleWithdrawals.length === 0 ? (
            <p className="text-xs text-zinc-400 py-6 text-center">
              No withdrawal requests match the selected filter.
            </p>
          ) : (
            <div className="divide-y divide-white/10">
              {visibleWithdrawals.map((wd) => (
                <div key={wd.id} className="py-4 space-y-3 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-white">
                        {wd.username} · {formatRupees(wd.rupees)} ({wd.coins.toLocaleString()} Coins)
                      </p>
                      <p className="text-zinc-400 font-mono-tabular">
                        FF UID: {wd.freeFireUid} · {wd.method.toUpperCase()}: {wd.destination} ·{' '}
                        {new Date(wd.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={`font-semibold capitalize shrink-0 ${
                        wd.status === 'approved'
                          ? 'text-emerald-400'
                          : wd.status === 'rejected'
                            ? 'text-[#F43F5E]'
                            : 'text-amber-400'
                      }`}
                    >
                      {wd.status}
                    </span>
                  </div>

                  {wd.status === 'pending' ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        aria-label={`Admin note for ${wd.username}`}
                        value={withdrawalNotes[wd.id] ?? ''}
                        onChange={(e) =>
                          setWithdrawalNotes((prev) => ({ ...prev, [wd.id]: e.target.value }))
                        }
                        placeholder="Optional UTR / Payout Reference or Rejection Reason"
                        className="flex-1 min-w-[220px] min-h-[38px] px-3 py-1.5 rounded-lg border border-white/10 bg-[#09090B] text-xs text-white"
                      />
                      <button
                        type="button"
                        disabled={processingWdId === wd.id}
                        onClick={() => void handleProcessWithdrawal(wd, 'approved')}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                      >
                        Approve &amp; Mark Paid
                      </button>
                      <button
                        type="button"
                        disabled={processingWdId === wd.id}
                        onClick={() => void handleProcessWithdrawal(wd, 'rejected')}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[#E11D48]/50 text-[#F43F5E] hover:bg-[#E11D48]/10 text-xs font-semibold"
                      >
                        Reject &amp; Refund Coins
                      </button>
                    </div>
                  ) : (
                    wd.adminNote && (
                      <p className="text-zinc-300 bg-[#09090B] rounded px-3 py-1.5 border border-white/5">
                        Note: {wd.adminNote}
                      </p>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. APP, ANNOUNCEMENTS, NOTIFICATIONS & ADMOB SETTINGS */}
      {section === 'app' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await adminPublishAnnouncement({
                title: annTitle,
                message: annMessage,
                priority: annPriority,
              });
              setAnnTitle('');
              setAnnMessage('');
              onToast('Announcement published to Home feed.');
            }}
            className="rounded-xl border border-white/10 bg-[#121216] p-5 space-y-3.5"
          >
            <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-[#E11D48]" />
              Publish Community Announcement
            </h2>
            <input
              type="text"
              required
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
              placeholder="Announcement headline"
              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
            />
            <textarea
              required
              rows={3}
              value={annMessage}
              onChange={(e) => setAnnMessage(e.target.value)}
              placeholder="Announcement details..."
              className="w-full p-3 rounded-lg border border-white/10 bg-[#09090B] text-xs text-white"
            />
            <select
              value={annPriority}
              onChange={(e) => setAnnPriority(e.target.value as 'normal' | 'high')}
              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-xs text-white"
            >
              <option value="normal">Normal Priority</option>
              <option value="high">High Priority</option>
            </select>
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white"
            >
              Publish Announcement
            </button>
          </form>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await adminSendNotification({
                userId: notifUserId,
                title: notifTitle,
                body: notifBody,
                type: notifType,
              });
              setNotifTitle('');
              setNotifBody('');
              onToast('Notification dispatched.');
            }}
            className="rounded-xl border border-white/10 bg-[#121216] p-5 space-y-3.5"
          >
            <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-[#E11D48]" />
              Send Push / In-App Notification
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={notifUserId}
                onChange={(e) => setNotifUserId(e.target.value)}
                placeholder="'all' or Player UID"
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-xs text-white"
              />
              <select
                value={notifType}
                onChange={(e) => setNotifType(e.target.value as NotificationItem['type'])}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-xs text-white"
              >
                <option value="tournament">New Tournament</option>
                <option value="reminder">Match Reminder</option>
                <option value="room">Room Ready</option>
                <option value="cancellation">Cancellation</option>
                <option value="result">Published Results</option>
                <option value="withdrawal">Withdrawal Update</option>
              </select>
            </div>
            <input
              type="text"
              required
              value={notifTitle}
              onChange={(e) => setNotifTitle(e.target.value)}
              placeholder="Notification title"
              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
            />
            <input
              type="text"
              required
              value={notifBody}
              onChange={(e) => setNotifBody(e.target.value)}
              placeholder="Notification message"
              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-xs text-white"
            />
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/15 text-xs font-semibold text-white"
            >
              Send Notification
            </button>
          </form>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setAdMobError(null);
              const parsedCooldown = Math.floor(Number(interstitialCooldownSeconds));
              const err =
                validateAdMobAppId(adMobAppId) ||
                validateAdMobUnitId(bannerUnit, 'Banner Ad Unit ID') ||
                validateAdMobUnitId(interstitialUnit, 'Interstitial Ad Unit ID') ||
                validateAdMobUnitId(rewardedUnit, 'Rewarded Ad Unit ID') ||
                validateAdSenseClientId(adSenseClientId) ||
                validateInterstitialCooldownSeconds(parsedCooldown);
              if (err) {
                setAdMobError(err);
                return;
              }
              await adminUpdateSettings({
                id: 'default',
                adMobMode,
                adMobAppId: adMobAppId.trim(),
                adSenseClientId: adSenseClientId.trim(),
                bannerAdUnitId: bannerUnit.trim(),
                interstitialAdUnitId: interstitialUnit.trim(),
                rewardedAdUnitId: rewardedUnit.trim(),
                bannerAdsEnabled,
                interstitialAdsEnabled,
                rewardedAdsEnabled,
                interstitialCooldownSeconds: parsedCooldown,
                bannerPlacement,
                featuredAnnouncement: featuredAnn.trim(),
                maintenanceMode: false,
              });
              onToast('AdMob & platform settings updated in Firestore.');
            }}
            className="lg:col-span-2 rounded-xl border border-white/10 bg-[#121216] p-5 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold text-white">
                  Google AdMob Configuration &amp; Banner Controls
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Runtime Bridge:{' '}
                  <span className="text-zinc-200 font-medium">
                    {getAdMobRuntimeLabel(detectAdMobRuntime())}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setAdMobError(null);
                    setAdMobMode('test');
                    setAdMobAppId(ADMOB_OFFICIAL_TEST_IDS.appId);
                    setBannerUnit(ADMOB_OFFICIAL_TEST_IDS.banner);
                    setInterstitialUnit(ADMOB_OFFICIAL_TEST_IDS.interstitial);
                    setRewardedUnit(ADMOB_OFFICIAL_TEST_IDS.rewarded);
                    onToast('Filled official Google AdMob Test App ID & Unit IDs.');
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-white/15 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white"
                >
                  Fill Official Google Test IDs
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdMobError(null);
                    setAdMobMode('production');
                    setAdMobAppId(ADMOB_PRODUCTION_CREDENTIALS.appId);
                    setBannerUnit(ADMOB_PRODUCTION_CREDENTIALS.banner);
                    setInterstitialUnit(ADMOB_PRODUCTION_CREDENTIALS.interstitial);
                    setRewardedUnit(ADMOB_PRODUCTION_CREDENTIALS.rewarded);
                    onToast('Filled Spider Esports Production AdMob IDs.');
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[#E11D48]/50 bg-[#E11D48]/15 hover:bg-[#E11D48]/25 text-xs font-semibold text-white"
                >
                  Fill Production IDs ({ADMOB_PRODUCTION_CREDENTIALS.publisherId})
                </button>
              </div>
            </div>

            {adMobError && (
              <div
                role="alert"
                className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
              >
                {adMobError}
              </div>
            )}

            {/* Separate Web/PWA & Native Android Ad Integration Status Monitors */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Web / PWA Browser Preview Monitor */}
              <div className="rounded-lg border border-white/10 bg-[#09090B] p-3.5 space-y-2.5 text-xs tabular-nums">
                <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                  <span className="font-semibold text-white">Web / PWA Preview Status</span>
                  <span className="text-[11px] font-medium text-amber-300 capitalize">
                    {adMobStatus.webPwa.status}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[11px] text-zinc-400">Banner Slot</p>
                    <p className="font-semibold text-zinc-100 capitalize mt-0.5">
                      {adMobStatus.webPwa.banner}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-400">Interstitial</p>
                    <p className="font-semibold text-zinc-300 mt-0.5">
                      {adMobStatus.webPwa.interstitial}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-400">Rewarded</p>
                    <p className="font-semibold text-zinc-300 mt-0.5">
                      {adMobStatus.webPwa.rewarded}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  {adMobStatus.webPwa.message}
                </p>
              </div>

              {/* Native Android AdMob SDK Monitor */}
              <div className="rounded-lg border border-white/10 bg-[#09090B] p-3.5 space-y-2.5 text-xs tabular-nums">
                <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                  <span className="font-semibold text-white">Android Native SDK Status</span>
                  <span className="text-[11px] font-medium text-zinc-300">
                    {adMobStatus.android.isTestMode ? 'Test Mode' : 'Production'} ·{' '}
                    <span className="capitalize text-white">{adMobStatus.android.sdkState}</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <p className="text-[11px] text-zinc-400">UMP Consent</p>
                    <p className="font-semibold text-white mt-0.5">
                      {adMobStatus.android.consentStatus}{' '}
                      {adMobStatus.android.canRequestAds ? '(OK)' : '(Pending)'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-400">Banner State</p>
                    <p
                      className={`font-semibold capitalize mt-0.5 ${
                        adMobStatus.android.bannerState === 'loaded' ||
                        adMobStatus.android.bannerState === 'displayed'
                          ? 'text-emerald-300'
                          : adMobStatus.android.bannerState === 'failed'
                            ? 'text-rose-300'
                            : 'text-zinc-200'
                      }`}
                    >
                      {adMobStatus.android.bannerState}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-400">Interstitial</p>
                    <p
                      className={`font-semibold capitalize mt-0.5 ${
                        adMobStatus.android.interstitialState === 'loaded' ||
                        adMobStatus.android.interstitialState === 'displayed'
                          ? 'text-emerald-300'
                          : adMobStatus.android.interstitialState === 'failed'
                            ? 'text-rose-300'
                            : 'text-zinc-200'
                      }`}
                    >
                      {adMobStatus.android.interstitialState}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-400">Rewarded</p>
                    <p
                      className={`font-semibold capitalize mt-0.5 ${
                        adMobStatus.android.rewardedState === 'loaded' ||
                        adMobStatus.android.rewardedState === 'displayed'
                          ? 'text-emerald-300'
                          : adMobStatus.android.rewardedState === 'failed'
                            ? 'text-rose-300'
                            : 'text-zinc-200'
                      }`}
                    >
                      {adMobStatus.android.rewardedState}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Format states stay <span className="text-zinc-200 font-medium">idle</span> until an actual ad request succeeds (<span className="text-zinc-200 font-medium">loaded</span>); SDK init never marks ads ready.
                </p>
              </div>
            </div>

            {/* SDK Initialization & Ad Loading Errors Panel */}
            {(adMobStatus.android.sdkError ||
              adMobStatus.android.bannerError ||
              adMobStatus.android.interstitialError ||
              adMobStatus.android.rewardedError) && (
              <div
                role="alert"
                className="rounded-lg border border-rose-500/35 bg-rose-500/10 p-3.5 space-y-1.5 text-xs text-rose-200"
              >
                <p className="font-semibold text-rose-100">
                  AdMob SDK &amp; Ad Loading Errors
                </p>
                {adMobStatus.android.sdkError && (
                  <p>SDK Init / Consent: {adMobStatus.android.sdkError}</p>
                )}
                {adMobStatus.android.bannerError && (
                  <p>Banner Load: {adMobStatus.android.bannerError}</p>
                )}
                {adMobStatus.android.interstitialError && (
                  <p>Interstitial Load/Show: {adMobStatus.android.interstitialError}</p>
                )}
                {adMobStatus.android.rewardedError && (
                  <p>Rewarded Load/Show: {adMobStatus.android.rewardedError}</p>
                )}
              </div>
            )}

            {/* Ad Format Feature Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#09090B] px-3.5 py-2.5 cursor-pointer">
                <div>
                  <span className="block text-xs font-semibold text-white">Banner Ads</span>
                  <span className="block text-[11px] text-zinc-400">Adaptive non-overlapping footer</span>
                </div>
                <input
                  type="checkbox"
                  checked={bannerAdsEnabled}
                  onChange={(e) => setBannerAdsEnabled(e.target.checked)}
                  className="h-4 w-4 accent-[#E11D48]"
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#09090B] px-3.5 py-2.5 cursor-pointer">
                <div>
                  <span className="block text-xs font-semibold text-white">Interstitial Ads</span>
                  <span className="block text-[11px] text-zinc-400">Natural breaks only</span>
                </div>
                <input
                  type="checkbox"
                  checked={interstitialAdsEnabled}
                  onChange={(e) => setInterstitialAdsEnabled(e.target.checked)}
                  className="h-4 w-4 accent-[#E11D48]"
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#09090B] px-3.5 py-2.5 cursor-pointer">
                <div>
                  <span className="block text-xs font-semibold text-white">Rewarded Ads</span>
                  <span className="block text-[11px] text-zinc-400">Withdrawals &amp; cosmetic emblem</span>
                </div>
                <input
                  type="checkbox"
                  checked={rewardedAdsEnabled}
                  onChange={(e) => setRewardedAdsEnabled(e.target.checked)}
                  className="h-4 w-4 accent-[#E11D48]"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="admob-mode" className="block text-xs text-zinc-300 mb-1">
                  AdMob Environment
                </label>
                <select
                  id="admob-mode"
                  value={adMobMode}
                  onChange={(e) => setAdMobMode(e.target.value as 'test' | 'production')}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
                >
                  <option value="test">Test Mode (Enforces Official Google Test IDs)</option>
                  <option value="production">Production Mode (Live AdMob Unit IDs)</option>
                </select>
              </div>
              <div>
                <label htmlFor="feat-banner" className="block text-xs text-zinc-300 mb-1">
                  Promotional Banner Headline
                </label>
                <input
                  id="feat-banner"
                  type="text"
                  value={featuredAnn}
                  onChange={(e) => setFeaturedAnn(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="banner-placement" className="block text-xs text-zinc-300 mb-1">
                  Banner Ad Placement Screens
                </label>
                <select
                  id="banner-placement"
                  value={bannerPlacement}
                  onChange={(e) => setBannerPlacement(e.target.value as AdBannerPlacement)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
                >
                  <option value="all_screens">All Content Screens (Home, Matches, Results, Ranks, Profile)</option>
                  <option value="home_and_matches">Home &amp; Match Listings Only</option>
                  <option value="home_only">Home Screen Only</option>
                </select>
              </div>
              <div>
                <label htmlFor="interstitial-cooldown" className="block text-xs text-zinc-300 mb-1">
                  Interstitial Cooldown ({MIN_INTERSTITIAL_COOLDOWN_SECONDS}–{MAX_INTERSTITIAL_COOLDOWN_SECONDS} seconds)
                </label>
                <input
                  id="interstitial-cooldown"
                  type="number"
                  min={MIN_INTERSTITIAL_COOLDOWN_SECONDS}
                  max={MAX_INTERSTITIAL_COOLDOWN_SECONDS}
                  step={5}
                  value={interstitialCooldownSeconds}
                  onChange={(e) => setInterstitialCooldownSeconds(Number(e.target.value))}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm font-mono-tabular text-white"
                />
              </div>
              <div>
                <label htmlFor="admob-app-id" className="block text-xs text-zinc-300 mb-1">
                  AdMob App ID (~)
                </label>
                <input
                  id="admob-app-id"
                  type="text"
                  placeholder="ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY"
                  value={adMobAppId}
                  onChange={(e) => setAdMobAppId(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-xs font-mono-tabular text-white"
                />
              </div>
              <div>
                <label htmlFor="adsense-client-id" className="block text-xs text-zinc-300 mb-1">
                  Web AdSense Publisher ID (Optional)
                </label>
                <input
                  id="adsense-client-id"
                  type="text"
                  placeholder="ca-pub-XXXXXXXXXXXXXXXX"
                  value={adSenseClientId}
                  onChange={(e) => setAdSenseClientId(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-xs font-mono-tabular text-white"
                />
              </div>
              <div>
                <label htmlFor="unit-banner" className="block text-xs text-zinc-300 mb-1">
                  Banner Ad Unit ID (/)
                </label>
                <input
                  id="unit-banner"
                  type="text"
                  placeholder="ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY"
                  value={bannerUnit}
                  onChange={(e) => setBannerUnit(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-xs font-mono-tabular text-white"
                />
              </div>
              <div>
                <label htmlFor="unit-inter" className="block text-xs text-zinc-300 mb-1">
                  Interstitial Ad Unit ID (/)
                </label>
                <input
                  id="unit-inter"
                  type="text"
                  placeholder="ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY"
                  value={interstitialUnit}
                  onChange={(e) => setInterstitialUnit(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-xs font-mono-tabular text-white"
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="unit-rew" className="block text-xs text-zinc-300 mb-1">
                  Rewarded Ad Unit ID (/)
                </label>
                <input
                  id="unit-rew"
                  type="text"
                  placeholder="ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY"
                  value={rewardedUnit}
                  onChange={(e) => setRewardedUnit(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-xs font-mono-tabular text-white"
                />
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#09090B] p-3.5 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-white">
                    Play Store app-ads.txt Verification Line
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Hosted at <span className="font-mono-tabular text-zinc-300">/app-ads.txt</span>. Update{' '}
                    <span className="font-mono-tabular text-zinc-300">public/app-ads.txt</span> with this line before publishing live ads:
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const line = buildAppAdsTxtLine(adMobAppId || bannerUnit);
                    void navigator.clipboard?.writeText(line).then(() => {
                      setCopiedAppAdsTxt(true);
                      onToast('Copied app-ads.txt verification line.');
                      window.setTimeout(() => setCopiedAppAdsTxt(false), 2500);
                    });
                  }}
                  className="min-h-[34px] px-3 rounded-lg border border-white/15 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white shrink-0"
                >
                  {copiedAppAdsTxt ? 'Copied' : 'Copy app-ads.txt'}
                </button>
              </div>
              <code className="block rounded bg-[#121216] border border-white/5 px-3 py-2 text-[11px] font-mono-tabular text-emerald-300 break-all">
                {buildAppAdsTxtLine(adMobAppId || bannerUnit)}
              </code>
            </div>

            <button
              type="submit"
              className="min-h-[44px] px-6 py-2 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white"
            >
              Save AdMob Configuration
            </button>
          </form>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const err = validateAdminPassword(newAdminPassword, confirmAdminPassword);
              if (err) {
                onToast(err);
                return;
              }
              setSavingAdminPassword(true);
              try {
                await setOrUpdateAppPassword(newAdminPassword, confirmAdminPassword);
                setNewAdminPassword('');
                setConfirmAdminPassword('');
                onToast('Admin login password updated successfully.');
              } catch (error) {
                onToast(error instanceof Error ? error.message : 'Unable to update password.');
              } finally {
                setSavingAdminPassword(false);
              }
            }}
            className="lg:col-span-2 rounded-xl border border-white/10 bg-[#121216] p-5 space-y-4"
          >
            <div>
              <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-[#E11D48]" />
                Admin App Password ({SOLE_ADMIN_EMAIL})
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Admin access requires signing in with your verified email and this app password.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="adm-new-pass" className="block text-xs text-zinc-300 mb-1">
                  New Password
                </label>
                <input
                  id="adm-new-pass"
                  type="password"
                  required
                  minLength={8}
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  placeholder="8+ chars, letter + number"
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="adm-confirm-pass" className="block text-xs text-zinc-300 mb-1">
                  Confirm New Password
                </label>
                <input
                  id="adm-confirm-pass"
                  type="password"
                  required
                  minLength={8}
                  value={confirmAdminPassword}
                  onChange={(e) => setConfirmAdminPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={savingAdminPassword}
              className="min-h-[44px] px-6 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/15 text-xs font-semibold text-white"
            >
              {savingAdminPassword ? 'Updating...' : 'Update Admin Password'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
