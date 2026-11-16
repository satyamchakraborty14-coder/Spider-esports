import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCancelRegistration,
  canJoinTournament,
  canViewRoomCredentials,
  getAvailableSlots,
  getModeDefinition,
  isStrictSoleAdminEmail,
  isStrictSoleAdminSession,
  isTournamentFull,
  validateAdminPassword,
  validateAdminSlotUpdate,
  validateFreeFireUid,
  validateSlotAssignment,
  validateTeammates,
  validateTournamentBannerUrl,
} from './tournamentRules';
import type { Tournament } from '../types/esports';

const baseTournament: Tournament = {
  id: 't-br-squad-1',
  title: 'Spider Sunday Scrims',
  category: 'Battle Royale',
  mode: 'Squad',
  mapName: 'Bermuda',
  matchDate: '2026-11-15',
  matchTime: '20:00',
  registrationDeadline: '2026-11-15T19:30:00.000Z',
  credentialsReleaseAt: '2026-11-15T19:45:00.000Z',
  maxSlots: 12,
  filledSlots: 8,
  status: 'upcoming',
  featured: true,
  published: true,
  rules: ['No emulators', 'Fair play only'],
  coinReward: 300,
  perKillCoins: 10,
  createdBy: 'admin-1',
  createdAt: '2026-11-14T10:00:00.000Z',
  updatedAt: '2026-11-14T10:00:00.000Z',
};

test('mode definitions cover all 8 required Free Fire modes', () => {
  assert.equal(getModeDefinition('Solo').requiredTeammates, 0);
  assert.equal(getModeDefinition('Duo').requiredTeammates, 1);
  assert.equal(getModeDefinition('Squad').requiredTeammates, 3);
  assert.equal(getModeDefinition('CS 1v1').category, 'Clash Squad');
  assert.equal(getModeDefinition('CS 2v2').teamSize, 2);
  assert.equal(getModeDefinition('CS 4v4').requiredTeammates, 3);
  assert.equal(getModeDefinition('Lone Wolf 1v1').category, 'Lone Wolf');
  assert.equal(getModeDefinition('Lone Wolf 2v2').requiredTeammates, 1);
});

test('slot availability and full detection work accurately', () => {
  assert.equal(getAvailableSlots(baseTournament), 4);
  assert.equal(isTournamentFull(baseTournament), false);
  assert.equal(isTournamentFull({ ...baseTournament, filledSlots: 12 }), true);
  assert.equal(getAvailableSlots({ ...baseTournament, filledSlots: 15 }), 0);
});

test('Free Fire UID and teammate validation reject invalid or duplicate UIDs', () => {
  assert.equal(validateFreeFireUid('123456789'), null);
  assert.ok(validateFreeFireUid('abc123') !== null);
  assert.ok(validateFreeFireUid('123') !== null);

  assert.equal(
    validateTeammates(
      'Duo',
      [{ ign: 'VenomFF', uid: '987654321' }],
      '123456789'
    ),
    null
  );

  // Duplicate captain UID rejected
  assert.ok(
    validateTeammates(
      'Duo',
      [{ ign: 'Clone', uid: '123456789' }],
      '123456789'
    ) !== null
  );

  // Wrong teammate count for Squad
  assert.ok(
    validateTeammates('Squad', [{ ign: 'One', uid: '11111111' }], '123456789') !== null
  );
});

test('canJoinTournament enforces duplicates, full slots, suspension, and deadlines', () => {
  const beforeDeadline = Date.parse('2026-11-15T18:00:00.000Z');
  const afterDeadline = Date.parse('2026-11-15T19:40:00.000Z');

  assert.equal(
    canJoinTournament({
      tournament: baseTournament,
      alreadyRegistered: false,
      userSuspended: false,
      nowMs: beforeDeadline,
    }).allowed,
    true
  );

  assert.equal(
    canJoinTournament({
      tournament: baseTournament,
      alreadyRegistered: true,
      userSuspended: false,
      nowMs: beforeDeadline,
    }).allowed,
    false
  );

  assert.equal(
    canJoinTournament({
      tournament: { ...baseTournament, filledSlots: 12 },
      alreadyRegistered: false,
      userSuspended: false,
      nowMs: beforeDeadline,
    }).allowed,
    false
  );

  assert.equal(
    canJoinTournament({
      tournament: baseTournament,
      alreadyRegistered: false,
      userSuspended: true,
      nowMs: beforeDeadline,
    }).allowed,
    false
  );

  assert.equal(
    canJoinTournament({
      tournament: baseTournament,
      alreadyRegistered: false,
      userSuspended: false,
      nowMs: afterDeadline,
    }).allowed,
    false
  );
});

test('canCancelRegistration blocks cancellation after deadline or live status', () => {
  const beforeDeadline = Date.parse('2026-11-15T18:00:00.000Z');
  const afterDeadline = Date.parse('2026-11-15T19:40:00.000Z');

  assert.equal(
    canCancelRegistration({
      tournament: baseTournament,
      isRegistered: true,
      nowMs: beforeDeadline,
    }).allowed,
    true
  );

  assert.equal(
    canCancelRegistration({
      tournament: baseTournament,
      isRegistered: true,
      nowMs: afterDeadline,
    }).allowed,
    false
  );

  assert.equal(
    canCancelRegistration({
      tournament: { ...baseTournament, status: 'live' },
      isRegistered: true,
      nowMs: beforeDeadline,
    }).allowed,
    false
  );
});

