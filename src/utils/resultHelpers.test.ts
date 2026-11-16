import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlayedMatchesWithResults,
  findPlayerStanding,
  validateResultStandings,
} from './resultHelpers';
import type { Registration, Tournament, TournamentResult } from '../types/esports';

const sampleTournament: Tournament = {
  id: 't-1',
  title: 'Spider Squad Showdown',
  category: 'Battle Royale',
  mode: 'Squad',
  mapName: 'Bermuda',
  matchDate: '2026-11-15',
  matchTime: '20:00',
  registrationDeadline: '2026-11-15T19:00:00.000Z',
  credentialsReleaseAt: '2026-11-15T19:30:00.000Z',
  maxSlots: 12,
  filledSlots: 10,
  status: 'completed',
  featured: false,
  published: true,
  rules: [],
  coinReward: 500,
  perKillCoins: 15,
  createdBy: 'admin',
  createdAt: '2026-11-14T10:00:00.000Z',
  updatedAt: '2026-11-15T21:00:00.000Z',
};

const sampleResult: TournamentResult = {
  id: 'res-t-1',
  tournamentId: 't-1',
  tournamentTitle: 'Spider Squad Showdown',
  winnerUserId: 'u-1',
  winnerName: 'KuroSpider',
  totalKills: 19,
  standings: [
    { rank: 1, userId: 'u-1', playerName: 'KuroSpider', kills: 12, coinsAwarded: 680 },
    { rank: 2, userId: 'u-2', playerName: 'VenomFF', kills: 7, coinsAwarded: 105 },
  ],
  verified: true,
  publishedAt: '2026-11-15T21:15:00.000Z',
};

test('findPlayerStanding matches by userId first, then username or IGN', () => {
  assert.equal(findPlayerStanding(sampleResult, { userId: 'u-2' })?.rank, 2);
  assert.equal(findPlayerStanding(sampleResult, { freeFireIgn: 'kurospider' })?.rank, 1);
  assert.equal(findPlayerStanding(sampleResult, { userId: 'unknown', username: 'Nobody' }), undefined);
});

test('buildPlayedMatchesWithResults maps published results and hides unverified drafts from players', () => {
  const registrations: Registration[] = [
    {
      id: 't-1_u-2',
      tournamentId: 't-1',
      userId: 'u-2',
      username: 'VenomUser',
      freeFireIgn: 'VenomFF',
      freeFireUid: '12345678',
      slotNumber: 3,
      status: 'confirmed',
      createdAt: '2026-11-15T10:00:00.000Z',
      updatedAt: '2026-11-15T10:00:00.000Z',
    },
    {
      id: 't-2_u-2',
      tournamentId: 't-2',
      userId: 'u-2',
      username: 'VenomUser',
      freeFireIgn: 'VenomFF',
      freeFireUid: '12345678',
      slotNumber: 1,
      status: 'confirmed',
      createdAt: '2026-11-15T11:00:00.000Z',
      updatedAt: '2026-11-15T11:00:00.000Z',
    },
  ];

  const t2: Tournament = {
    ...sampleTournament,
    id: 't-2',
    title: 'Clash Draft Review',
    status: 'completed',
  };

  const draftResult: TournamentResult = {
    ...sampleResult,
    id: 'res-t-2',
    tournamentId: 't-2',
    tournamentTitle: 'Clash Draft Review',
    verified: false,
  };

  const played = buildPlayedMatchesWithResults({
    registrations,
    tournaments: [sampleTournament, t2],
    results: [sampleResult, draftResult],
    userId: 'u-2',
    username: 'VenomUser',
    freeFireIgn: 'VenomFF',
  });

  assert.equal(played.length, 2);
  const first = played.find((e) => e.registration.tournamentId === 't-1');
  const second = played.find((e) => e.registration.tournamentId === 't-2');
  assert.equal(first?.statusCategory, 'published');
  assert.equal(first?.playerStanding?.rank, 2);
  assert.equal(first?.playerStanding?.coinsAwarded, 105);
  assert.equal(second?.statusCategory, 'review');
  assert.equal(second?.result, undefined);
});

test('validateResultStandings enforces bounds and derives champion and total kills', () => {
  const valid = validateResultStandings([
    { rank: 1, userId: 'u-1', playerName: 'KuroSpider', kills: 9, coinsAwarded: 500 },
    { rank: 2, playerName: 'ApexZero', kills: 6, coinsAwarded: 100 },
  ]);
  assert.equal(valid.valid, true);
  if (valid.valid) {
    assert.equal(valid.winnerName, 'KuroSpider');
    assert.equal(valid.winnerUserId, 'u-1');
    assert.equal(valid.totalKills, 15);
    assert.equal(valid.standings[0].coinsAwarded, 500);
  }

  assert.equal(validateResultStandings([]).valid, false);
  assert.equal(
    validateResultStandings([{ rank: 1, playerName: 'X', kills: 2, coinsAwarded: 20 }]).valid,
    false
  );
  assert.equal(
    validateResultStandings([{ rank: 1, playerName: 'ValidName', kills: -1, coinsAwarded: 20 }]).valid,
    false
  );
  assert.equal(
    validateResultStandings([{ rank: 1, playerName: 'ValidName', kills: 2, coinsAwarded: -10 }]).valid,
    false
  );
});
