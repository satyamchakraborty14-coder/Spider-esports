import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  linkWithCredential,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  BRAND_ASSETS,
  DEFAULT_ADMIN_SETTINGS,
  SEED_ANNOUNCEMENTS,
  SEED_LEADERBOARD,
  SEED_MATCHES,
  SEED_RESULTS,
  SEED_TOURNAMENTS,
} from './seedData';
import type {
  AdminSettings,
  Announcement,
  LeaderboardEntry,
  MatchCredential,
  MatchInfo,
  NotificationItem,
  ProfileThemeId,
  Registration,
  ResultStanding,
  TeammateInput,
  Tournament,
  TournamentResult,
  UserProfile,
  WithdrawalMethod,
  WithdrawalRequest,
} from '../types/esports';
import {
  COSMETIC_CATALOG,
  evaluateUnlockedAchievements,
  formatRupees,
  isCosmeticUnlocked,
  validateAdminCoinAdjustment,
  validateWithdrawalRequest,
} from '../utils/coinSystem';
import {
  isStrictSoleAdminEmail,
  isStrictSoleAdminSession,
  validateAdminPassword,
  validateAdminSlotUpdate,
  validateSlotAssignment,
  validateTournamentBannerUrl,
} from '../utils/tournamentRules';

function toIsoString(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function normalizeTournament(id: string, data: Record<string, unknown>): Tournament {
  return {
    ...(data as Omit<Tournament, 'id'>),
    id,
    coinReward:
      typeof data.coinReward === 'number'
        ? data.coinReward
        : typeof data.xpReward === 'number'
          ? data.xpReward
          : 0,
    perKillCoins: typeof data.perKillCoins === 'number' ? data.perKillCoins : 10,
    registrationDeadline: toIsoString(data.registrationDeadline),
    credentialsReleaseAt: toIsoString(data.credentialsReleaseAt),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  } as Tournament;
}

function normalizeUserProfile(uid: string, data: Record<string, unknown>): UserProfile {
  return {
    ...(data as Omit<UserProfile, 'uid'>),
    uid,
    coins: typeof data.coins === 'number' ? data.coins : 0,
    unlockedCosmetics: Array.isArray(data.unlockedCosmetics)
      ? (data.unlockedCosmetics as string[])
      : ['theme-obsidian', 'badge-web-striker'],
    achievements: Array.isArray(data.achievements) ? (data.achievements as string[]) : [],
    ...(data.lastDailyClaimAt ? { lastDailyClaimAt: toIsoString(data.lastDailyClaimAt) } : {}),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  } as UserProfile;
}

function normalizeLeaderboardEntry(id: string, data: Record<string, unknown>): LeaderboardEntry {
  return {
    ...(data as Omit<LeaderboardEntry, 'id'>),
    id,
    coins: typeof data.coins === 'number' ? data.coins : 0,
    updatedAt: toIsoString(data.updatedAt),
  } as LeaderboardEntry;
}

let activeSignInProvider: string | null = null;

export async function refreshActiveSignInProvider(
  user: User | null,
  forceRefresh = false
): Promise<string | null> {
  if (!user) {
    activeSignInProvider = null;
    return null;
  }
  try {
    const tokenResult = await user.getIdTokenResult(forceRefresh);
    activeSignInProvider = tokenResult.signInProvider ?? null;
    return activeSignInProvider;
  } catch {
    activeSignInProvider = null;
    return null;
  }
}

export function isUserAdmin(
  user: User | null,
  signInProvider: string | null = activeSignInProvider
): boolean {
  if (!user) return false;
  return isStrictSoleAdminSession({
    email: user.email,
    emailVerified: user.emailVerified,
    signInProvider,
  });
}

function assertSoleAdmin(): void {
  if (!isUserAdmin(auth.currentUser, activeSignInProvider)) {
    throw new Error(
      'Unauthorized: Admin controls require signing in with the verified owner email and password.'
    );
  }
}

export async function setOrUpdateAppPassword(
  newPassword: string,
  confirmPassword: string
): Promise<'linked' | 'updated'> {
  const user = auth.currentUser;
  if (!user || !user.email || !isStrictSoleAdminEmail(user.email, user.emailVerified)) {
    throw new Error('Only the verified platform owner can set or update the admin app password.');
  }

  const validationError = validateAdminPassword(newPassword, confirmPassword);
  if (validationError) {
    throw new Error(validationError);
  }

  const hasPasswordProvider = user.providerData.some((p) => p.providerId === 'password');
  try {
    if (hasPasswordProvider) {
      await updatePassword(user, newPassword);
      return 'updated';
    }
    const credential = EmailAuthProvider.credential(user.email, newPassword);
    await linkWithCredential(user, credential);
    return 'linked';
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
      throw new Error(
        'Email/Password sign-in is still disabled on Firebase project "speedy-tiger-jh5g6". Open Firebase Console for project speedy-tiger-jh5g6 > Authentication > Sign-in method, enable Email/Password, and click Save.'
      );
    }
    if (code === 'auth/requires-recent-login') {
      throw new Error('Please sign out and sign back in first before changing your app password.');
    }
    throw error instanceof Error ? error : new Error('Failed to save app password.');
  }
}

// Subscriptions
export function subscribeTournaments(
  isAdmin: boolean,
  callback: (items: Tournament[]) => void
): Unsubscribe {
  const q = isAdmin
    ? query(collection(db, 'tournaments'), orderBy('createdAt', 'desc'))
    : query(collection(db, 'tournaments'), where('published', '==', true));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) =>
        normalizeTournament(d.id, d.data() as Record<string, unknown>)
      );
      items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      callback(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tournaments');
    }
  );
}

export function subscribeMatches(callback: (items: MatchInfo[]) => void): Unsubscribe {
  const q = query(collection(db, 'matches'), where('status', '!=', 'cancelled'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          ...data,
          id: d.id,
          credentialsReleaseAt: toIsoString(data.credentialsReleaseAt),
          updatedAt: toIsoString(data.updatedAt),
        } as MatchInfo;
      });
      callback(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'matches');
    }
  );
}

