import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Megaphone, Trophy, Users } from 'lucide-react';
import type {
  AdminSettings,
  Announcement,
  LeaderboardEntry,
  Tournament,
  TournamentResult,
  UserProfile,
} from '../types/esports';
import { BRAND_ASSETS } from '../lib/seedData';
import { isTodayIsoDate } from '../utils/tournamentRules';
import { sortLeaderboard } from '../utils/coinSystem';
import { TournamentCard } from './TournamentCard';
import { AdMobBannerSlot } from './AdMobUnits';
import type { AppTab } from './Navigation';

interface HomeViewProps {
  profile: UserProfile | null;
  isSignedIn: boolean;
  tournaments: Tournament[];
  results: TournamentResult[];
  announcements: Announcement[];
  leaderboard: LeaderboardEntry[];
  registeredTournamentIds: Set<string>;
  adminSettings: AdminSettings;
  consentAccepted: boolean;
  onAcceptConsent: () => void;
  onSelectTournament: (t: Tournament) => void;
  onNavigateTab: (tab: AppTab) => void;
  onOpenAuth: () => void;
}

export function HomeView({
  profile,
  isSignedIn,
  tournaments,
  results,
  announcements,
  leaderboard,
  registeredTournamentIds,
  adminSettings,
  consentAccepted,
  onAcceptConsent,
  onSelectTournament,
  onNavigateTab,
  onOpenAuth,
}: HomeViewProps) {
  const [avatarError, setAvatarError] = useState(false);
  const [heroImgError, setHeroImgError] = useState(false);

  const featured =
    tournaments.find((t) => t.featured && t.status !== 'cancelled') ||
    tournaments.find((t) => t.status === 'upcoming') ||
    tournaments[0];

  useEffect(() => {
    setHeroImgError(false);
  }, [featured?.bannerUrl]);

  const liveTournaments = tournaments.filter((t) => t.status === 'live');
  const todayTournaments = tournaments.filter(
    (t) => t.status === 'upcoming' && isTodayIsoDate(t.matchDate)
  );
  const upcomingTournaments = tournaments.filter((t) => t.status === 'upcoming').slice(0, 6);
  const completedTournaments = tournaments.filter((t) => t.status === 'completed').slice(0, 3);
  const topPlayers = sortLeaderboard(leaderboard, 'global').slice(0, 5);

  return (
    <div className="space-y-10">
      {/* Welcome Header Strip */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/15 bg-[#121216] shrink-0 flex items-center justify-center">
            {!avatarError ? (
              <img
                src={profile?.avatarUrl || BRAND_ASSETS.defaultAvatar}
                alt={profile?.username || 'Player Avatar'}
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="font-display text-lg font-bold text-[#E11D48]">SP</span>
            )}
          </div>
          <div>
            <p className="text-xs text-zinc-400">
              {isSignedIn ? `Welcome back, ${profile?.username}` : 'Welcome to SPIDER ESPORTS'}
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Free Fire Community Arena
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isSignedIn ? (
            <button
              type="button"
              onClick={onOpenAuth}
              className="min-h-[44px] px-4 py-2 rounded-lg border border-white/15 bg-[#121216] hover:bg-[#18181D] text-xs font-semibold text-white transition-colors"
            >
              Create Player Profile
            </button>
          ) : (
            <div className="flex items-center gap-4 text-xs tabular-nums">
              <div>
                <span className="text-zinc-400">Coins </span>
                <span className="text-amber-400 font-semibold">
                  {(profile?.coins ?? 0).toLocaleString()}
                </span>
              </div>
              <span className="text-zinc-600" aria-hidden="true">·</span>
              <div>
                <span className="text-zinc-400">Wins </span>
                <span className="text-white font-semibold">{profile?.totalWins ?? 0}</span>
              </div>
              <span className="text-zinc-600" aria-hidden="true">·</span>
              <div>
                <span className="text-zinc-400">Kills </span>
                <span className="text-white font-semibold">{profile?.totalKills ?? 0}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Featured Tournament Banner (Single Dominant Anchor) */}
      {featured && (
        <section aria-label="Featured Tournament" className="rounded-2xl border border-white/10 bg-[#121216] overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
            <div className="lg:col-span-7 relative min-h-[240px] lg:min-h-[340px] bg-[#18181D]">
              {!heroImgError ? (
                <img
                  src={featured.bannerUrl || BRAND_ASSETS.battleRoyaleBanner}
                  alt={featured.title}
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#18181D] to-[#09090B]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-[#121216] via-[#121216]/35 to-transparent" />
            </div>

            <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between gap-6">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                  <span className="text-[#F43F5E] font-semibold">Featured Event</span>
                  <span aria-hidden="true">·</span>
                  <span>{featured.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>{featured.mode}</span>
                  {registeredTournamentIds.has(featured.id) && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-400 font-semibold inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Joined
                      </span>
                    </>
                  )}
                </div>

                <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-white leading-[1.08] text-balance">
                  {featured.title}
                </h2>

                <p className="text-sm text-zinc-400 leading-relaxed">
                  100% free community tournament on {featured.mapName}. Room ID and password unlock automatically for verified participants before match start.
                </p>

                <div className="grid grid-cols-3 gap-4 pt-3 border-t border-white/10 text-xs tabular-nums">
                  <div>
                    <p className="text-zinc-400">Date</p>
                    <p className="text-white font-semibold mt-0.5">{featured.matchDate}</p>
                  </div>
                  <div>
                    <p className="text-zinc-400">Kickoff</p>
                    <p className="text-white font-semibold mt-0.5">{featured.matchTime}</p>
                  </div>
                  <div>
                    <p className="text-zinc-400">Slots</p>
                    <p className="text-white font-semibold mt-0.5">
                      {featured.filledSlots}/{featured.maxSlots}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onSelectTournament(featured)}
                  className={`min-h-[48px] px-6 py-3 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
                    registeredTournamentIds.has(featured.id)
                      ? 'bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/40'
                      : 'bg-[#E11D48] hover:bg-[#F43F5E] text-white'
                  }`}
                >
                  {registeredTournamentIds.has(featured.id) && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  )}
                  {registeredTournamentIds.has(featured.id)
                    ? 'Joined · Open Match Room'
                    : 'Join Featured Match'}
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('matches')}
                  className="min-h-[48px] px-4 py-3 rounded-lg border border-white/10 hover:bg-white/5 text-xs font-semibold text-zinc-200 transition-colors"
                >
                  Browse All Modes
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Live Tournaments */}
      {liveTournaments.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">Live Tournaments</h2>
              <p className="text-xs text-zinc-400">Active custom rooms currently underway</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('matches')}
              className="min-h-[40px] px-3 text-xs font-semibold text-[#F43F5E] hover:text-white transition-colors"
            >
              View All
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {liveTournaments.map((t) => (
              <TournamentCard
                key={t.id}
                tournament={t}
                isRegistered={registeredTournamentIds.has(t.id)}
                onSelect={onSelectTournament}
              />
            ))}
          </div>
        </section>
      )}

      {/* Today's & Upcoming Tournaments */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              {todayTournaments.length > 0 ? "Today's & Upcoming Matches" : 'Upcoming Tournaments'}
            </h2>
            <p className="text-xs text-zinc-400">
              Battle Royale, Clash Squad, and Lone Wolf community brackets — always free entry
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('matches')}
            className="min-h-[40px] px-3 text-xs font-semibold text-[#F43F5E] hover:text-white transition-colors"
          >
            All Brackets
          </button>
        </div>

        {upcomingTournaments.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[#121216] p-8 text-center">
            <p className="text-sm text-zinc-300">No upcoming tournaments scheduled right now.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {upcomingTournaments.map((t) => (
              <TournamentCard
                key={t.id}
                tournament={t}
                isRegistered={registeredTournamentIds.has(t.id)}
                onSelect={onSelectTournament}
              />
            ))}
          </div>
        )}
      </section>

      {/* Announcements + Top Players Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Latest Announcements */}
        <div className="lg:col-span-6 rounded-xl border border-white/10 bg-[#121216] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-[#E11D48]" />
              Latest Announcements
            </h2>
          </div>

          <div className="divide-y divide-white/10">
            {announcements.length === 0 ? (
              <p className="py-4 text-sm text-zinc-400">No active announcements.</p>
            ) : (
              announcements.slice(0, 4).map((ann) => (
                <div key={ann.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-white">{ann.title}</h3>
                    <span className="text-[11px] text-zinc-400 shrink-0">
                      {ann.priority === 'high' ? 'Important' : 'Update'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">{ann.message}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Players Leaderboard Preview */}
        <div className="lg:col-span-6 rounded-xl border border-white/10 bg-[#121216] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#E11D48]" />
              Top Players
            </h2>
            <button
              type="button"
              onClick={() => onNavigateTab('leaderboard')}
              className="min-h-[40px] px-2 text-xs font-semibold text-[#F43F5E] hover:text-white"
            >
              Full Rankings
            </button>
          </div>

          <div className="divide-y divide-white/10">
            {topPlayers.map((player, idx) => (
              <div
                key={player.id}
                className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-sm tabular-nums"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 text-xs font-bold text-zinc-400">#{idx + 1}</span>
                  <span className="font-medium text-white truncate">{player.username}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-300 shrink-0">
                  <span className="text-amber-400 font-medium">
                    {(player.coins ?? 0).toLocaleString()} Coins
                  </span>
                  <span>{player.totalWins} W</span>
                  <span>{player.totalKills} K</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recently Completed Matches */}
      {(completedTournaments.length > 0 || results.some((r) => r.verified)) && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">Recently Completed Matches</h2>
              <p className="text-xs text-zinc-400">Verified winners and elimination totals</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('results')}
              className="min-h-[40px] px-3 text-xs font-semibold text-[#F43F5E] hover:text-white transition-colors"
            >
              All Results
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {results
              .filter((r) => r.verified)
              .slice(0, 3)
              .map((res) => (
              <div
                key={res.id}
                className="rounded-xl border border-white/10 bg-[#121216] p-5 space-y-3"
              >
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Verified Result</span>
                  <span className="tabular-nums">{res.totalKills} Eliminations</span>
                </div>
                <h3 className="font-display text-xl font-bold text-white">{res.tournamentTitle}</h3>
                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Champion</span>
                  <span className="font-semibold text-[#F43F5E] inline-flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    {res.winnerName}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* AdMob Banner */}
      <AdMobBannerSlot
        settings={adminSettings}
        screen="home"
        placementLabel="Home Feed Footer"
        consentAccepted={consentAccepted}
        onAcceptConsent={onAcceptConsent}
      />
    </div>
  );
}
