import { useEffect, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  KeyRound,
  Lock,
  Shield,
  ShieldCheck,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import type {
  AdminSettings,
  MatchCredential,
  MatchInfo,
  Registration,
  TeammateInput,
  Tournament,
  TournamentResult,
  UserProfile,
} from '../types/esports';
import {
  canCancelRegistration,
  canJoinTournament,
  canViewRoomCredentials,
  getModeDefinition,
  validateFreeFireIgn,
  validateFreeFireUid,
  validateTeammates,
} from '../utils/tournamentRules';
import {
  cancelTournamentRegistration,
  fetchProtectedRoomCredentials,
  joinTournamentInFirestore,
  subscribeTournamentRegistrations,
} from '../lib/firestoreService';
import { preloadInterstitialAd } from '../lib/admobBridge';
import { BRAND_ASSETS } from '../lib/seedData';
import { AdMobBannerSlot } from './AdMobUnits';

interface MatchDetailsModalProps {
  tournament: Tournament | null;
  matchInfo?: MatchInfo;
  result?: TournamentResult;
  profile: UserProfile | null;
  isSignedIn: boolean;
  isEmailVerified: boolean;
  isAdmin: boolean;
  adminSettings: AdminSettings;
  consentAccepted: boolean;
  onAfterJoinConfirmation?: () => void;
  onClose: () => void;
  onRequireAuth: () => void;
  onSuccessToast: (msg: string) => void;
}

export function MatchDetailsModal({
  tournament,
  matchInfo,
  result,
  profile,
  isSignedIn,
  isEmailVerified,
  isAdmin,
  adminSettings,
  consentAccepted,
  onAfterJoinConfirmation,
  onClose,
  onRequireAuth,
  onSuccessToast,
}: MatchDetailsModalProps) {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [freeFireIgn, setFreeFireIgn] = useState('');
  const [freeFireUid, setFreeFireUid] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teammates, setTeammates] = useState<TeammateInput[]>([]);
  const [credentials, setCredentials] = useState<MatchCredential | null>(null);
  const [credError, setCredError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copiedField, setCopiedField] = useState<'id' | 'pass' | null>(null);
  const [bannerImgError, setBannerImgError] = useState(false);
  const [justJoined, setJustJoined] = useState<{
    tournamentId: string;
    slotNumber: number;
    nextFilledSlots: number;
    freeFireIgn: string;
    freeFireUid: string;
    teamName?: string;
  } | null>(null);

  useEffect(() => {
    setBannerImgError(false);
  }, [tournament?.bannerUrl]);

  useEffect(() => {
    if (!tournament) return;
    setFormError(null);
    setCredError(null);
    setCredentials(null);
    setJustJoined((prev) => (prev?.tournamentId === tournament.id ? prev : null));
    setFreeFireIgn(profile?.freeFireIgn || '');
    setFreeFireUid(profile?.freeFireUid || '');
    setTeamName('');

    const def = getModeDefinition(tournament.mode);
    setTeammates(
      Array.from({ length: def.requiredTeammates }, () => ({ ign: '', uid: '' }))
    );

    const unsub = subscribeTournamentRegistrations(tournament.id, (items) => {
      setRegistrations(items);
    });
    void preloadInterstitialAd(adminSettings, consentAccepted);
    return () => unsub();
  }, [tournament?.id, profile, adminSettings, consentAccepted]);

  const myRegistration = profile
    ? registrations.find((r) => r.userId === profile.uid && r.status === 'confirmed')
    : undefined;

  useEffect(() => {
    if (myRegistration && justJoined?.tournamentId === myRegistration.tournamentId) {
      setJustJoined(null);
    }
  }, [myRegistration, justJoined?.tournamentId]);

  const isRegistered = Boolean(myRegistration);
  const effectiveRegistered =
    isRegistered || (tournament !== null && justJoined?.tournamentId === tournament.id);

  const roomGate = tournament
    ? canViewRoomCredentials({
        isAdmin,
        isRegistered: effectiveRegistered,
        credentialsPublished: Boolean(matchInfo?.credentialsPublished),
        credentialsReleaseAt: matchInfo?.credentialsReleaseAt || tournament.credentialsReleaseAt,
      })
    : { visible: false, reason: '' };

  useEffect(() => {
    if (!tournament || !roomGate.visible || !isSignedIn) return;
    let active = true;
    fetchProtectedRoomCredentials(tournament.id)
      .then((creds) => {
        if (active) setCredentials(creds);
      })
      .catch(() => {
        if (active) setCredError('Room credentials are locked until release time.');
      });
    return () => {
      active = false;
    };
  }, [tournament, roomGate.visible, isSignedIn]);

  if (!tournament) return null;

  const modeDef = getModeDefinition(tournament.mode);
  const optimisticJoined = justJoined?.tournamentId === tournament.id ? justJoined : null;
  const displayFilledSlots = Math.min(
    tournament.maxSlots,
    Math.max(tournament.filledSlots, optimisticJoined ? optimisticJoined.nextFilledSlots : 0)
  );
  const availableSlots = Math.max(0, tournament.maxSlots - displayFilledSlots);
  const fallbackBanner =
    tournament.category === 'Clash Squad'
      ? BRAND_ASSETS.clashSquadBanner
      : tournament.category === 'Lone Wolf'
        ? BRAND_ASSETS.loneWolfBanner
        : BRAND_ASSETS.battleRoyaleBanner;

  const joinEligibility = canJoinTournament({
    tournament: { ...tournament, filledSlots: displayFilledSlots },
    alreadyRegistered: effectiveRegistered,
    userSuspended: Boolean(profile?.suspended),
  });
  const cancelEligibility = canCancelRegistration({
    tournament,
    isRegistered: effectiveRegistered,
  });

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!isSignedIn || !profile) {
      onRequireAuth();
      return;
    }
    if (!isEmailVerified) {
      setFormError('Please verify your email address in Profile before joining tournaments.');
      return;
    }

    const ignErr = validateFreeFireIgn(freeFireIgn);
    if (ignErr) {
      setFormError(ignErr);
      return;
    }
    const uidErr = validateFreeFireUid(freeFireUid);
    if (uidErr) {
      setFormError(uidErr);
      return;
    }
    const mateErr = validateTeammates(tournament.mode, teammates, freeFireUid);
    if (mateErr) {
      setFormError(mateErr);
      return;
    }

    setSubmitting(true);
    try {
      const res = await joinTournamentInFirestore({
        tournament,
        profile,
        freeFireIgn,
        freeFireUid,
        teamName: modeDef.requiredTeammates > 0 ? teamName : undefined,
        teammates: modeDef.requiredTeammates > 0 ? teammates : undefined,
      });
      setJustJoined({
        tournamentId: tournament.id,
        slotNumber: res.slotNumber,
        nextFilledSlots: res.nextFilledSlots,
        freeFireIgn: freeFireIgn.trim(),
        freeFireUid: freeFireUid.trim(),
        teamName: modeDef.requiredTeammates > 0 && teamName.trim() ? teamName.trim() : undefined,
      });
      onSuccessToast(`Joined ${tournament.title}! Slot #${res.slotNumber} confirmed.`);
      onAfterJoinConfirmation?.();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to complete registration.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRegistration = async () => {
    if (!profile) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await cancelTournamentRegistration({ tournament, profile });
      setJustJoined(null);
      onSuccessToast('Registration cancelled and slot released.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to cancel registration.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyValue = async (val: string, field: 'id' | 'pass') => {
    try {
      await navigator.clipboard.writeText(val);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1500);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-label={`Match Details for ${tournament.title}`}
    >
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#121216] p-5 sm:p-7 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span className="text-[#F43F5E] font-semibold">{tournament.category}</span>
              <span aria-hidden="true">·</span>
              <span>{tournament.mode}</span>
              <span aria-hidden="true">·</span>
              <span>{tournament.mapName}</span>
              <span aria-hidden="true">·</span>
              <span>FREE ENTRY</span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white">
              {tournament.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close match details"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Match Picture Banner */}
        <div className="relative h-40 sm:h-48 rounded-xl overflow-hidden border border-white/10 bg-[#18181D]">
          {!bannerImgError ? (
            <img
              src={tournament.bannerUrl || fallbackBanner}
              alt={`${tournament.title} banner`}
              referrerPolicy="no-referrer"
              onError={() => setBannerImgError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#18181D] to-[#09090B]">
              <Shield className="w-10 h-10 text-[#E11D48]" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#121216] via-[#121216]/25 to-transparent" />
          {effectiveRegistered && (
            <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              Joined
            </div>
          )}
        </div>

        {/* Key Schedule Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-xl bg-[#09090B] border border-white/10 p-4 text-xs tabular-nums">
          <div>
            <p className="text-zinc-400">Match Date</p>
            <p className="text-white font-semibold mt-1">{tournament.matchDate}</p>
          </div>
          <div>
            <p className="text-zinc-400">Match Time</p>
            <p className="text-white font-semibold mt-1">{tournament.matchTime}</p>
          </div>
          <div>
            <p className="text-zinc-400">Filled Slots</p>
            <p className="text-white font-semibold mt-1">
              {displayFilledSlots} / {tournament.maxSlots} ({availableSlots} open)
            </p>
          </div>
          <div>
            <p className="text-zinc-400">Match Reward</p>
            <p className="text-amber-400 font-semibold mt-1">
              +{tournament.coinReward.toLocaleString()} Coins
              {tournament.perKillCoins > 0 ? ` · +${tournament.perKillCoins}/kill` : ''}
            </p>
          </div>
        </div>

        {/* Room Credentials Gate */}
        <section className="rounded-xl border border-white/10 bg-[#09090B] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              {roomGate.visible ? (
                <KeyRound className="w-4 h-4 text-emerald-400" />
              ) : (
                <Lock className="w-4 h-4 text-zinc-400" />
              )}
              Custom Room Credentials
            </h3>
            <span className="text-xs text-zinc-400 inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Release: {new Date(tournament.credentialsReleaseAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {!roomGate.visible ? (
            <p className="text-xs text-zinc-400">{roomGate.reason}</p>
          ) : credentials ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="rounded-lg border border-white/10 bg-[#121216] p-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-zinc-400">Room ID</p>
                  <p className="font-mono-tabular text-base font-bold text-white">{credentials.roomId}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copyValue(credentials.roomId, 'id')}
                  aria-label="Copy Room ID"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-md hover:bg-white/5 text-zinc-300"
                >
                  {copiedField === 'id' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#121216] p-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-zinc-400">Password</p>
                  <p className="font-mono-tabular text-base font-bold text-white">{credentials.roomPassword}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copyValue(credentials.roomPassword, 'pass')}
                  aria-label="Copy Room Password"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-md hover:bg-white/5 text-zinc-300"
                >
                  {copiedField === 'pass' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-400">
              {credError || 'Room credentials are being prepared by the tournament administrator.'}
            </p>
          )}
        </section>

        {/* Registration Confirmation OR Registration Form */}
        {effectiveRegistered ? (
          <section className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
                <ShieldCheck className="w-5 h-5" />
                Joined Match · Slot #{myRegistration?.slotNumber ?? optimisticJoined?.slotNumber}
              </div>
              {cancelEligibility.allowed && (
                <button
                  type="button"
                  disabled={submitting || !myRegistration}
                  onClick={handleCancelRegistration}
                  className="min-h-[40px] px-4 py-1.5 rounded-lg border border-white/15 bg-black/40 hover:bg-black/60 disabled:opacity-50 text-xs font-semibold text-zinc-200"
                >
                  {submitting ? 'Cancelling...' : 'Cancel Registration'}
                </button>
              )}
            </div>
            <p className="text-xs text-zinc-300">
              Registered IGN:{' '}
              <strong className="text-white">
                {myRegistration?.freeFireIgn ?? optimisticJoined?.freeFireIgn}
              </strong>{' '}
              · UID:{' '}
              <span className="font-mono-tabular text-white">
                {myRegistration?.freeFireUid ?? optimisticJoined?.freeFireUid}
              </span>
              {(myRegistration?.teamName ?? optimisticJoined?.teamName)
                ? ` · Team: ${myRegistration?.teamName ?? optimisticJoined?.teamName}`
                : ''}
            </p>
            {!cancelEligibility.allowed && cancelEligibility.reason && (
              <p className="text-xs text-zinc-400">{cancelEligibility.reason}</p>
            )}
          </section>
        ) : (
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-white">Tournament Registration</h3>
            {!isSignedIn ? (
              <div className="rounded-xl border border-white/10 bg-[#09090B] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-xs text-zinc-300">
                  Sign in with your verified SPIDER ESPORTS account to reserve a free tournament slot.
                </p>
                <button
                  type="button"
                  onClick={onRequireAuth}
                  className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white shrink-0"
                >
                  Sign In to Join
                </button>
              </div>
            ) : !joinEligibility.allowed ? (
              <div className="rounded-xl border border-white/10 bg-[#09090B] p-4 text-xs text-zinc-400">
                {joinEligibility.reason}
              </div>
            ) : (
              <form onSubmit={handleJoinSubmit} className="space-y-4 rounded-xl border border-white/10 bg-[#09090B] p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="join-ign" className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Free Fire In-Game Name (IGN)
                    </label>
                    <input
                      id="join-ign"
                      type="text"
                      required
                      value={freeFireIgn}
                      onChange={(e) => setFreeFireIgn(e.target.value)}
                      placeholder="e.g. SpiderVenom"
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#121216] text-sm text-white focus:outline-none focus:border-[#E11D48]"
                    />
                  </div>
                  <div>
                    <label htmlFor="join-uid" className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Free Fire UID
                    </label>
                    <input
                      id="join-uid"
                      type="text"
                      required
                      inputMode="numeric"
                      value={freeFireUid}
                      onChange={(e) => setFreeFireUid(e.target.value)}
                      placeholder="e.g. 2049581723"
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#121216] text-sm font-mono-tabular text-white focus:outline-none focus:border-[#E11D48]"
                    />
                  </div>
                </div>

                {modeDef.requiredTeammates > 0 && (
                  <div className="space-y-3 pt-2 border-t border-white/10">
                    <div>
                      <label htmlFor="join-team" className="block text-xs font-medium text-zinc-300 mb-1.5">
                        Team / Squad Name (Optional)
                      </label>
                      <input
                        id="join-team"
                        type="text"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        placeholder="e.g. Arachnid Five"
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#121216] text-sm text-white focus:outline-none focus:border-[#E11D48]"
                      />
                    </div>
                    <p className="text-xs font-medium text-zinc-400">
                      Required Teammates ({modeDef.requiredTeammates})
                    </p>
                    {teammates.map((mate, idx) => (
                      <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          required
                          aria-label={`Teammate ${idx + 1} IGN`}
                          value={mate.ign}
                          onChange={(e) => {
                            const next = [...teammates];
                            next[idx] = { ...next[idx], ign: e.target.value };
                            setTeammates(next);
                          }}
                          placeholder={`Teammate ${idx + 1} IGN`}
                          className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#121216] text-sm text-white focus:outline-none focus:border-[#E11D48]"
                        />
                        <input
                          type="text"
                          required
                          inputMode="numeric"
                          aria-label={`Teammate ${idx + 1} UID`}
                          value={mate.uid}
                          onChange={(e) => {
                            const next = [...teammates];
                            next[idx] = { ...next[idx], uid: e.target.value };
                            setTeammates(next);
                          }}
                          placeholder={`Teammate ${idx + 1} UID`}
                          className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#121216] text-sm font-mono-tabular text-white focus:outline-none focus:border-[#E11D48]"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {formError && (
                  <p role="alert" className="text-xs text-[#F43F5E] font-medium">
                    {formError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[48px] px-5 py-3 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] disabled:opacity-50 text-sm font-semibold text-white transition-colors"
                >
                  {submitting ? 'Confirming Slot...' : 'Confirm Free Entry'}
                </button>
              </form>
            )}
          </section>
        )}

        {/* Match Rules */}
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold text-white">Match Rules &amp; Format</h3>
          <ul className="space-y-1.5 text-xs text-zinc-300 list-disc pl-5">
            {tournament.rules.map((rule, i) => (
              <li key={i} className="leading-relaxed">
                {rule}
              </li>
            ))}
          </ul>
        </section>

        {/* Official Verified Results if Completed */}
        {result && (
          <section className="space-y-3 rounded-xl border border-white/10 bg-[#09090B] p-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#E11D48]" />
              Official Verified Standings
            </h3>
            <div className="divide-y divide-white/10 text-xs tabular-nums">
              {result.standings.map((row) => (
                <div key={row.rank} className="py-2 flex items-center justify-between">
                  <span className="text-zinc-200 font-medium">
                    #{row.rank} · {row.playerName}
                  </span>
                  <span className="text-zinc-400">
                    {row.kills} kills
                    {typeof row.coinsAwarded === 'number' && row.coinsAwarded > 0 ? (
                      <>
                        {' · '}
                        <strong className="text-amber-400">+{row.coinsAwarded.toLocaleString()} Coins</strong>
                      </>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Registered Participants */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-zinc-400" />
            Registered Participants ({registrations.length})
          </h3>
          {registrations.length === 0 ? (
            <p className="text-xs text-zinc-400">No registered participants yet — be the first to claim Slot #1.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {registrations.map((reg) => (
                <div
                  key={reg.id}
                  className="rounded-lg border border-white/10 bg-[#09090B] px-3.5 py-2.5 flex items-center justify-between text-xs tabular-nums"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">
                      {reg.teamName ? `${reg.teamName} (${reg.freeFireIgn})` : reg.freeFireIgn}
                    </p>
                    <p className="text-zinc-400 font-mono-tabular">UID: {reg.freeFireUid}</p>
                  </div>
                  <span className="text-zinc-400 shrink-0">Slot #{reg.slotNumber}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Non-overlapping AdMob Banner Slot below registration & participants */}
        <AdMobBannerSlot
          settings={adminSettings}
          screen="matches"
          placementLabel="Match Join & Details Sponsor"
          consentAccepted={consentAccepted}
        />
      </div>
    </div>
  );
}