export function subscribeTournamentRegistrations(
  tournamentId: string,
  callback: (items: Registration[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'registrations'),
    where('tournamentId', '==', tournamentId),
    where('status', '==', 'confirmed')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          ...data,
          id: d.id,
          createdAt: toIsoString(data.createdAt),
          updatedAt: toIsoString(data.updatedAt),
        } as Registration;
      });
      items.sort((a, b) => a.slotNumber - b.slotNumber);
      callback(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `registrations?tournamentId=${tournamentId}`);
    }
  );
}

export function subscribeUserRegistrations(
  userId: string,
  callback: (items: Registration[]) => void
): Unsubscribe {
  const q = query(collection(db, 'registrations'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          ...data,
          id: d.id,
          createdAt: toIsoString(data.createdAt),
          updatedAt: toIsoString(data.updatedAt),
        } as Registration;
      });
      callback(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `registrations?userId=${userId}`);
    }
  );
}

export function subscribeLeaderboard(callback: (items: LeaderboardEntry[]) => void): Unsubscribe {
  const q = query(collection(db, 'leaderboards'), where('totalPoints', '>=', 0));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) =>
        normalizeLeaderboardEntry(d.id, d.data() as Record<string, unknown>)
      );
      callback(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'leaderboards');
    }
  );
}

export function subscribeResults(
  isAdmin: boolean,
  callback: (items: TournamentResult[]) => void
): Unsubscribe {
  const q = isAdmin
    ? query(collection(db, 'results'))
    : query(collection(db, 'results'), where('verified', '==', true));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          ...data,
          id: d.id,
          publishedAt: toIsoString(data.publishedAt),
        } as TournamentResult;
      });
      items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
      callback(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'results');
    }
  );
}

export function subscribeAnnouncements(callback: (items: Announcement[]) => void): Unsubscribe {
  const q = query(collection(db, 'announcements'), where('active', '==', true));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          ...data,
          id: d.id,
          createdAt: toIsoString(data.createdAt),
        } as Announcement;
      });
      items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      callback(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'announcements');
    }
  );
}

export function subscribeNotifications(
  userId: string,
  callback: (items: NotificationItem[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'notifications'),
    where('userId', 'in', [userId, 'all'])
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          ...data,
          id: d.id,
          createdAt: toIsoString(data.createdAt),
        } as NotificationItem;
      });
      items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      callback(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    }
  );
}

export function subscribeUserWithdrawals(
  userId: string,
  callback: (items: WithdrawalRequest[]) => void
): Unsubscribe {
  const q = query(collection(db, 'withdrawals'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          ...data,
          id: d.id,
          createdAt: toIsoString(data.createdAt),
          updatedAt: toIsoString(data.updatedAt),
        } as WithdrawalRequest;
      });
      items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      callback(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `withdrawals?userId=${userId}`);
    }
  );
}

export function adminSubscribeWithdrawals(
  callback: (items: WithdrawalRequest[]) => void
): Unsubscribe {
  const q = query(collection(db, 'withdrawals'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          ...data,
          id: d.id,
          createdAt: toIsoString(data.createdAt),
          updatedAt: toIsoString(data.updatedAt),
        } as WithdrawalRequest;
      });
      callback(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'withdrawals');
    }
  );
}

export function subscribeAdminSettings(callback: (item: AdminSettings | null) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'admin_settings', 'default'),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      const data = snapshot.data();
      callback({
        ...data,
        id: snapshot.id,
        updatedAt: toIsoString(data.updatedAt),
      } as AdminSettings);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'admin_settings/default');
    }
  );
}

