import { useMemo, useState } from 'react';
import { Award, CheckCircle2, Coins, Crown, Search, Swords, Trophy } from 'lucide-react';
import type {
  AdminSettings,
  Registration,
  Tournament,
  TournamentCategory,
  TournamentMode,
  TournamentResult,
  TournamentStatus,
  UserProfile,
} from '../types/esports';
import { BRAND_ASSETS } from '../lib/seedData';
import { CATEGORIES_WITH_MODES } from '../utils/tournamentRules';
import { buildPlayedMatchesWithResults } from '../utils/resultHelpers';
import { TournamentCard } from './TournamentCard';
import { AdMobBannerSlot } from './AdMobUnits';

interface MatchesViewProps {
  tournaments: Tournament[];
  results: TournamentResult[];
  userRegistrations: Registration[];
  profile: UserProfile | null;
  isSignedIn: boolean;
  registeredTournamentIds: Set<string>;
  adminSettings: AdminSettings;
  onSelectTournament: (t: Tournament) => void;
  onNavigateResults: () => void;
  onOpenAuth: () => void;
}

export function MatchesView({
  tournaments,
  results,
  userRegistrations,
  profile,
  isSignedIn,
  registeredTournamentIds,
  adminSettings,
  onSelectTournament,
  onNavigateResults,
  onOpenAuth,
}: MatchesViewProps) {
  const [viewMode, setViewMode] = useState<'all' | 'mine'>('all');
  const [category, setCategory] = useState<'All' | TournamentCategory>('All');
  const [mode, setMode] = useState<'All' | TournamentMode>('All');
  const [statusFilter, setStatusFilter] = useState<'all' | TournamentStatus>('all');
  const [search, setSearch] = useState('');

  const myMatches = useMemo(
    () =>
      isSignedIn
        ? buildPlayedMatchesWithResults({
            registrations: userRegistrations,
            tournaments,
            results,
            userId: profile?.uid,
            username: profile?.username,
            freeFireIgn: profile?.freeFireIgn,
          })
        : [],
    [isSignedIn, userRegistrations, tournaments, results, profile?.uid, profile?.username, profile?.freeFireIgn]
  );

  const activeMyCount = useMemo(
    () => myMatches.filter((m) => m.statusCategory !== 'cancelled').length,
    [myMatches]
  );

  const availableModes: TournamentMode[] = useMemo(() => {
    if (category === 'All') {
      return [
        'Solo',
        'Duo',
        'Squad',
        'CS 1v1',
        'CS 2v2',
        'CS 4v4',
        'Lone Wolf 1v1',
        'Lone Wolf 2v2',
      ];
    }
    return CATEGORIES_WITH_MODES[category];
  }, [category]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tournaments.filter((t) => {
      if (category !== 'All' && t.category !== category) return false;
      if (mode !== 'All' && t.mode !== mode) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (q && !t.title.toLowerCase().includes(q) && !t.mapName.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [tournaments, category, mode, statusFilter, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white">
            Community Tournaments
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            All modes are 100% free entry. Select a bracket to view rules, slots, and room credentials.
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <label htmlFor="tournament-search" className="sr-only">
            Search tournaments
          </label>
          <input
            id="tournament-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search match or map..."
            className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-lg border border-white/10 bg-[#121216] text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#E11D48]"
          />
        </div>
      </div>

      {/* Top Directory vs My Matches Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-lg border border-white/10 bg-[#121216] p-1"
          role="group"
          aria-label="Matches view mode"
        >
          <button
            type="button"
            onClick={() => setViewMode('all')}
            className={`min-h-[40px] px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              viewMode === 'all' ? 'bg-[#E11D48] text-white' : 'text-zinc-300 hover:text-white'
            }`}
          >
            All Brackets ({tournaments.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('mine')}
            className={`min-h-[40px] px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              viewMode === 'mine' ? 'bg-[#E11D48] text-white' : 'text-zinc-300 hover:text-white'
            }`}
          >
            My Matches {isSignedIn ? `(${activeMyCount})` : ''}
          </button>
        </div>

        <button
          type="button"
          onClick={onNavigateResults}
          className="min-h-[40px] px-4 py-1.5 rounded-lg border border-white/10 bg-[#121216] hover:bg-white/5 text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5"
        >
          <Trophy className="w-3.5 h-3.5 text-[#E11D48]" />
          Open Results Page
        </button>
      </div>

      {viewMode === 'mine' ? (
        <section aria-label="My Matches and Played Results" className="space-y-5">
          {!isSignedIn ? (
            <div className="rounded-xl border border-white/10 bg-[#121216] p-10 text-center space-y-3">
              <Swords className="w-8 h-8 text-[#E11D48] mx-auto" />
              <p className="text-base font-semibold text-white">Sign in to see My Matches</p>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                View all matches you have joined and check official results, kills, and Spider Coins earned for your played matches.
              </p>
              <button
                type="button"
                onClick={onOpenAuth}
                className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white"
              >
                Sign In
              </button>
            </div>
          ) : myMatches.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#121216] p-10 text-center space-y-3">
              <Swords className="w-8 h-8 text-zinc-500 mx-auto" />
              <p className="text-base font-semibold text-white">No joined or played matches yet</p>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                Join any free tournament bracket to track your slot, room ID, and verified match results here.
              </p>
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className="min-h-[44px] px-5 py-2 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white"
              >
                Browse Open Brackets
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {myMatches.map((entry) => {
                const { registration, tournament, result, playerStanding, statusCategory, statusLabel } =
                  entry;
                const fallbackBanner =
                  tournament?.category === 'Clash Squad'
                    ? BRAND_ASSETS.clashSquadBanner
                    : tournament?.category === 'Lone Wolf'
                      ? BRAND_ASSETS.loneWolfBanner
                      : BRAND_ASSETS.battleRoyaleBanner;

                return (
                  <article
                    key={registration.id}
                    className="rounded-2xl border border-white/10 bg-[#121216] overflow-hidden flex flex-col justify-between"
                  >
                    <div className="p-5 space-y-4">
                      <div className="flex items-start gap-3.5">
                        <img
                          src={tournament?.bannerUrl || fallbackBanner}
                          alt={tournament?.title || registration.tournamentId}
                          referrerPolicy="no-referrer"
                          className="w-20 h-14 rounded-lg object-cover border border-white/10 shrink-0 bg-[#09090B]"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span
                              className={`font-semibold inline-flex items-center gap-1 ${
                                statusCategory === 'published'
                                  ? 'text-emerald-400'
                                  : statusCategory === 'review'
                                    ? 'text-amber-400'
                                    : statusCategory === 'live'
                                      ? 'text-[#F43F5E]'
                                      : statusCategory === 'cancelled'
                                        ? 'text-zinc-500'
                                        : 'text-zinc-300'
                              }`}
                            >
                              {statusCategory === 'published' && (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}
                              {statusLabel}
                            </span>
                            <span className="text-zinc-400 tabular-nums">
                              Slot #{registration.slotNumber}
                            </span>
                          </div>
                          <h2 className="font-display text-xl font-bold text-white truncate">
                            {tournament?.title || result?.tournamentTitle || registration.tournamentId}
                          </h2>
                          <p className="text-xs text-zinc-400 tabular-nums">
                            {tournament
                              ? `${tournament.category} · ${tournament.mode} · ${tournament.matchDate} ${tournament.matchTime}`
                              : `IGN: ${registration.freeFireIgn} · UID: ${registration.freeFireUid}`}
                          </p>
                        </div>
                      </div>

                      {/* Published Match Result Summary for Played Match */}
                      {result ? (
                        <div className="rounded-xl border border-emerald-500/25 bg-[#09090B] p-4 space-y-2.5 text-xs tabular-nums">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-400">
                              <Award className="w-4 h-4" />
                              Official Match Result
                            </span>
                            <span className="text-zinc-400">{result.totalKills} Total Kills</span>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10">
                            <span className="text-zinc-300 inline-flex items-center gap-1.5">
                              <Crown className="w-3.5 h-3.5 text-amber-400" />
                              Winner: <strong className="text-white">{result.winnerName}</strong>
                            </span>
                            {playerStanding ? (
                              <span className="font-semibold text-white inline-flex items-center gap-2">
                                Your Rank #{playerStanding.rank} · {playerStanding.kills} Kills
                                {typeof playerStanding.coinsAwarded === 'number' &&
                                  playerStanding.coinsAwarded > 0 && (
                                    <span className="text-amber-400 inline-flex items-center gap-1">
                                      <Coins className="w-3.5 h-3.5" />+
                                      {playerStanding.coinsAwarded.toLocaleString()}
                                    </span>
                                  )}
                              </span>
                            ) : (
                              <span className="text-zinc-400">Participated · Verified</span>
                            )}
                          </div>
                        </div>
                      ) : statusCategory === 'review' ? (
                        <div className="rounded-xl border border-amber-500/25 bg-amber-950/15 p-3.5 text-xs text-amber-200">
                          Match finished — results are currently being reviewed by Admin and will appear here once published.
                        </div>
                      ) : (
                        <div className="rounded-xl border border-white/10 bg-[#09090B] p-3.5 text-xs text-zinc-400">
                          Registered as <strong className="text-white">{registration.freeFireIgn}</strong> (UID:{' '}
                          <span className="font-mono-tabular text-zinc-200">{registration.freeFireUid}</span>).
                        </div>
                      )}
                    </div>

                    <div className="px-5 pb-5 flex items-center gap-2.5">
                      {tournament && (
                        <button
                          type="button"
                          onClick={() => onSelectTournament(tournament)}
                          className="flex-1 min-h-[42px] px-4 py-2 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white transition-colors"
                        >
                          {result ? 'View Match & Standings' : 'Open Match Room'}
                        </button>
                      )}
                      {result && (
                        <button
                          type="button"
                          onClick={onNavigateResults}
                          className="min-h-[42px] px-4 py-2 rounded-lg border border-white/15 hover:bg-white/5 text-xs font-semibold text-zinc-200 transition-colors"
                        >
                          Full Results
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Category Filter */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by game category">
              {(['All', 'Battle Royale', 'Clash Squad', 'Lone Wolf'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setCategory(cat);
                    setMode('All');
                  }}
                  className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    category === cat
                      ? 'bg-[#E11D48] text-white'
                      : 'bg-[#121216] text-zinc-300 border border-white/10 hover:text-white'
                  }`}
                >
                  {cat === 'All' ? 'All Categories' : cat}
                </button>
              ))}
            </div>

            {/* Sub-mode Filter */}
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by mode">
              <button
                type="button"
                onClick={() => setMode('All')}
                className={`min-h-[36px] px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  mode === 'All'
                    ? 'bg-white text-black'
                    : 'bg-[#121216] text-zinc-400 border border-white/10 hover:text-white'
                }`}
              >
                All Modes
              </button>
              {availableModes.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    mode === m
                      ? 'bg-white text-black'
                      : 'bg-[#121216] text-zinc-400 border border-white/10 hover:text-white'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Status Filter */}
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by match status">
              {(['all', 'live', 'upcoming', 'completed'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-md text-xs font-medium capitalize whitespace-nowrap shrink-0 transition-colors ${
                    statusFilter === st
                      ? 'bg-zinc-800 text-white border border-white/20'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {st === 'all' ? 'Any Status' : st}
                </button>
              ))}
            </div>
          </div>

          {/* Tournament Grid */}
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#121216] p-10 text-center space-y-3">
              <p className="text-base font-semibold text-white">No matching tournaments found</p>
              <p className="text-xs text-zinc-400">
                Adjust your mode or status filters to view open community matches.
              </p>
              <button
                type="button"
                onClick={() => {
                  setCategory('All');
                  setMode('All');
                  setStatusFilter('all');
                  setSearch('');
                }}
                className="min-h-[44px] px-5 py-2 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((t) => (
                <TournamentCard
                  key={t.id}
                  tournament={t}
                  isRegistered={registeredTournamentIds.has(t.id)}
                  onSelect={onSelectTournament}
                />
              ))}
            </div>
          )}
        </>
      )}

      <AdMobBannerSlot
        settings={adminSettings}
        screen="matches"
        placementLabel="Tournament Directory Footer"
      />
    </div>
  );
}
