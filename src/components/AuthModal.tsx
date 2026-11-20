import { useState } from 'react';
import { X } from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  createOrCompleteUserProfile,
  isUsernameAvailable,
  loginWithEmail,
  loginWithGoogle,
  registerWithEmail,
  resetPassword,
} from '../lib/firestoreService';
import { validateFreeFireIgn, validateFreeFireUid } from '../utils/tournamentRules';

interface AuthModalProps {
  open: boolean;
  needsOnboardingUser: User | null;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export function AuthModal({ open, needsOnboardingUser, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [freeFireIgn, setFreeFireIgn] = useState('');
  const [freeFireUid, setFreeFireUid] = useState('');
  const [adConsent, setAdConsent] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const isOnboardingOnly = Boolean(needsOnboardingUser);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await loginWithGoogle();
      onSuccess('Signed in with Google.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!needsOnboardingUser) return;
    setError(null);

    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username.trim())) {
      setError('Username must be 3–24 characters using letters, numbers, or underscores.');
      return;
    }
    const ignErr = validateFreeFireIgn(freeFireIgn);
    if (ignErr) {
      setError(ignErr);
      return;
    }
    const uidErr = validateFreeFireUid(freeFireUid);
    if (uidErr) {
      setError(uidErr);
      return;
    }

    setLoading(true);
    try {
      const available = await isUsernameAvailable(username);
      if (!available) {
        setError('Username is already taken. Choose a unique handle.');
        setLoading(false);
        return;
      }
      await createOrCompleteUserProfile({
        user: needsOnboardingUser,
        username,
        freeFireIgn,
        freeFireUid,
        adConsentAccepted: adConsent,
      });
      onSuccess('Player profile created!');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'reset') {
        await resetPassword(email);
        onSuccess('Password reset email sent. Check your inbox.');
        setMode('login');
      } else if (mode === 'login') {
        const signedInUser = await loginWithEmail(email, password);
        if (!signedInUser.emailVerified) {
          onSuccess('Signed in! Verify your email link (check Inbox/Spam) to unlock Admin & full access.');
        } else {
          onSuccess('Signed in successfully.');
        }
        onClose();
      } else {
        if (!/^[a-zA-Z0-9_]{3,24}$/.test(username.trim())) {
          throw new Error('Username must be 3–24 characters (letters, numbers, underscores).');
        }
        const ignErr = validateFreeFireIgn(freeFireIgn);
        if (ignErr) throw new Error(ignErr);
        const uidErr = validateFreeFireUid(freeFireUid);
        if (uidErr) throw new Error(uidErr);

        const available = await isUsernameAvailable(username);
        if (!available) {
          throw new Error('That username is already taken.');
        }

        const user = await registerWithEmail({
          email,
          password,
          username,
          freeFireIgn,
          freeFireUid,
        });
        // Persist draft onboarding details in sessionStorage until email verification completes
        sessionStorage.setItem(
          `pending_profile_${user.uid}`,
          JSON.stringify({ username, freeFireIgn, freeFireUid, adConsent })
        );
        onSuccess('Account created! Verify the link sent to your email, then click Refresh Status.');
        onClose();
      }
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
        setError(
          'Email/Password sign-in is still disabled on Firebase project "speedy-tiger-jh5g6". Make sure you selected project speedy-tiger-jh5g6 (not another project) under Authentication > Sign-in method, enabled the top "Email/Password" toggle, and clicked Save.'
        );
      } else {
        setError(err instanceof Error ? err.message : 'Authentication error.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-label="SPIDER ESPORTS Authentication"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#121216] p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="font-display text-2xl font-extrabold text-white">
            {isOnboardingOnly
              ? 'Complete Player Profile'
              : mode === 'login'
                ? 'Sign In to Arena'
                : mode === 'register'
                  ? 'Register Player Account'
                  : 'Reset Password'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isOnboardingOnly ? (
          <form onSubmit={handleOnboardingSubmit} className="space-y-4">
            <p className="text-xs text-zinc-400">
              Choose a unique SPIDER ESPORTS username and link your Free Fire IGN and UID.
            </p>
            <div>
              <label htmlFor="onb-username" className="block text-xs text-zinc-300 mb-1">
                Unique Username
              </label>
              <input
                id="onb-username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. SpiderApex"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
              />
            </div>
            <div>
              <label htmlFor="onb-ign" className="block text-xs text-zinc-300 mb-1">
                Free Fire IGN
              </label>
              <input
                id="onb-ign"
                type="text"
                required
                value={freeFireIgn}
                onChange={(e) => setFreeFireIgn(e.target.value)}
                placeholder="In-game name"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
              />
            </div>
            <div>
              <label htmlFor="onb-uid" className="block text-xs text-zinc-300 mb-1">
                Free Fire UID
              </label>
              <input
                id="onb-uid"
                type="text"
                required
                inputMode="numeric"
                value={freeFireUid}
                onChange={(e) => setFreeFireUid(e.target.value)}
                placeholder="6-16 digit numeric UID"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm font-mono-tabular text-white"
              />
            </div>
            <label className="flex items-start gap-2.5 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={adConsent}
                onChange={(e) => setAdConsent(e.target.checked)}
                className="mt-0.5 accent-[#E11D48]"
              />
              <span>I accept the Privacy Policy &amp; Terms of Service.</span>
            </label>
            {error && <p className="text-xs text-[#F43F5E]">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] text-sm font-semibold text-white"
            >
              {loading ? 'Saving Profile...' : 'Save & Enter Arena'}
            </button>
          </form>
        ) : (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleSignIn}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-lg border border-white/15 bg-white text-black hover:bg-zinc-200 text-xs font-bold transition-colors"
            >
              Continue with Google
            </button>

            <div className="flex items-center gap-3 text-[11px] text-zinc-500">
              <div className="h-px flex-1 bg-white/10" />
              <span>OR EMAIL</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-3.5">
              <div>
                <label htmlFor="auth-email" className="block text-xs text-zinc-300 mb-1">
                  Email Address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="player@example.com"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
                />
              </div>

              {mode !== 'reset' && (
                <div>
                  <label htmlFor="auth-password" className="block text-xs text-zinc-300 mb-1">
                    Password
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
                  />
                </div>
              )}

              {mode === 'register' && (
                <>
                  <div>
                    <label htmlFor="reg-username" className="block text-xs text-zinc-300 mb-1">
                      Unique Username
                    </label>
                    <input
                      id="reg-username"
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. SpiderVenom"
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="reg-ign" className="block text-xs text-zinc-300 mb-1">
                        Free Fire IGN
                      </label>
                      <input
                        id="reg-ign"
                        type="text"
                        required
                        value={freeFireIgn}
                        onChange={(e) => setFreeFireIgn(e.target.value)}
                        placeholder="In-game name"
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="reg-uid" className="block text-xs text-zinc-300 mb-1">
                        Free Fire UID
                      </label>
                      <input
                        id="reg-uid"
                        type="text"
                        required
                        inputMode="numeric"
                        value={freeFireUid}
                        onChange={(e) => setFreeFireUid(e.target.value)}
                        placeholder="Numeric UID"
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-white/10 bg-[#09090B] text-sm font-mono-tabular text-white"
                      />
                    </div>
                  </div>
                </>
              )}

              {error && <p role="alert" className="text-xs text-[#F43F5E]">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] disabled:opacity-50 text-sm font-semibold text-white"
              >
                {loading
                  ? 'Processing...'
                  : mode === 'login'
                    ? 'Sign In'
                    : mode === 'register'
                      ? 'Create Account'
                      : 'Send Reset Link'}
              </button>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400 pt-2 border-t border-white/10">
              {mode === 'login' ? (
                <>
                  <button type="button" onClick={() => setMode('register')} className="hover:text-white">
                    Need an account? Register
                  </button>
                  <button type="button" onClick={() => setMode('reset')} className="hover:text-white">
                    Forgot password?
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setMode('login')} className="hover:text-white">
                  Already have an account? Sign In
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