async function migrateLegacyUserDocIfNeeded(uid: string, rawData: Record<string, unknown>): Promise<void> {
  if (!auth.currentUser?.emailVerified || auth.currentUser.uid !== uid) {
    return;
  }
  if (
    typeof rawData.coins === 'number' &&
    !('xp' in rawData) &&
    !('level' in rawData) &&
    !('cosmeticPoints' in rawData)
  ) {
    return;
  }
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', uid), {
      coins: typeof rawData.coins === 'number' ? rawData.coins : 0,
      xp: deleteField(),
      level: deleteField(),
      cosmeticPoints: deleteField(),
      updatedAt: serverTimestamp(),
    });
    const lbRef = doc(db, 'leaderboards', uid);
    const lbSnap = await getDoc(lbRef);
    if (lbSnap.exists()) {
      const lbData = lbSnap.data();
      batch.update(lbRef, {
        coins: typeof lbData.coins === 'number' ? lbData.coins : 0,
        xp: deleteField(),
        level: deleteField(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch {
    // Non-blocking legacy cleanup
  }
}

export function subscribeUserProfile(
  uid: string,
  callback: (profile: UserProfile | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      const data = snapshot.data() as Record<string, unknown>;
      if (
        auth.currentUser?.emailVerified &&
        (typeof data.coins !== 'number' || 'xp' in data || 'level' in data || 'cosmeticPoints' in data)
      ) {
        void migrateLegacyUserDocIfNeeded(uid, data);
      }
      callback(normalizeUserProfile(snapshot.id, data));
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${uid}`);
    }
  );
}

// Auth & Profile Management
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const lower = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(lower)) return false;
  try {
    const snap = await getDoc(doc(db, 'usernames', lower));
    return !snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `usernames/${lower}`);
  }
}

export async function registerWithEmail(params: {
  email: string;
  password: string;
  username: string;
  freeFireIgn: string;
  freeFireUid: string;
}): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, params.email.trim(), params.password);
  await sendEmailVerification(cred.user);
  return cred.user;
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  await reload(cred.user);
  await refreshActiveSignInProvider(cred.user, true);
  return cred.user;
}

export async function loginWithGoogle(): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider);
  await reload(cred.user);
  await refreshActiveSignInProvider(cred.user, true);
  return cred.user;
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export async function createOrCompleteUserProfile(params: {
  user: User;
  username: string;
  freeFireIgn: string;
  freeFireUid: string;
  adConsentAccepted: boolean;
}): Promise<void> {
  const { user, username, freeFireIgn, freeFireUid, adConsentAccepted } = params;
  const cleanUsername = username.trim();
  const usernameLower = cleanUsername.toLowerCase();

  const existingProfile = await getDoc(doc(db, 'users', user.uid));
  if (existingProfile.exists()) return;

  const claimRef = doc(db, 'usernames', usernameLower);
  const claimSnap = await getDoc(claimRef);
  if (claimSnap.exists() && claimSnap.data().uid !== user.uid) {
    throw new Error('That username is already taken. Please choose another.');
  }

  try {
    const batch = writeBatch(db);
    batch.set(claimRef, {
      uid: user.uid,
      username: cleanUsername,
      createdAt: serverTimestamp(),
    });

    batch.set(doc(db, 'users', user.uid), {
      uid: user.uid,
      username: cleanUsername,
      usernameLower,
      freeFireIgn: freeFireIgn.trim(),
      freeFireUid: freeFireUid.trim(),
      avatarUrl: BRAND_ASSETS.defaultAvatar,
      activeTheme: 'obsidian',
      activeBadge: 'badge-web-striker',
      tournamentsJoined: 0,
      matchesPlayed: 0,
      totalWins: 0,
      totalKills: 0,
      totalPoints: 0,
      coins: 0,
      unlockedCosmetics: ['theme-obsidian', 'badge-web-striker'],
      achievements: [],
      suspended: false,
      fcmEnabled: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'users', user.uid, 'private', 'info'), {
      uid: user.uid,
      email: user.email || '',
      adConsentAccepted,
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'leaderboards', user.uid), {
      id: user.uid,
      userId: user.uid,
      username: cleanUsername,
      avatarUrl: BRAND_ASSETS.defaultAvatar,
      totalWins: 0,
      totalKills: 0,
      totalPoints: 0,
      weeklyWins: 0,
      weeklyKills: 0,
      weeklyPoints: 0,
      coins: 0,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }
}

export async function updatePlayerIdentity(
  uid: string,
  updates: { freeFireIgn: string; freeFireUid: string; fcmEnabled?: boolean }
): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) {
    throw new Error('Please verify your email address first using the banner at the top of your Profile.');
  }
  try {
    await updateDoc(doc(db, 'users', uid), {
      freeFireIgn: updates.freeFireIgn.trim(),
      freeFireUid: updates.freeFireUid.trim(),
      ...(typeof updates.fcmEnabled === 'boolean' ? { fcmEnabled: updates.fcmEnabled } : {}),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function deleteAccountCompletely(profile: UserProfile): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Must be signed in to delete account.');
  if (!user.emailVerified) {
    throw new Error('Please verify your email address first before deleting your account.');
  }
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', user.uid, 'private', 'info'));
    batch.delete(doc(db, 'users', user.uid));
    batch.delete(doc(db, 'usernames', profile.usernameLower));
    batch.delete(doc(db, 'leaderboards', user.uid));
    await batch.commit();
    await deleteUser(user);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}`);
  }
}

// Tournament Registration & Room Credentials
export async function joinTournamentInFirestore(params: {
  tournament: Tournament;
  profile: UserProfile;
  freeFireIgn: string;
  freeFireUid: string;
  teamName?: string;
  teammates?: TeammateInput[];
}): Promise<{ slotNumber: number; nextFilledSlots: number }> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) {
    throw new Error('Please verify your email address in your Profile before joining tournaments.');
  }
  const { tournament, profile, freeFireIgn, freeFireUid, teamName, teammates } = params;
  const regId = `${tournament.id}_${profile.uid}`;
  const tRef = doc(db, 'tournaments', tournament.id);
  const regRef = doc(db, 'registrations', regId);
  const userRef = doc(db, 'users', profile.uid);

  try {
    const result = await runTransaction(db, async (tx) => {
      const [tSnap, regSnap, userSnap] = await Promise.all([
        tx.get(tRef),
        tx.get(regRef),
        tx.get(userRef),
      ]);

      if (!tSnap.exists()) {
        throw new Error('This tournament is not active in the database yet. Ask the admin to sync or publish brackets.');
      }

      const tData = tSnap.data();
      if (!tData.published || tData.status !== 'upcoming') {
        throw new Error('This tournament is no longer open for registration.');
      }

      const currentFilled = typeof tData.filledSlots === 'number' ? tData.filledSlots : 0;
      const liveMaxSlots = typeof tData.maxSlots === 'number' ? tData.maxSlots : tournament.maxSlots;
      if (currentFilled >= liveMaxSlots) {
        throw new Error('All tournament slots are full.');
      }

      if (regSnap.exists() && regSnap.data().status === 'confirmed') {
        throw new Error('You have already joined this tournament.');
      }

      const nextFilled = currentFilled + 1;
      const assignedSlot = Math.min(liveMaxSlots, nextFilled);

      const userData = userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : {};
      const currentJoined =
        typeof userData.tournamentsJoined === 'number'
          ? userData.tournamentsJoined
          : profile.tournamentsJoined;
      const nextTournamentsJoined = currentJoined + 1;

      const nextAchievements = evaluateUnlockedAchievements({
        tournamentsJoined: nextTournamentsJoined,
        totalKills: profile.totalKills,
        totalWins: profile.totalWins,
        coins: profile.coins,
        achievements: profile.achievements,
      });
      const nextCosmetics = Array.from(
        new Set([
          ...(profile.unlockedCosmetics || []),
          ...COSMETIC_CATALOG.filter((c) =>
            isCosmeticUnlocked(c, {
              tournamentsJoined: nextTournamentsJoined,
              totalKills: profile.totalKills,
              totalWins: profile.totalWins,
              unlockedCosmetics: profile.unlockedCosmetics,
            })
          ).map((c) => c.id),
        ])
      );

      const regPayload: Record<string, unknown> = {
        id: regId,
        tournamentId: tournament.id,
        userId: profile.uid,
        username: profile.username,
        freeFireIgn: freeFireIgn.trim(),
        freeFireUid: freeFireUid.trim(),
        slotNumber: assignedSlot,
        status: 'confirmed',
        updatedAt: serverTimestamp(),
      };
      if (teamName?.trim()) regPayload.teamName = teamName.trim();
      if (teammates && teammates.length > 0) regPayload.teammates = teammates;

      if (regSnap.exists()) {
        tx.update(regRef, regPayload);
      } else {
        tx.set(regRef, {
          ...regPayload,
          createdAt: serverTimestamp(),
        });
      }

      tx.update(tRef, {
        filledSlots: nextFilled,
        updatedAt: serverTimestamp(),
      });

      tx.update(userRef, {
        tournamentsJoined: nextTournamentsJoined,
        achievements: nextAchievements,
        unlockedCosmetics: nextCosmetics,
        updatedAt: serverTimestamp(),
      });

      const notifId = `reg_${tournament.id}_${Date.now()}`;
      tx.set(doc(db, 'notifications', notifId), {
        id: notifId,
        userId: profile.uid,
        title: 'Joined Tournament',
        body: `Slot #${assignedSlot} confirmed for ${tournament.title} (${tournament.mode}).`,
        type: 'registration',
        tournamentId: tournament.id,
        read: false,
        createdAt: serverTimestamp(),
      });

      return { slotNumber: assignedSlot, nextFilledSlots: nextFilled };
    });

    return result;
  } catch (error) {
    if (error instanceof Error && !error.message.toLowerCase().includes('permission')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `registrations/${regId}`);
  }
}

