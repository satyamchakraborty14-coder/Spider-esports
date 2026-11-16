import { useMemo, useState } from 'react';
import { Award, CheckCircle2, Coins, Crown, Search, Shield, Swords, Trophy } from 'lucide-react';
import type {
  AdminSettings,
  Registration,
  Tournament,
  TournamentCategory,
  TournamentResult,
  UserProfile,
} from '../types/esports';
import { BRAND_ASSETS } from '../lib/seedData';
import { buildPlayedMatchesWithResults, findPlayerStanding } from '../utils/resultHelpers';
import { AdMobBannerSlot } from './AdMobUnits';

interface ResultsViewProps {
  results: TournamentResult[];
  tournaments: Tournament[];
  registrations: Registration[];
  profile: UserProfile | null;
  currentUserId?: string;
  adminSettings: AdminSettings;
  onSelectTournament: (t: Tournament) => void;
  onOpenAuth: () => void;
}

export function ResultsView({
  results,
  tournaments,
  registrations,
  profile,
  currentUserId,
  adminSettings,
  onSelectTournament,
  onOpenAuth,
}: ResultsViewProps) {
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [category, setCategory] = useState<'All' | TournamentCategory>('All');
  const [search, setSearch] = useState('');

  const tournamentMap = useMemo(
    () => new Map(tournaments.map((t) => [t.id, t])),
    [tournaments]
  );

  // Only verified results are shown to players/public on the Results page
  const publishedResults = useMemo(
    () => results.filter((r) => r.verified),
    [results]
  );

  const myPlayedMatches = useMemo(
    () =>
      currentUserId
        ? buildPlayedMatchesWithResults({
            registrations,
            tournaments,
            results: publishedResults,
            userId: currentUserId,
            username: profile?.username,
            freeFireIgn: profile?.freeFireIgn,
          })
        : [],
    [currentUserId, registrations, tournaments, publishedResults, profile?.username, profile?.freeFireIgn]
  );

  const myPlayedTournamentIds = useMemo(
    () => new Set(myPlayedMatches.filter((m) => m.statusCategory !== 'cancelled').map((m) => m.registration.tournamentId)),
    [myPlayedMatches]
  );

  const filteredResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    return publishedResults.filter((res) => {
      const linked = tournamentMap.get(res.tournamentId);
      if (scope === 'mine') {
        const participatedByReg = myPlayedTournamentIds.has(res.tournamentId);
        const participatedByStanding = Boolean(
          findPlayerStanding(res, {
            userId: currentUserId,
            username: profile?.username,
            freeFireIgn: profile?.freeFireIgn,
          })
        );
        if (!participatedByReg && !participatedByStanding) return false;
      }
      if (category !== 'All' && linked?.category !== category) return false;
      if (q) {
        const titleMatch = res.tournamentTitle.toLowerCase().includes(q);
        const winnerMatch = res.winnerName.toLowerCase().includes(q);
        const playerMatch = res.standings.some((s) =>
          s.playerName.toLowerCase().includes(q)
        );
        if (!titleMatch && !winnerMatch && !playerMatch) return false;
      }
      return true;
    });
  }, [
    publishedResults,
    tournamentMap,
    scope,
    category,
    search,
    myPlayedTournamentIds,
    currentUserId,
    profile?.username,
    profile?.freeFireIgn,
  ]);

  const myPendingReviewMatches = useMemo(
    () => myPlayedMatches.filter((m) => m.statusCategory === 'review'),
    [myPlayedMatches]
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white flex items-center gap-2.5">
            <Trophy className="w-7 h-7 text-[#E11D48]" />
            Match Results
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Official standings, verified kill counts, and Spider Coin rewards published by admins after match review.
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <label htmlFor="results-search" className="sr-only">
            Search match results
          </label>
          <input
            id="results-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search match, winner, or IGN..."
            className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-lg border border-white/10 bg-[#121216] text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#E11D48]"
          />
        </div>
      </div>

      {/* Scope & Category Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div
          className="inline-flex rounded-lg border border-white/10 bg-[#121216] p-1 self-start"
          role="group"
          aria-label="Filter results scope"
        >
          <button
            type="button"
            onClick={() => setScope('all')}
            className={`min-h-[38px] px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              scope === 'all' ? 'bg-[#E11D48] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            All Public Results ({publishedResults.length})
          </button>
          <button
            type="button"
            onClick={() => setScope('mine')}
            className={`min-h-[38px] px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              scope === 'mine' ? 'bg-[#E11D48] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            My Played Results
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter results by category">
          {(['All', 'Battle Royale', 'Clash Squad', 'Lone Wolf'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                category === cat
                  ? 'bg-white text-black'
                  : 'bg-[#121216] text-zinc-300 border border-white/10 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Sign-in prompt if viewing My Played Results while signed out */}
      {scope === 'mine' && !currentUserId && (
        <section className="rounded-xl border border-white/10 bg-[#121216] p-8 text-center space-y-3">
          <p className="text-base font-semibold text-white">Sign in to view your played match results</p>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            All public tournament results are visible under All Public Results. Sign in to filter directly to matches you joined and played.
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white"
          >
            Sign In
          </button>
        </section>
      )}

      {/* Pending Admin Review Notice for User's Played Matches */}
      {currentUserId && myPendingReviewMatches.length > 0 && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-950/15 p-4 space-y-2">
          <p className="text-xs font-semibold text-amber-300">
            Matches Under Admin Review ({myPendingReviewMatches.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {myPendingReviewMatches.map((entry) => (
              <button
                key={entry.registration.id}
                type="button"
                onClick={() => entry.tournament && onSelectTournament(entry.tournament)}
                className="text-xs text-zinc-200 bg-[#121216] border border-white/10 hover:border-white/25 rounded-lg px-3 py-1.5 text-left"
              >
                <span className="font-semibold text-white">
                  {entry.tournament?.title || entry.registration.tournamentId}
                </span>
                <span className="text-zinc-400"> · Slot #{entry.registration.slotNumber} · Reviewing</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Results List */}
      {scope === 'mine' && !currentUserId ? null : filteredResults.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[#121216] p-10 text-center space-y-3">
          <Trophy className="w-9 h-9 text-zinc-500 mx-auto" />
          <p className="text-base font-semibold text-white">
            {scope === 'mine'
              ? 'No published results for your played matches yet'
              : 'No published match results match your filter'}
          </p>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            {scope === 'mine'
              ? 'Once an admin reviews and publishes results for a match you played, your placement, kills, and Spider Coins will appear here.'
              : 'Verified tournament standings appear here immediately after admin review and publication.'}
          </p>
          {(scope === 'mine' || category !== 'All' || search) && (
            <button
              type="button"
              onClick={() => {
                setScope('all');
                setCategory('All');
                setSearch('');
              }}
              className="min-h-[42px] px-4 py-2 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white"
            >
              Show All Public Results
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredResults.map((res) => {
            const linkedTournament = tournamentMap.get(res.tournamentId);
            const fallbackBanner =
              linkedTournament?.category === 'Clash Squad'
                ? BRAND_ASSETS.clashSquadBanner
                : linkedTournament?.category === 'Lone Wolf'
                  ? BRAND_ASSETS.loneWolfBanner
                  : BRAND_ASSETS.battleRoyaleBanner;
            const myStanding = currentUserId
              ? findPlayerStanding(res, {
                  userId: currentUserId,
                  username: profile?.username,
                  freeFireIgn: profile?.freeFireIgn,
                })
              : undefined;
            const iJoined = myPlayedTournamentIds.has(res.tournamentId);

            return (
              <article
                key={res.id}
                className="rounded-2xl border border-white/10 bg-[#121216] overflow-hidden flex flex-col"
              >
                {/* Match Picture Header */}
                <div className="relative h-36 bg-[#18181D] overflow-hidden">
                  <img
                    src={linkedTournament?.bannerUrl || fallbackBanner}
                    alt={`${res.tournamentTitle} match banner`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#121216] via-[#121216]/50 to-transparent" />
                  <div className="absolute bottom-3 left-5 right-5 flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
                      <Award className="w-4 h-4" />
                      Verified Official Result
                    </span>
                    <span className="text-zinc-300 tabular-nums">
                      {new Date(res.publishedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="p-5 sm:p-6 space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        {linkedTournament && (
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
                            <span className="text-[#F43F5E] font-semibold">
                              {linkedTournament.category}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{linkedTournament.mode}</span>
                            <span aria-hidden="true">·</span>
                            <span>{linkedTournament.mapName}</span>
                          </div>
                        )}
                        <h2 className="font-display text-2xl font-bold text-white leading-tight">
                          {res.tournamentTitle}
                        </h2>
                      </div>
                      {(iJoined || myStanding) && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                          Played
                        </span>
                      )}
                    </div>

                    {/* Champion + Total Eliminations Strip */}
                    <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#09090B] border border-white/10 p-3.5 text-xs tabular-nums">
                      <div>
                        <p className="text-zinc-400 flex items-center gap-1">
                          <Crown className="w-3.5 h-3.5 text-amber-400" />
                          Match Champion
                        </p>
                        <p className="text-sm font-bold text-white mt-0.5 truncate">
                          {res.winnerName}
                        </p>
                      </div>
                      <div>
                        <p className="text-zinc-400 flex items-center gap-1">
                          <Swords className="w-3.5 h-3.5 text-[#E11D48]" />
                          Total Verified Kills
                        </p>
                        <p className="text-sm font-bold text-white mt-0.5">
                          {res.totalKills} Eliminations
                        </p>
                      </div>
                    </div>

                    {/* Personal Placement Highlight if Signed-In Player Participated */}
                    {myStanding && (
                      <div className="rounded-xl border border-[#E11D48]/35 bg-[#E11D48]/10 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
                        <span className="font-semibold text-white">
                          Your Performance: Rank #{myStanding.rank} · {myStanding.kills} Kills
                        </span>
                        {typeof myStanding.coinsAwarded === 'number' && myStanding.coinsAwarded > 0 && (
                          <span className="inline-flex items-center gap-1 font-bold text-amber-400">
                            <Coins className="w-3.5 h-3.5" />
                            +{myStanding.coinsAwarded.toLocaleString()} Coins
                          </span>
                        )}
                      </div>
                    )}

                    {/* Standings Table */}
                    <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#09090B]">
                      <table className="w-full text-left border-collapse text-xs tabular-nums">
                        <thead>
                          <tr className="border-b border-white/10 text-zinc-400">
                            <th className="py-2.5 px-3 font-medium">Rank</th>
                            <th className="py-2.5 px-3 font-medium">Player / Team</th>
                            <th className="py-2.5 px-3 font-medium text-right">Kills</th>
                            <th className="py-2.5 px-3 font-medium text-right">Coins</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {res.standings.map((row) => {
                            const isMe =
                              Boolean(currentUserId && row.userId === currentUserId) ||
                              Boolean(
                                profile &&
                                  (row.playerName.trim().toLowerCase() ===
                                    profile.username.trim().toLowerCase() ||
                                    row.playerName.trim().toLowerCase() ===
                                      profile.freeFireIgn.trim().toLowerCase())
                              );
                            return (
                              <tr
                                key={`${row.rank}-${row.playerName}`}
                                className={isMe ? 'bg-[#E11D48]/15' : ''}
                              >
                                <td className="py-2.5 px-3 font-mono-tabular font-bold text-white">
                                  #{row.rank}
                                </td>
                                <td className="py-2.5 px-3 font-medium text-zinc-200">
                                  {row.playerName}
                                  {isMe ? ' (You)' : ''}
                                </td>
                                <td className="py-2.5 px-3 text-right text-zinc-300 font-mono-tabular">
                                  {row.kills}
                                </td>
                                <td className="py-2.5 px-3 text-right text-amber-400 font-semibold font-mono-tabular">
                                  {typeof row.coinsAwarded === 'number' && row.coinsAwarded > 0
                                    ? `+${row.coinsAwarded.toLocaleString()}`
                                    : '0'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {linkedTournament && (
                    <button
                      type="button"
                      onClick={() => onSelectTournament(linkedTournament)}
                      className="w-full min-h-[42px] px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-xs font-semibold text-zinc-200 inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Shield className="w-3.5 h-3.5 text-[#E11D48]" />
                      View Match Details &amp; Roster
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <AdMobBannerSlot
        settings={adminSettings}
        screen="results"
        placementLabel="Results Page Footer"
      />
    </div>
  );
}
