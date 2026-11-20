import { useMemo, useState } from 'react';
import { Award, Medal, Trophy } from 'lucide-react';
import type { LeaderboardEntry, TournamentResult } from '../types/esports';
import { BRAND_ASSETS, resolveBundledAssetUrl } from '../lib/seedData';
import {
  calculateRupeesFromCoins,
  formatRupees,
  getPlayerLeaderboardRank,
  sortLeaderboard,
} from '../utils/coinSystem';

interface LeaderboardViewProps {
  entries: LeaderboardEntry[];
  results: TournamentResult[];
  currentUserId?: string;
  onNavigateResults: () => void;
}

export function LeaderboardView({
  entries,
  results,
  currentUserId,
  onNavigateResults,
}: LeaderboardViewProps) {
  const [scope, setScope] = useState<'global' | 'weekly'>('global');

  const sorted = useMemo(() => sortLeaderboard(entries, scope), [entries, scope]);
  const myRank = currentUserId ? getPlayerLeaderboardRank(entries, currentUserId, scope) : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white">
            Player Leaderboard
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Official rankings verified by SPIDER ESPORTS tournament administrators
            {myRank ? ` · Your ${scope} rank: #${myRank}` : ''}.
          </p>
        </div>

        <div
          className="inline-flex rounded-lg border border-white/10 bg-[#121216] p-1"
          role="group"
          aria-label="Leaderboard Timeframe"
        >
          <button
            type="button"
            onClick={() => setScope('global')}
            className={`min-h-[38px] px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              scope === 'global' ? 'bg-[#E11D48] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Global All-Time
          </button>
          <button
            type="button"
            onClick={() => setScope('weekly')}
            className={`min-h-[38px] px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              scope === 'weekly' ? 'bg-[#E11D48] text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Weekly Ladder
          </button>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="rounded-xl border border-white/10 bg-[#121216] overflow-x-auto">
        {sorted.length === 0 ? (
          <div className="p-10 text-center text-sm text-zinc-400">
            No ranked players recorded yet. Complete a verified match to enter the ladder.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-xs text-zinc-400">
                <th className="py-3.5 px-4 font-medium">Rank</th>
                <th className="py-3.5 px-4 font-medium">Player</th>
                <th className="py-3.5 px-4 font-medium text-right">Coins</th>
                <th className="py-3.5 px-4 font-medium text-right">Wins</th>
                <th className="py-3.5 px-4 font-medium text-right">Kills</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm tabular-nums">
              {sorted.map((entry, idx) => {
                const rank = idx + 1;
                const isMe = currentUserId && entry.userId === currentUserId;
                const wins = scope === 'weekly' ? entry.weeklyWins : entry.totalWins;
                const kills = scope === 'weekly' ? entry.weeklyKills : entry.totalKills;

                return (
                  <tr
                    key={entry.id}
                    className={`transition-colors ${
                      isMe ? 'bg-[#E11D48]/10' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <td className="py-3.5 px-4 font-mono-tabular font-bold text-zinc-200">
                      {rank <= 3 ? (
                        <span className="inline-flex items-center gap-1.5 text-[#F43F5E]">
                          <Medal className="w-4 h-4" />#{rank}
                        </span>
                      ) : (
                        `#${rank}`
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={resolveBundledAssetUrl(entry.avatarUrl, BRAND_ASSETS.defaultAvatar)}
                          alt={entry.username}
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded-lg object-cover border border-white/10 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate">
                            {entry.username}
                            {isMe ? ' (You)' : ''}
                          </p>
                          <p className="text-[11px] text-zinc-400">
                            Value: {formatRupees(calculateRupeesFromCoins(entry.coins ?? 0))}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right text-amber-400 font-semibold font-mono-tabular">
                      {(entry.coins ?? 0).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-right text-zinc-200 font-mono-tabular">{wins}</td>
                    <td className="py-3.5 px-4 text-right text-zinc-200 font-mono-tabular">{kills}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Verified Tournament Results */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-[#E11D48]" />
            <h2 className="font-display text-2xl font-bold text-white">Verified Match Results</h2>
          </div>
          <button
            type="button"
            onClick={onNavigateResults}
            className="min-h-[38px] px-3 text-xs font-semibold text-[#F43F5E] hover:text-white transition-colors"
          >
            Full Results Page
          </button>
        </div>

        {results.filter((r) => r.verified).length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[#121216] p-6 text-xs text-zinc-400">
            Verified tournament standings will appear here once published by administrators.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {results
              .filter((r) => r.verified)
              .slice(0, 4)
              .map((res) => (
              <div
                key={res.id}
                className="rounded-xl border border-white/10 bg-[#121216] p-5 space-y-3"
              >
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                    <Award className="w-3.5 h-3.5" />
                    Verified Result
                  </span>
                  <span className="tabular-nums">{res.totalKills} Team Kills</span>
                </div>
                <h3 className="font-display text-xl font-bold text-white">{res.tournamentTitle}</h3>
                <div className="divide-y divide-white/10 text-xs tabular-nums pt-1">
                  {res.standings.slice(0, 3).map((s) => (
                    <div key={s.rank} className="py-2 flex items-center justify-between">
                      <span className="text-zinc-200">
                        #{s.rank} · {s.playerName}
                      </span>
                      <span className="text-zinc-400">
                        {s.kills} kills
                        {typeof s.coinsAwarded === 'number' && s.coinsAwarded > 0 ? (
                          <>
                            {' · '}
                            <strong className="text-amber-400">+{s.coinsAwarded.toLocaleString()} coins</strong>
                          </>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