export async function cancelTournamentRegistration(params: {
  tournament: Tournament;
  profile: UserProfile;
}): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) {
    throw new Error('Please verify your email address before modifying tournament registrations.');
  }
  const { tournament, profile } = params;
  const regId = `${tournament.id}_${profile.uid}`;
  const tRef = doc(db, 'tournaments', tournament.id);
  const regRef = doc(db, 'registrations', regId);
  try {
    await runTransaction(db, async (tx) => {
      const [tSnap, regSnap] = await Promise.all([tx.get(tRef), tx.get(regRef)]);
      if (!regSnap.exists() || regSnap.data().status !== 'confirmed') {
        throw new Error('No active registration found to cancel.');
      }
      const currentFilled =
        tSnap.exists() && typeof tSnap.data().filledSlots === 'number'
          ? tSnap.data().filledSlots
          : tournament.filledSlots;

      tx.update(regRef, {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
      tx.update(tRef, {
        filledSlots: Math.max(0, currentFilled - 1),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof Error && !error.message.toLowerCase().includes('permission')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `registrations/${regId}`);
  }
}

export async function fetchProtectedRoomCredentials(
  tournamentId: string
): Promise<MatchCredential | null> {
  try {
    const snap = await getDoc(doc(db, 'matches', tournamentId, 'credentials', 'secret'));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      tournamentId: data.tournamentId,
      roomId: data.roomId,
      roomPassword: data.roomPassword,
      releaseAt: toIsoString(data.releaseAt),
      updatedAt: toIsoString(data.updatedAt),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `matches/${tournamentId}/credentials/secret`);
  }
}

// Milestone Cosmetic Equip (zero external coins)
export async function equipCosmetic(params: {
  profile: UserProfile;
  cosmeticId: string;
  type: 'theme' | 'badge';
  themeId?: ProfileThemeId;
}): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) {
    throw new Error('Please verify your email address before updating your profile cosmetics.');
  }
  const { profile, cosmeticId, type, themeId } = params;
  const item = COSMETIC_CATALOG.find((c) => c.id === cosmeticId);
  if (!item || !isCosmeticUnlocked(item, profile)) {
    throw new Error('Complete the required match milestone to unlock this cosmetic.');
  }

  const nextUnlocked = profile.unlockedCosmetics.includes(cosmeticId)
    ? profile.unlockedCosmetics
    : [...profile.unlockedCosmetics, cosmeticId];

  try {
    await updateDoc(doc(db, 'users', profile.uid), {
      unlockedCosmetics: nextUnlocked,
      ...(type === 'theme' && themeId ? { activeTheme: themeId } : {}),
      ...(type === 'badge' ? { activeBadge: cosmeticId } : {}),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${profile.uid}`);
  }
}

// Non-cash Cosmetic Unlock via verified Rewarded Ad completion (never grants coins or currency)
export async function unlockRewardedAdCosmetic(params: {
  profile: UserProfile;
  cosmeticId: string;
}): Promise<{ alreadyUnlocked: boolean }> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) {
    throw new Error('Please verify your email address before unlocking profile cosmetics.');
  }
  const { profile, cosmeticId } = params;
  const item = COSMETIC_CATALOG.find((c) => c.id === cosmeticId);
  if (!item || !item.rewardedAdUnlock) {
    throw new Error('Selected cosmetic is not eligible for rewarded ad unlock.');
  }

  if (profile.unlockedCosmetics?.includes(cosmeticId)) {
    return { alreadyUnlocked: true };
  }

  const nextUnlocked = Array.from(new Set([...(profile.unlockedCosmetics || []), cosmeticId])).slice(0, 20);
  try {
    await updateDoc(doc(db, 'users', profile.uid), {
      unlockedCosmetics: nextUnlocked,
      activeBadge: cosmeticId,
      updatedAt: serverTimestamp(),
    });
    return { alreadyUnlocked: false };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${profile.uid}`);
  }
}

// Coin Withdrawals (100 Coins = ₹10)
export async function requestCoinWithdrawal(params: {
  profile: UserProfile;
  amountCoins: number;
  method: WithdrawalMethod;
  destination: string;
}): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) {
    throw new Error('Please verify your email address before submitting a withdrawal request.');
  }
  const { profile, amountCoins, method, destination } = params;
  if (profile.suspended) {
    throw new Error('Suspended accounts cannot submit withdrawal requests.');
  }

  const check = validateWithdrawalRequest({
    amountCoins,
    availableCoins: profile.coins,
    method,
    destination,
  });
  if (!check.valid) {
    throw new Error(check.error);
  }

  const withdrawalId = `wd_${profile.uid}_${Date.now()}`;
  const notifId = `wdn_${Date.now()}`;

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', profile.uid), {
      coins: profile.coins - check.coins,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'withdrawals', withdrawalId), {
      id: withdrawalId,
      userId: profile.uid,
      username: profile.username,
      freeFireUid: profile.freeFireUid,
      coins: check.coins,
      rupees: check.rupees,
      method,
      destination: check.destination,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'notifications', notifId), {
      id: notifId,
      userId: profile.uid,
      title: 'Withdrawal Request Submitted',
      body: `Requested ${formatRupees(check.rupees)} for ${check.coins.toLocaleString()} coins via ${method.toUpperCase()}.`,
      type: 'withdrawal',
      read: false,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `withdrawals/${withdrawalId}`);
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

