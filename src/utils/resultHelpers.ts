import type {
  Registration,
  ResultStanding,
  Tournament,
  TournamentResult,
} from '../types/esports';

export interface PlayedMatchEntry {
  registration: Registration;
  tournament?: Tournament;
  result?: TournamentResult;
  playerStanding?: ResultStanding;
  statusCategory: 'published' | 'review' | 'live' | 'upcoming' | 'cancelled';
  statusLabel: string;
}

export function findPlayerStanding(
  result: TournamentResult,
  params: { userId?: string; username?: string; freeFireIgn?: string }
): ResultStanding | undefined {
  const { userId, username, freeFireIgn } = params;
  if (userId) {
    const byId = result.standings.find((s) => s.userId && s.userId === userId);
    if (byId) return byId;
  }
  const names = [username, freeFireIgn]
    .filter((v): v is string => Boolean(v && v.trim()))
    .map((v) => v.trim().toLowerCase());
  if (names.length === 0) return undefined;
  return result.standings.find((s) => names.includes(s.playerName.trim().toLowerCase()));
}

export function buildPlayedMatchesWithResults(params: {
  registrations: Registration[];
  tournaments: Tournament[];
  results: TournamentResult[];
  userId?: string;
  username?: string;
  freeFireIgn?: string;
}): PlayedMatchEntry[] {
  const { registrations, tournaments, results, userId, username, freeFireIgn } = params;
  const tournamentMap = new Map(tournaments.map((t) => [t.id, t]));
  const publishedResultMap = new Map(
    results.filter((r) => r.verified).map((r) => [r.tournamentId, r])
  );

  // Deduplicate by tournamentId, preferring confirmed registration over cancelled
  const byTournament = new Map<string, Registration>();
  for (const reg of registrations) {
    const existing = byTournament.get(reg.tournamentId);
    if (!existing || (existing.status === 'cancelled' && reg.status === 'confirmed')) {
      byTournament.set(reg.tournamentId, reg);
    }
  }

  const entries: PlayedMatchEntry[] = [];
  for (const registration of byTournament.values()) {
    const tournament = tournamentMap.get(registration.tournamentId);
    const result = publishedResultMap.get(registration.tournamentId);
    const playerStanding = result
      ? findPlayerStanding(result, { userId, username, freeFireIgn })
      : undefined;

    let statusCategory: PlayedMatchEntry['statusCategory'] = 'upcoming';
    let statusLabel = 'Upcoming';

    if (registration.status === 'cancelled' || tournament?.status === 'cancelled') {
      statusCategory = 'cancelled';
      statusLabel = 'Cancelled';
    } else if (result) {
      statusCategory = 'published';
      statusLabel = 'Result Published';
    } else if (tournament?.status === 'completed') {
      statusCategory = 'review';
      statusLabel = 'Under Admin Review';
    } else if (tournament?.status === 'live') {
      statusCategory = 'live';
      statusLabel = 'Live Now';
    } else if (tournament) {
      const deadlineMs = Date.parse(tournament.registrationDeadline);
      if (!Number.isNaN(deadlineMs) && Date.now() > deadlineMs) {
        statusCategory = 'review';
        statusLabel = 'Awaiting Result Review';
      }
    }

    entries.push({
      registration,
      tournament,
      result,
      playerStanding,
      statusCategory,
      statusLabel,
    });
  }

  entries.sort((a, b) => {
    const aTime = Date.parse(
      a.result?.publishedAt || a.tournament?.matchDate || a.registration.updatedAt
    );
    const bTime = Date.parse(
      b.result?.publishedAt || b.tournament?.matchDate || b.registration.updatedAt
    );
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });

  return entries;
}

export function validateResultStandings(standings: ResultStanding[]):
  | {
      valid: true;
      standings: ResultStanding[];
      winnerUserId?: string;
      winnerName: string;
      totalKills: number;
    }
  | { valid: false; error: string } {
  if (!Array.isArray(standings) || standings.length === 0) {
    return { valid: false, error: 'Add at least 1 standing row (Champion) before saving or publishing.' };
  }
  if (standings.length > 50) {
    return { valid: false, error: 'Standings cannot exceed 50 rows.' };
  }

  const cleaned: ResultStanding[] = [];
  for (let i = 0; i < standings.length; i++) {
    const row = standings[i];
    const playerName = row.playerName.trim();
    if (playerName.length < 2 || playerName.length > 64) {
      return {
        valid: false,
        error: `Rank #${i + 1}: Player/Team name must be between 2 and 64 characters.`,
      };
    }
    const kills = Math.floor(Number(row.kills));
    const coinsAwarded = Math.floor(Number(row.coinsAwarded ?? 0));
    if (!Number.isFinite(kills) || kills < 0 || kills > 500) {
      return { valid: false, error: `Rank #${i + 1}: Kills must be between 0 and 500.` };
    }
    if (!Number.isFinite(coinsAwarded) || coinsAwarded < 0 || coinsAwarded > 1000000) {
      return { valid: false, error: `Rank #${i + 1}: Coins awarded must be 0 or higher.` };
    }
    const cleanRow: ResultStanding = {
      rank: i + 1,
      playerName,
      kills,
      coinsAwarded,
    };
    if (row.userId && row.userId.trim()) {
      cleanRow.userId = row.userId.trim();
    }
    cleaned.push(cleanRow);
  }

  const totalKills = Math.min(
    500,
    cleaned.reduce((acc, r) => acc + r.kills, 0)
  );
  const champion = cleaned[0];

  return {
    valid: true,
    standings: cleaned,
    winnerUserId: champion.userId,
    winnerName: champion.playerName,
    totalKills,
  };
}