test('canViewRoomCredentials gates access to registered users after release time or admins', () => {
  const beforeRelease = Date.parse('2026-11-15T19:35:00.000Z');
  const afterRelease = Date.parse('2026-11-15T19:46:00.000Z');

  // Non-registered user blocked even after release
  assert.equal(
    canViewRoomCredentials({
      isAdmin: false,
      isRegistered: false,
      credentialsPublished: true,
      credentialsReleaseAt: baseTournament.credentialsReleaseAt,
      nowMs: afterRelease,
    }).visible,
    false
  );

  // Registered user blocked before release time
  assert.equal(
    canViewRoomCredentials({
      isAdmin: false,
      isRegistered: true,
      credentialsPublished: true,
      credentialsReleaseAt: baseTournament.credentialsReleaseAt,
      nowMs: beforeRelease,
    }).visible,
    false
  );

  // Registered user allowed after release time when published
  assert.equal(
    canViewRoomCredentials({
      isAdmin: false,
      isRegistered: true,
      credentialsPublished: true,
      credentialsReleaseAt: baseTournament.credentialsReleaseAt,
      nowMs: afterRelease,
    }).visible,
    true
  );

  // Admin always has access
  assert.equal(
    canViewRoomCredentials({
      isAdmin: true,
      isRegistered: false,
      credentialsPublished: false,
      credentialsReleaseAt: baseTournament.credentialsReleaseAt,
      nowMs: beforeRelease,
    }).visible,
    true
  );
});

test('isStrictSoleAdminEmail restricts access strictly to verified sole owner email', () => {
  assert.equal(isStrictSoleAdminEmail('satyamchakraborty14@gmail.com', true), true);
  assert.equal(isStrictSoleAdminEmail('  SatyamChakraborty14@gmail.com ', true), true);
  assert.equal(isStrictSoleAdminEmail('satyamchakraborty14@gmail.com', false), false);
  assert.equal(isStrictSoleAdminEmail('otheruser@gmail.com', true), false);
  assert.equal(isStrictSoleAdminEmail(null, true), false);
  assert.equal(isStrictSoleAdminEmail('', true), false);
});

test('isStrictSoleAdminSession requires verified sole owner email AND password sign-in provider', () => {
  assert.equal(
    isStrictSoleAdminSession({
      email: 'satyamchakraborty14@gmail.com',
      emailVerified: true,
      signInProvider: 'password',
    }),
    true
  );
  assert.equal(
    isStrictSoleAdminSession({
      email: 'satyamchakraborty14@gmail.com',
      emailVerified: true,
      signInProvider: 'google.com',
    }),
    false
  );
  assert.equal(
    isStrictSoleAdminSession({
      email: 'satyamchakraborty14@gmail.com',
      emailVerified: false,
      signInProvider: 'password',
    }),
    false
  );
  assert.equal(
    isStrictSoleAdminSession({
      email: 'other@gmail.com',
      emailVerified: true,
      signInProvider: 'password',
    }),
    false
  );
});

test('validateAdminPassword enforces strong password and confirmation matching', () => {
  assert.equal(validateAdminPassword('Spider2026', 'Spider2026'), null);
  assert.ok(validateAdminPassword('short1', 'short1') !== null);
  assert.ok(validateAdminPassword('onlyletters', 'onlyletters') !== null);
  assert.ok(validateAdminPassword('12345678', '12345678') !== null);
  assert.ok(validateAdminPassword('Spider2026', 'Spider2027') !== null);
});

test('validateAdminSlotUpdate enforces integer slot bounds and filled <= max invariant', () => {
  assert.deepEqual(validateAdminSlotUpdate(24, 12), {
    valid: true,
    maxSlots: 24,
    filledSlots: 12,
  });
  assert.equal(validateAdminSlotUpdate(1, 0).valid, false);
  assert.equal(validateAdminSlotUpdate(101, 0).valid, false);
  assert.equal(validateAdminSlotUpdate(12, -1).valid, false);
  assert.equal(validateAdminSlotUpdate(12, 13).valid, false);
  assert.equal(validateAdminSlotUpdate(12.5, 4).valid, false);
});

test('validateSlotAssignment keeps participant slot numbers within tournament capacity', () => {
  assert.deepEqual(validateSlotAssignment(1, 12), { valid: true, slotNumber: 1 });
  assert.deepEqual(validateSlotAssignment(12, 12), { valid: true, slotNumber: 12 });
  assert.equal(validateSlotAssignment(0, 12).valid, false);
  assert.equal(validateSlotAssignment(13, 12).valid, false);
  assert.equal(validateSlotAssignment(2.5, 12).valid, false);
});

test('validateTournamentBannerUrl accepts valid presets/http(s) URLs and rejects invalid or oversized ones', () => {
  assert.deepEqual(
    validateTournamentBannerUrl(' /src/assets/images/hero_arena_banner_1794723403097.jpg '),
    { valid: true, bannerUrl: '/src/assets/images/hero_arena_banner_1794723403097.jpg' }
  );
  assert.deepEqual(
    validateTournamentBannerUrl('https://cdn.example.com/arena.png'),
    { valid: true, bannerUrl: 'https://cdn.example.com/arena.png' }
  );
  assert.equal(validateTournamentBannerUrl('').valid, false);
  assert.equal(validateTournamentBannerUrl('   ').valid, false);
  assert.equal(validateTournamentBannerUrl('javascript:alert(1)').valid, false);
  assert.equal(validateTournamentBannerUrl('data:image/png;base64,AAAA').valid, false);
  assert.equal(validateTournamentBannerUrl(`https://example.com/${'a'.repeat(290)}`).valid, false);
});