// Admin Operations
export async function adminMigrateLegacyDocs(): Promise<void> {
  assertSoleAdmin();
  try {
    const batch = writeBatch(db);
    let ops = 0;

    const tourneySnap = await getDocs(collection(db, 'tournaments'));
    for (const d of tourneySnap.docs) {
      const data = d.data();
      if ('xpReward' in data || typeof data.coinReward !== 'number' || typeof data.perKillCoins !== 'number') {
        batch.update(d.ref, {
          coinReward: typeof data.coinReward === 'number' ? data.coinReward : Number(data.xpReward ?? 200),
          perKillCoins: typeof data.perKillCoins === 'number' ? data.perKillCoins : 10,
          xpReward: deleteField(),
          updatedAt: serverTimestamp(),
        });
        ops++;
      }
    }

    const lbSnap = await getDocs(collection(db, 'leaderboards'));
    for (const d of lbSnap.docs) {
      const data = d.data();
      if ('xp' in data || 'level' in data || typeof data.coins !== 'number') {
        batch.update(d.ref, {
          coins: typeof data.coins === 'number' ? data.coins : 0,
          xp: deleteField(),
          level: deleteField(),
          updatedAt: serverTimestamp(),
        });
        ops++;
      }
    }

    const userSnap = await getDocs(collection(db, 'users'));
    for (const d of userSnap.docs) {
      const data = d.data();
      if ('xp' in data || 'level' in data || 'cosmeticPoints' in data || typeof data.coins !== 'number') {
        batch.update(d.ref, {
          coins: typeof data.coins === 'number' ? data.coins : 0,
          xp: deleteField(),
          level: deleteField(),
          cosmeticPoints: deleteField(),
          updatedAt: serverTimestamp(),
        });
        ops++;
      }
    }

    if (ops > 0) {
      await batch.commit();
    }
  } catch {
    // Migration runs best-effort
  }
}

