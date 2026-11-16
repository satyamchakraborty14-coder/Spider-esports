import { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { onAuthStateChanged, reload, sendEmailVerification, type User } from 'firebase/auth';
import { auth } from './lib/firebase';
import {
  createOrCompleteUserProfile,
  isUserAdmin,
  logoutUser,
  refreshActiveSignInProvider,
  seedFirestoreIfEmpty,
  subscribeAdminSettings,
  subscribeAnnouncements,
  subscribeLeaderboard,
  subscribeMatches,
  subscribeNotifications,
  subscribeResults,
  subscribeTournaments,
  subscribeUserProfile,
  subscribeUserRegistrations,
  subscribeUserWithdrawals,
} from './lib/firestoreService';
import { SOLE_ADMIN_EMAIL } from './utils/tournamentRules';
import {
  DEFAULT_ADMIN_SETTINGS,
  SEED_ANNOUNCEMENTS,
  SEED_LEADERBOARD,
  SEED_MATCHES,
  SEED_RESULTS,
  SEED_TOURNAMENTS,
} from './lib/seedData';
import type {
  AdminSettings,
  Announcement,
  LeaderboardEntry,
  MatchInfo,
  NotificationItem,
  Registration,
  Tournament,
  TournamentResult,
  UserProfile,
  WithdrawalRequest,
} from './types/esports';
import { canShowInterstitial } from './utils/coinSystem';
import { resolveEffectiveAdMobConfig } from './utils/admobHelpers';
import { SplashScreen } from './components/SplashScreen';
import { BottomNav, TopNav, type AppTab } from './components/Navigation';
import { HomeView } from './components/HomeView';
import { MatchesView } from './components/MatchesView';
import { ResultsView } from './components/ResultsView';
import { LeaderboardView } from './components/LeaderboardView';
import { ProfileView } from './components/ProfileView';
import { AdminDashboard } from './components/AdminDashboard';
import { MatchDetailsModal } from './components/MatchDetailsModal';
import { AuthModal } from './components/AuthModal';
import { NotificationsModal } from './components/NotificationsModal';
import {
  initializeAdMobRuntime,
  registerAdMobLifecycle,
  showNativeInterstitialAd,
  syncBannerForScreen,
} from './lib/admobBridge';

export default function App() {
  const autostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [showSplash, setShowSplash] = useState(!autostart);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [signInProvider, setSignInProvider] = useState<string | null>(null);
  const [authRevision, setAuthRevision] = useState(0);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [matches, setMatches] = useState<MatchInfo[]>([]);
  const [results, setResults] = useState<TournamentResult[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [userRegistrations, setUserRegistrations] = useState<Registration[]>([]);
  const [userWithdrawals, setUserWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [adminSettings, setAdminSettings] = useState<AdminSettings>(DEFAULT_ADMIN_SETTINGS);

  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // AdMob state
  const [consentAccepted, setConsentAccepted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('spider_ad_consent') === '1';
    } catch {
      return false;
    }
  });
  const [lastInterstitialAt, setLastInterstitialAt] = useState(0);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((current) => (current === msg ? null : current));
    }, 3500);
  };

  // Auth listener with forced token/verification refresh
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (user) {
        void (async () => {
          try {
            if (!user.emailVerified) {
              await reload(user);
            }
          } catch {
            // Ignore transient reload error
          }
          const provider = await refreshActiveSignInProvider(user, true);
          setSignInProvider(provider);
          setAuthRevision((v) => v + 1);
        })();
      } else {
        setSignInProvider(null);
        void refreshActiveSignInProvider(null);
        setProfile(null);
        setProfileLoaded(false);
        setUserRegistrations([]);
        setUserWithdrawals([]);
      }
    });
    return () => unsub();
  }, []);

  // Auto-refresh verification state when user returns from clicking their email verification link
  useEffect(() => {
    if (!authUser || authUser.emailVerified) return;
    const syncVerification = async () => {
      if (!auth.currentUser) return;
      try {
        await reload(auth.currentUser);
        const provider = await refreshActiveSignInProvider(auth.currentUser, true);
        setSignInProvider(provider);
        setAuthRevision((v) => v + 1);
        if (auth.currentUser.emailVerified) {
          showToast('Email verified! Full access unlocked.');
        }
      } catch {
        // Ignore transient focus reload error
      }
    };
    const onFocus = () => {
      void syncVerification();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void syncVerification();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [authUser, authRevision]);

  const isOwnerEmailSignedIn =
    Boolean(authUser?.email) && authUser!.email!.trim().toLowerCase() === SOLE_ADMIN_EMAIL;

  const isAdmin = useMemo(
    () => isUserAdmin(authUser, signInProvider),
    [authUser, signInProvider, authRevision]
  );

  // Strictly block admin tab for any non-owner or unverified session
  useEffect(() => {
    if (activeTab === 'admin' && !isAdmin) {
      setActiveTab('home');
    }
  }, [activeTab, isAdmin]);

  // Auto-seed starter brackets when verified admin signs in on an empty DB
  useEffect(() => {
    if (authReady && authUser && isAdmin) {
      void seedFirestoreIfEmpty(authUser.uid);
    }
  }, [authReady, authUser, isAdmin]);

  // Public Firestore listeners
  useEffect(() => {
    const unsubT = subscribeTournaments(isAdmin, setTournaments);
    const unsubM = subscribeMatches(setMatches);
    const unsubR = subscribeResults(isAdmin, setResults);
    const unsubL = subscribeLeaderboard(setLeaderboard);
    const unsubA = subscribeAnnouncements(setAnnouncements);
    const unsubS = subscribeAdminSettings((s) => {
      if (s) setAdminSettings(s);
    });
    return () => {
      unsubT();
      unsubM();
      unsubR();
      unsubL();
      unsubA();
      unsubS();
    };
  }, [isAdmin]);

  // User-specific Firestore listeners
  useEffect(() => {
    if (!authUser) return;
    const unsubP = subscribeUserProfile(authUser.uid, (p) => {
      setProfile(p);
      setProfileLoaded(true);

      // Complete pending email-registration onboarding once verified
      if (!p && authUser.emailVerified) {
        const pendingRaw = sessionStorage.getItem(`pending_profile_${authUser.uid}`);
        if (pendingRaw) {
          try {
            const parsed = JSON.parse(pendingRaw) as {
              username: string;
              freeFireIgn: string;
              freeFireUid: string;
              adConsent: boolean;
            };
            void createOrCompleteUserProfile({
              user: authUser,
              username: parsed.username,
              freeFireIgn: parsed.freeFireIgn,
              freeFireUid: parsed.freeFireUid,
              adConsentAccepted: parsed.adConsent,
            }).then(() => {
              sessionStorage.removeItem(`pending_profile_${authUser.uid}`);
            });
          } catch {
            // Ignore invalid draft
          }
        }
      }
    });
    const unsubReg = subscribeUserRegistrations(authUser.uid, setUserRegistrations);
    const unsubNotif = subscribeNotifications(authUser.uid, setNotifications);
    const unsubWd = subscribeUserWithdrawals(authUser.uid, setUserWithdrawals);
    return () => {
      unsubP();
      unsubReg();
      unsubNotif();
      unsubWd();
    };
  }, [authUser]);

  // Display Firestore records when populated; fallback cleanly to deterministic catalog while DB is fresh
  const displayTournaments = tournaments.length > 0 ? tournaments : SEED_TOURNAMENTS;
  const displayMatches = matches.length > 0 ? matches : SEED_MATCHES;
  const displayResults = results.length > 0 ? results : SEED_RESULTS;
  const displayLeaderboard = leaderboard.length > 0 ? leaderboard : SEED_LEADERBOARD;
  const displayAnnouncements = announcements.length > 0 ? announcements : SEED_ANNOUNCEMENTS;

  const registeredTournamentIds = useMemo(() => {
    return new Set(
      userRegistrations
        .filter((r) => r.status === 'confirmed')
        .map((r) => r.tournamentId)
    );
  }, [userRegistrations]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const selectedTournament = useMemo(
    () => displayTournaments.find((t) => t.id === selectedTournamentId) || null,
    [displayTournaments, selectedTournamentId]
  );

  const needsOnboardingUser =
    authUser && authUser.emailVerified && profileLoaded && !profile ? authUser : null;

  const adminSettingsRef = useRef(adminSettings);
  const activeTabRef = useRef(activeTab);
  const consentRef = useRef(consentAccepted);
  adminSettingsRef.current = adminSettings;
  activeTabRef.current = activeTab;
  consentRef.current = consentAccepted;

  const updateConsentPreference = (accepted: boolean) => {
    setConsentAccepted(accepted);
    try {
      localStorage.setItem('spider_ad_consent', accepted ? '1' : '0');
    } catch {
      // Ignore storage errors
    }
  };

  useEffect(() => {
    void initializeAdMobRuntime(adminSettings, consentAccepted).then(() =>
      syncBannerForScreen(adminSettings, activeTab, consentAccepted)
    );
  }, [adminSettings, consentAccepted]);

  useEffect(() => {
    void syncBannerForScreen(adminSettings, activeTab, consentAccepted);
  }, [activeTab, adminSettings, consentAccepted]);

  useEffect(() => {
    return registerAdMobLifecycle({
      getSettings: () => adminSettingsRef.current,
      getScreen: () => activeTabRef.current,
      getConsent: () => consentRef.current,
    });
  }, []);

  const maybeShowNaturalBreakInterstitial = (isSafeContext: boolean) => {
    // Web/PWA never fakes interstitial impressions; interstitials run only inside native Android APK
    if (!Capacitor.isNativePlatform()) return;
    if (!isSafeContext || authModalOpen || Boolean(needsOnboardingUser)) return;
    const effectiveConfig = resolveEffectiveAdMobConfig(adminSettings, {
      forceTestMode: Boolean(import.meta.env?.DEV),
    });
    if (!effectiveConfig.interstitialAdsEnabled) return;
    const cooldownMs = Math.max(90_000, effectiveConfig.interstitialCooldownMs);
    if (lastInterstitialAt === 0) {
      setLastInterstitialAt(Date.now());
      return;
    }
    if (
      canShowInterstitial({
        lastShownAtMs: lastInterstitialAt,
        cooldownMs,
        isLiveMatchOrJoining:
          Boolean(selectedTournament && selectedTournament.status !== 'completed') ||
          authModalOpen ||
          Boolean(needsOnboardingUser),
      })
    ) {
      void showNativeInterstitialAd(adminSettings, consentAccepted)
        .then((displayed) => {
          if (displayed) {
            setLastInterstitialAt(Date.now());
          }
        })
        .catch(() => undefined);
    }
  };

  const handleSelectTab = (nextTab: AppTab) => {
    if (nextTab === 'admin' && !isAdmin) {
      return;
    }
    const isNaturalTransition =
      nextTab !== activeTab &&
      (nextTab === 'leaderboard' || nextTab === 'results') &&
      !selectedTournamentId;
    maybeShowNaturalBreakInterstitial(isNaturalTransition);
    setActiveTab(nextTab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRefreshVerification = async () => {
    if (!auth.currentUser) return;
    await reload(auth.currentUser);
    const provider = await refreshActiveSignInProvider(auth.currentUser, true);
    setSignInProvider(provider);
    setAuthUser(auth.currentUser);
    setAuthRevision((v) => v + 1);
    if (auth.currentUser.emailVerified) {
      showToast('Email verified! Completing profile...');
    } else {
      showToast('Email not verified yet. Check your inbox and click the verification link.');
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-[#F4F4F5] pb-24 md:pb-12">
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      <TopNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        unreadCount={unreadCount}
        onOpenNotifications={() => setNotificationsOpen(true)}
        onOpenAuth={() => setAuthModalOpen(true)}
        isSignedIn={Boolean(authUser)}
        isAdmin={isAdmin}
        profile={profile}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
        {!authReady ? (
          <div className="space-y-6 animate-pulse">
            <div className="h-64 rounded-2xl bg-[#121216]" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="h-72 rounded-xl bg-[#121216]" />
              <div className="h-72 rounded-xl bg-[#121216]" />
              <div className="h-72 rounded-xl bg-[#121216]" />
            </div>
          </div>
        ) : (
          <>
            {isOwnerEmailSignedIn && !isAdmin && authUser && (
              <section
                aria-label="Owner Admin Access Status"
                className="mb-6 rounded-xl border border-[#E11D48]/40 bg-[#121216] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">
                    Admin Console Locked — Complete Verification to Unlock
                  </p>
                  <p className="text-xs text-zinc-300">
                    {!authUser.emailVerified
                      ? `Your email (${authUser.email}) currently reports emailVerified: false in Firebase Auth. Send a verification email, click the link in your Gmail inbox/spam, then click Refresh Status.`
                      : `You are currently signed in via ${signInProvider || 'Google'}. Sign out and log in with your Email & Password to open the Admin Console.`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {!authUser.emailVerified ? (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!auth.currentUser) return;
                          try {
                            await sendEmailVerification(auth.currentUser);
                            showToast(`Verification email sent to ${auth.currentUser.email}. Check Inbox or Spam.`);
                          } catch {
                            showToast('Verification email recently sent. Check your Gmail Inbox or Spam folder.');
                          }
                        }}
                        className="min-h-[40px] px-3.5 py-2 rounded-lg border border-white/15 hover:bg-white/5 text-xs font-semibold text-white"
                      >
                        Send Verification Email
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRefreshVerification()}
                        className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white"
                      >
                        Refresh Status
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSelectTab('profile')}
                        className="min-h-[40px] px-3.5 py-2 rounded-lg border border-white/15 hover:bg-white/5 text-xs font-semibold text-white"
                      >
                        Set Password in Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void logoutUser().then(() => setAuthModalOpen(true));
                        }}
                        className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-semibold text-white"
                      >
                        Sign In with Password
                      </button>
                    </>
                  )}
                </div>
              </section>
            )}

            {activeTab === 'home' && (
              <HomeView
                profile={profile}
                isSignedIn={Boolean(authUser)}
                tournaments={displayTournaments}
                results={displayResults}
                announcements={displayAnnouncements}
                leaderboard={displayLeaderboard}
                registeredTournamentIds={registeredTournamentIds}
                adminSettings={adminSettings}
                consentAccepted={consentAccepted}
                onAcceptConsent={() => {
                  setConsentAccepted(true);
                  try {
                    localStorage.setItem('spider_ad_consent', '1');
                  } catch {
                    // Ignore storage failure
                  }
                }}
                onSelectTournament={(t) => setSelectedTournamentId(t.id)}
                onNavigateTab={handleSelectTab}
                onOpenAuth={() => setAuthModalOpen(true)}
              />
            )}

            {activeTab === 'matches' && (
              <MatchesView
                tournaments={displayTournaments}
                results={displayResults}
                userRegistrations={userRegistrations}
                profile={profile}
                isSignedIn={Boolean(authUser)}
                registeredTournamentIds={registeredTournamentIds}
                adminSettings={adminSettings}
                onSelectTournament={(t) => setSelectedTournamentId(t.id)}
                onNavigateResults={() => handleSelectTab('results')}
                onOpenAuth={() => setAuthModalOpen(true)}
              />
            )}

            {activeTab === 'results' && (
              <ResultsView
                results={displayResults}
                tournaments={displayTournaments}
                registrations={userRegistrations}
                profile={profile}
                currentUserId={authUser?.uid}
                adminSettings={adminSettings}
                onSelectTournament={(t) => setSelectedTournamentId(t.id)}
                onOpenAuth={() => setAuthModalOpen(true)}
              />
            )}

            {activeTab === 'leaderboard' && (
              <LeaderboardView
                entries={displayLeaderboard}
                results={displayResults}
                currentUserId={authUser?.uid}
                adminSettings={adminSettings}
                onNavigateResults={() => handleSelectTab('results')}
              />
            )}

            {activeTab === 'profile' && (
              <ProfileView
                profile={profile}
                isSignedIn={Boolean(authUser)}
                isEmailVerified={Boolean(authUser?.emailVerified)}
                userEmail={authUser?.email || null}
                signInProvider={signInProvider}
                registrations={userRegistrations}
                withdrawals={userWithdrawals}
                tournaments={displayTournaments}
                results={displayResults}
                leaderboard={displayLeaderboard}
                adminSettings={adminSettings}
                consentAccepted={consentAccepted}
                onUpdateConsent={updateConsentPreference}
                onOpenAuth={() => setAuthModalOpen(true)}
                onNavigateResults={() => handleSelectTab('results')}
                onSelectTournament={(t) => setSelectedTournamentId(t.id)}
                onToast={showToast}
                onRefreshVerification={handleRefreshVerification}
              />
            )}

            {activeTab === 'admin' && isAdmin && authUser && (
              <AdminDashboard
                adminUid={authUser.uid}
                adminEmail={authUser.email}
                adminEmailVerified={authUser.emailVerified}
                signInProvider={signInProvider}
                tournaments={displayTournaments}
                results={results}
                adminSettings={adminSettings}
                onToast={showToast}
              />
            )}
          </>
        )}

        <footer className="mt-12 pt-6 border-t border-white/10 text-xs text-zinc-500 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p>
            SPIDER ESPORTS is an independent community tournament platform. It is not affiliated with, endorsed by, or sponsored by Garena or Free Fire.
          </p>
          <p className="shrink-0">100% Free Entry · 1,000 Coins = ₹10</p>
        </footer>
      </main>

      <BottomNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        isAdmin={isAdmin}
      />

      {/* Modals */}
      <MatchDetailsModal
        tournament={selectedTournament}
        matchInfo={displayMatches.find((m) => m.tournamentId === selectedTournamentId)}
        result={displayResults.find((r) => r.tournamentId === selectedTournamentId)}
        profile={profile}
        isSignedIn={Boolean(authUser)}
        isEmailVerified={Boolean(authUser?.emailVerified)}
        isAdmin={isAdmin}
        onClose={() => {
          const closingCompletedMatch = selectedTournament?.status === 'completed';
          setSelectedTournamentId(null);
          if (closingCompletedMatch) {
            maybeShowNaturalBreakInterstitial(true);
          }
        }}
        onRequireAuth={() => {
          setSelectedTournamentId(null);
          setAuthModalOpen(true);
        }}
        onSuccessToast={showToast}
      />

      <AuthModal
        open={authModalOpen || Boolean(needsOnboardingUser)}
        needsOnboardingUser={needsOnboardingUser}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={showToast}
      />

      <NotificationsModal
        open={notificationsOpen}
        notifications={notifications}
        isSignedIn={Boolean(authUser)}
        onClose={() => setNotificationsOpen(false)}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-20 right-4 sm:right-6 z-50 max-w-sm rounded-xl border border-[#E11D48]/40 bg-[#121216] px-4 py-3 text-xs font-medium text-white shadow-2xl"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