export async function seedFirestoreIfEmpty(adminUid: string): Promise<boolean> {
  assertSoleAdmin();
  try {
    const existing = await getDocs(collection(db, 'tournaments'));
    if (!existing.empty) {
      await adminMigrateLegacyDocs();
      return false;
    }

    const batch = writeBatch(db);
    for (const t of SEED_TOURNAMENTS) {
      batch.set(doc(db, 'tournaments', t.id), {
        ...t,
        registrationDeadline: Timestamp.fromDate(new Date(t.registrationDeadline)),
        credentialsReleaseAt: Timestamp.fromDate(new Date(t.credentialsReleaseAt)),
        createdBy: adminUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    for (const m of SEED_MATCHES) {
      batch.set(doc(db, 'matches', m.id), {
        ...m,
        credentialsReleaseAt: Timestamp.fromDate(new Date(m.credentialsReleaseAt)),
        updatedAt: serverTimestamp(),
      });
    }
    for (const r of SEED_RESULTS) {
      batch.set(doc(db, 'results', r.id), {
        ...r,
        publishedAt: serverTimestamp(),
      });
    }
    for (const l of SEED_LEADERBOARD) {
      batch.set(doc(db, 'leaderboards', l.id), {
        ...l,
        updatedAt: serverTimestamp(),
      });
    }
    for (const a of SEED_ANNOUNCEMENTS) {
      batch.set(doc(db, 'announcements', a.id), {
        ...a,
        createdAt: serverTimestamp(),
      });
    }
    batch.set(doc(db, 'admin_settings', 'default'), {
      ...DEFAULT_ADMIN_SETTINGS,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seedFirestoreIfEmpty');
  }
}

export async function adminSaveTournament(
  tournament: Omit<Tournament, 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  assertSoleAdmin();
  const slotCheck = validateAdminSlotUpdate(
    tournament.maxSlots,
    isNew ? 0 : tournament.filledSlots
  );
  if (!slotCheck.valid) {
    throw new Error(slotCheck.error);
  }
  if (tournament.bannerUrl) {
    const bannerCheck = validateTournamentBannerUrl(tournament.bannerUrl);
    if (!bannerCheck.valid) {
      throw new Error(bannerCheck.error);
    }
  }

  try {
    const tRef = doc(db, 'tournaments', tournament.id);
    const mRef = doc(db, 'matches', tournament.id);
    const batch = writeBatch(db);

    const basePayload = {
      ...tournament,
      bannerUrl: tournament.bannerUrl?.trim() || undefined,
      maxSlots: slotCheck.maxSlots,
      coinReward: Math.max(0, Math.floor(tournament.coinReward)),
      perKillCoins: Math.max(0, Math.floor(tournament.perKillCoins)),
      registrationDeadline: Timestamp.fromDate(new Date(tournament.registrationDeadline)),
      credentialsReleaseAt: Timestamp.fromDate(new Date(tournament.credentialsReleaseAt)),
      updatedAt: serverTimestamp(),
    };

    if (isNew) {
      batch.set(tRef, {
        ...basePayload,
        filledSlots: 0,
        createdAt: serverTimestamp(),
      });
      batch.set(mRef, {
        id: tournament.id,
        tournamentId: tournament.id,
        title: tournament.title,
        mode: tournament.mode,
        status: tournament.status === 'live' ? 'live' : 'scheduled',
        credentialsPublished: false,
        credentialsReleaseAt: Timestamp.fromDate(new Date(tournament.credentialsReleaseAt)),
        updatedAt: serverTimestamp(),
      });
    } else {
      // Never overwrite live player-driven filledSlots during tournament edits
      const { filledSlots: _ignoreFilled, ...updateFields } = basePayload;
      batch.update(tRef, {
        ...updateFields,
        xpReward: deleteField(),
      });
      batch.set(
        mRef,
        {
          id: tournament.id,
          tournamentId: tournament.id,
          title: tournament.title,
          mode: tournament.mode,
          status:
            tournament.status === 'cancelled'
              ? 'cancelled'
              : tournament.status === 'completed'
                ? 'completed'
                : tournament.status === 'live'
                  ? 'live'
                  : 'scheduled',
          credentialsReleaseAt: Timestamp.fromDate(new Date(tournament.credentialsReleaseAt)),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `tournaments/${tournament.id}`);
  }
}

export async function adminUpdateTournamentSlots(
  tournamentId: string,
  maxSlots: number
): Promise<void> {
  assertSoleAdmin();
  try {
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    const liveFilled = snap.exists() && typeof snap.data().filledSlots === 'number'
      ? snap.data().filledSlots
      : 0;
    const slotCheck = validateAdminSlotUpdate(maxSlots, liveFilled);
    if (!slotCheck.valid) {
      throw new Error(slotCheck.error);
    }
    await updateDoc(tRef, {
      maxSlots: slotCheck.maxSlots,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (error instanceof Error && !error.message.toLowerCase().includes('permission')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `tournaments/${tournamentId}`);
  }
}

export async function adminUpdateTournamentBanner(
  tournamentId: string,
  bannerUrl: string
): Promise<void> {
  assertSoleAdmin();
  const check = validateTournamentBannerUrl(bannerUrl);
  if (!check.valid) {
    throw new Error(check.error);
  }
  try {
    await updateDoc(doc(db, 'tournaments', tournamentId), {
      bannerUrl: check.bannerUrl,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `tournaments/${tournamentId}`);
  }
}

export async function adminUpdateRegistrationSlot(
  registrationId: string,
  slotNumber: number,
  maxSlots: number
): Promise<void> {
  assertSoleAdmin();
  const check = validateSlotAssignment(slotNumber, maxSlots);
  if (!check.valid) {
    throw new Error(check.error);
  }
  try {
    await updateDoc(doc(db, 'registrations', registrationId), {
      slotNumber: check.slotNumber,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `registrations/${registrationId}`);
  }
}

export async function adminDeleteTournament(tournamentId: string): Promise<void> {
  assertSoleAdmin();
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'tournaments', tournamentId));
    batch.delete(doc(db, 'matches', tournamentId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `tournaments/${tournamentId}`);
  }
}

export async function adminPublishRoomCredentials(params: {
  tournament: Tournament;
  roomId: string;
  roomPassword: string;
  releaseAtIso: string;
}): Promise<void> {
  assertSoleAdmin();
  const { tournament, roomId, roomPassword, releaseAtIso } = params;
  const releaseTs = Timestamp.fromDate(new Date(releaseAtIso));

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'matches', tournament.id), {
      id: tournament.id,
      tournamentId: tournament.id,
      title: tournament.title,
      mode: tournament.mode,
      status: 'room_ready',
      credentialsPublished: true,
      credentialsReleaseAt: releaseTs,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'matches', tournament.id, 'credentials', 'secret'), {
      tournamentId: tournament.id,
      roomId: roomId.trim(),
      roomPassword: roomPassword.trim(),
      releaseAt: releaseTs,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'tournaments', tournament.id), {
      credentialsReleaseAt: releaseTs,
      updatedAt: serverTimestamp(),
    });
    const notifId = `room_${tournament.id}_${Date.now()}`;
    batch.set(doc(db, 'notifications', notifId), {
      id: notifId,
      userId: 'all',
      title: 'Match Room Ready',
      body: `Room credentials configured for ${tournament.title}. Check Match Details at release time.`,
      type: 'room',
      tournamentId: tournament.id,
      read: false,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `matches/${tournament.id}/credentials/secret`);
  }
}

export async function adminAdjustUserCoins(params: {
  userId: string;
  deltaCoins: number;
  reason: string;
}): Promise<number> {
  assertSoleAdmin();
  const { userId, deltaCoins, reason } = params;

  try {
    const userRef = doc(db, 'users', userId);
    const lbRef = doc(db, 'leaderboards', userId);
    const [userSnap, lbSnap] = await Promise.all([getDoc(userRef), getDoc(lbRef)]);
    if (!userSnap.exists()) {
      throw new Error('Player profile not found.');
    }

    const rawUser = userSnap.data() as Record<string, unknown>;
    const currentCoins = typeof rawUser.coins === 'number' ? rawUser.coins : 0;
    const check = validateAdminCoinAdjustment({ currentCoins, deltaCoins });
    if (!check.valid) {
      throw new Error(check.error);
    }

    const batch = writeBatch(db);
    batch.update(userRef, {
      coins: check.nextCoins,
      xp: deleteField(),
      level: deleteField(),
      cosmeticPoints: deleteField(),
      updatedAt: serverTimestamp(),
    });

    if (lbSnap.exists()) {
      batch.update(lbRef, {
        coins: check.nextCoins,
        xp: deleteField(),
        level: deleteField(),
        updatedAt: serverTimestamp(),
      });
    }

    const notifId = `coins_${userId}_${Date.now()}`;
    const verb = deltaCoins > 0 ? `+${deltaCoins.toLocaleString()} Spider Coins credited` : `${deltaCoins.toLocaleString()} Spider Coins adjusted`;
    batch.set(doc(db, 'notifications', notifId), {
      id: notifId,
      userId,
      title: deltaCoins > 0 ? 'Spider Coins Credited' : 'Spider Coin Balance Adjusted',
      body: `${verb} by admin${reason.trim() ? `: ${reason.trim()}` : '.'}`,
      type: 'result',
      read: false,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return check.nextCoins;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
  }
}

export async function adminPublishMatchResult(params: {
  tournament: Tournament;
  winnerUserId?: string;
  winnerName: string;
  totalKills: number;
  winnerCoins: number;
  participationCoins?: number;
  standings: ResultStanding[];
  verified?: boolean;
}): Promise<{ published: boolean; alreadyPublished: boolean }> {
  assertSoleAdmin();
  const {
    tournament,
    winnerUserId,
    winnerName,
    totalKills,
    winnerCoins,
    participationCoins = 0,
    standings,
    verified = true,
  } = params;
  const resultId = `res-${tournament.id}`;
  const cleanWinnerCoins = Math.max(0, Math.floor(winnerCoins));
  const cleanParticipationCoins = Math.max(0, Math.floor(participationCoins));

  try {
    const resultRef = doc(db, 'results', resultId);
    const existingResultSnap = await getDoc(resultRef);
    const wasAlreadyPublished =
      existingResultSnap.exists() && existingResultSnap.data().verified === true;

    const batch = writeBatch(db);
    batch.set(resultRef, {
      id: resultId,
      tournamentId: tournament.id,
      tournamentTitle: tournament.title,
      ...(winnerUserId ? { winnerUserId } : {}),
      winnerName: winnerName.trim(),
      totalKills,
      standings,
      verified,
      publishedAt: serverTimestamp(),
    });

    if (!verified) {
      await batch.commit();
      return { published: false, alreadyPublished: wasAlreadyPublished };
    }

    batch.update(doc(db, 'tournaments', tournament.id), {
      status: 'completed',
      updatedAt: serverTimestamp(),
    });
    batch.set(
      doc(db, 'matches', tournament.id),
      {
        id: tournament.id,
        tournamentId: tournament.id,
        title: tournament.title,
        mode: tournament.mode,
        status: 'completed',
        credentialsPublished: true,
        credentialsReleaseAt: Timestamp.fromDate(new Date(tournament.credentialsReleaseAt)),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    // Only increment career stats & credit coins on initial publish to avoid double-crediting on edits
    if (!wasAlreadyPublished) {
      const creditedUserIds = new Set<string>();

      // Build map of ranked players with userId (Rank #1 gets winner bonuses)
      const rankedRows = standings.filter((row) => Boolean(row.userId));
      if (winnerUserId && !rankedRows.some((r) => r.userId === winnerUserId)) {
        rankedRows.unshift({
          rank: 1,
          userId: winnerUserId,
          playerName: winnerName.trim(),
          kills: totalKills,
          coinsAwarded: cleanWinnerCoins,
        });
      }

      for (const row of rankedRows) {
        const uid = row.userId;
        if (!uid || creditedUserIds.has(uid)) continue;
        creditedUserIds.add(uid);

        const isChampion = row.rank === 1 || uid === winnerUserId;
        const awardedCoins = Math.max(
          0,
          Math.floor(
            typeof row.coinsAwarded === 'number'
              ? row.coinsAwarded
              : isChampion
                ? cleanWinnerCoins
                : 0
          )
        );
        const rowKills = Math.max(0, Math.floor(row.kills));

        const [userSnap, lbSnap] = await Promise.all([
          getDoc(doc(db, 'users', uid)),
          getDoc(doc(db, 'leaderboards', uid)),
        ]);

        if (userSnap.exists()) {
          const u = normalizeUserProfile(uid, userSnap.data() as Record<string, unknown>);
          const newCoins = u.coins + awardedCoins;
          const newWins = u.totalWins + (isChampion ? 1 : 0);
          const newKills = u.totalKills + rowKills;
          const newAchievements = evaluateUnlockedAchievements({
            tournamentsJoined: u.tournamentsJoined,
            totalKills: newKills,
            totalWins: newWins,
            coins: newCoins,
            achievements: u.achievements || [],
          });
          const newCosmetics = Array.from(
            new Set([
              ...(u.unlockedCosmetics || []),
              ...COSMETIC_CATALOG.filter((c) =>
                isCosmeticUnlocked(c, {
                  tournamentsJoined: u.tournamentsJoined,
                  totalKills: newKills,
                  totalWins: newWins,
                  unlockedCosmetics: u.unlockedCosmetics,
                })
              ).map((c) => c.id),
            ])
          );

          batch.update(doc(db, 'users', uid), {
            matchesPlayed: u.matchesPlayed + 1,
            totalWins: newWins,
            totalKills: newKills,
            totalPoints: u.totalPoints,
            coins: newCoins,
            unlockedCosmetics: newCosmetics,
            achievements: newAchievements,
            xp: deleteField(),
            level: deleteField(),
            cosmeticPoints: deleteField(),
            updatedAt: serverTimestamp(),
          });

          const lbData = lbSnap.exists() ? lbSnap.data() : null;
          batch.set(doc(db, 'leaderboards', uid), {
            id: uid,
            userId: uid,
            username: u.username,
            avatarUrl: u.avatarUrl || BRAND_ASSETS.defaultAvatar,
            totalWins: newWins,
            totalKills: newKills,
            totalPoints: u.totalPoints,
            weeklyWins: (lbData?.weeklyWins || 0) + (isChampion ? 1 : 0),
            weeklyKills: (lbData?.weeklyKills || 0) + rowKills,
            weeklyPoints: lbData?.weeklyPoints || 0,
            coins: newCoins,
            updatedAt: serverTimestamp(),
          });
        }
      }

      // Update matchesPlayed (and participationCoins if > 0) for remaining confirmed participants
      const regSnap = await getDocs(
        query(
          collection(db, 'registrations'),
          where('tournamentId', '==', tournament.id),
          where('status', '==', 'confirmed')
        )
      );
      for (const regDoc of regSnap.docs) {
        const reg = regDoc.data() as Registration;
        if (!reg.userId || creditedUserIds.has(reg.userId)) continue;
        creditedUserIds.add(reg.userId);

        const pUserSnap = await getDoc(doc(db, 'users', reg.userId));
        if (!pUserSnap.exists()) continue;
        const pProfile = normalizeUserProfile(
          reg.userId,
          pUserSnap.data() as Record<string, unknown>
        );
        const nextPlayerCoins = pProfile.coins + cleanParticipationCoins;
        const nextAchievements = evaluateUnlockedAchievements({
          tournamentsJoined: pProfile.tournamentsJoined,
          totalKills: pProfile.totalKills,
          totalWins: pProfile.totalWins,
          coins: nextPlayerCoins,
          achievements: pProfile.achievements || [],
        });

        batch.update(doc(db, 'users', reg.userId), {
          matchesPlayed: pProfile.matchesPlayed + 1,
          coins: nextPlayerCoins,
          achievements: nextAchievements,
          xp: deleteField(),
          level: deleteField(),
          cosmeticPoints: deleteField(),
          updatedAt: serverTimestamp(),
        });

        const pLbSnap = await getDoc(doc(db, 'leaderboards', reg.userId));
        if (pLbSnap.exists()) {
          batch.update(doc(db, 'leaderboards', reg.userId), {
            coins: nextPlayerCoins,
            xp: deleteField(),
            level: deleteField(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      const notifId = `res_${tournament.id}_${Date.now()}`;
      batch.set(doc(db, 'notifications', notifId), {
        id: notifId,
        userId: 'all',
        title: 'Official Match Results Published',
        body: `${winnerName} won ${tournament.title} (${totalKills} verified kills) · +${cleanWinnerCoins.toLocaleString()} Spider Coins awarded.`,
        type: 'result',
        tournamentId: tournament.id,
        read: false,
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return { published: true, alreadyPublished: wasAlreadyPublished };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `results/${resultId}`);
  }
}

export async function adminDeleteMatchResult(resultId: string): Promise<void> {
  assertSoleAdmin();
  try {
    await deleteDoc(doc(db, 'results', resultId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `results/${resultId}`);
  }
}

export async function adminProcessWithdrawal(params: {
  withdrawal: WithdrawalRequest;
  status: 'approved' | 'rejected';
  adminNote?: string;
}): Promise<void> {
  assertSoleAdmin();
  const { withdrawal, status, adminNote } = params;
  if (withdrawal.status !== 'pending') {
    throw new Error('This withdrawal request has already been processed.');
  }

  try {
    const batch = writeBatch(db);
    const cleanNote = adminNote?.trim();
    batch.update(doc(db, 'withdrawals', withdrawal.id), {
      status,
      ...(cleanNote ? { adminNote: cleanNote } : {}),
      updatedAt: serverTimestamp(),
    });

    if (status === 'rejected') {
      const userSnap = await getDoc(doc(db, 'users', withdrawal.userId));
      if (userSnap.exists()) {
        const u = normalizeUserProfile(withdrawal.userId, userSnap.data() as Record<string, unknown>);
        const refundedCoins = u.coins + withdrawal.coins;
        batch.update(doc(db, 'users', withdrawal.userId), {
          coins: refundedCoins,
          xp: deleteField(),
          level: deleteField(),
          cosmeticPoints: deleteField(),
          updatedAt: serverTimestamp(),
        });
        const lbSnap = await getDoc(doc(db, 'leaderboards', withdrawal.userId));
        if (lbSnap.exists()) {
          batch.update(doc(db, 'leaderboards', withdrawal.userId), {
            coins: refundedCoins,
            xp: deleteField(),
            level: deleteField(),
            updatedAt: serverTimestamp(),
          });
        }
      }
    }

    const notifId = `wd_res_${Date.now()}`;
    batch.set(doc(db, 'notifications', notifId), {
      id: notifId,
      userId: withdrawal.userId,
      title: status === 'approved' ? 'Withdrawal Approved & Paid' : 'Withdrawal Rejected & Refunded',
      body:
        status === 'approved'
          ? `${formatRupees(withdrawal.rupees)} (${withdrawal.coins.toLocaleString()} coins) payout processed to ${withdrawal.destination}.${cleanNote ? ` Note: ${cleanNote}` : ''}`
          : `${withdrawal.coins.toLocaleString()} coins refunded to your wallet.${cleanNote ? ` Reason: ${cleanNote}` : ''}`,
      type: 'withdrawal',
      read: false,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `withdrawals/${withdrawal.id}`);
  }
}

export async function adminFetchAllUsers(): Promise<UserProfile[]> {
  assertSoleAdmin();
  try {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map((d) => normalizeUserProfile(d.id, d.data() as Record<string, unknown>));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
  }
}

export async function adminToggleUserSuspension(uid: string, suspended: boolean): Promise<void> {
  assertSoleAdmin();
  try {
    await updateDoc(doc(db, 'users', uid), {
      suspended,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function adminPublishAnnouncement(params: {
  title: string;
  message: string;
  priority: 'normal' | 'high';
}): Promise<void> {
  assertSoleAdmin();
  const id = `ann-${Date.now()}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'announcements', id), {
      id,
      title: params.title.trim(),
      message: params.message.trim(),
      priority: params.priority,
      active: true,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'notifications', `notif-${id}`), {
      id: `notif-${id}`,
      userId: 'all',
      title: params.title.trim(),
      body: params.message.trim(),
      type: 'tournament',
      read: false,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `announcements/${id}`);
  }
}

export async function adminSendNotification(params: {
  userId: string;
  title: string;
  body: string;
  type: NotificationItem['type'];
}): Promise<void> {
  assertSoleAdmin();
  const id = `notif-${Date.now()}`;
  try {
    await setDoc(doc(db, 'notifications', id), {
      id,
      userId: params.userId.trim() || 'all',
      title: params.title.trim(),
      body: params.body.trim(),
      type: params.type,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `notifications/${id}`);
  }
}

export async function adminUpdateSettings(settings: Omit<AdminSettings, 'updatedAt'>): Promise<void> {
  assertSoleAdmin();
  try {
    await setDoc(doc(db, 'admin_settings', 'default'), {
      ...settings,
      id: 'default',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'admin_settings/default');
  }
}

export async function adminRemoveRegistration(
  registration: Registration,
  tournament: Tournament
): Promise<void> {
  assertSoleAdmin();
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'registrations', registration.id));
    batch.update(doc(db, 'tournaments', tournament.id), {
      filledSlots: Math.max(0, tournament.filledSlots - 1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `registrations/${registration.id}`);
  }
}
