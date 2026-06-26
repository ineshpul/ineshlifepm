import * as React from 'react';
import { AppState } from 'react-native';
import type { User } from 'firebase/auth';
import {
  createUserWithEmailAndPassword,
  getIdTokenResult,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';

import { firebaseAuth, firestore, isFirebaseConfigured } from '../firebase/firebase';
import { isAdminUid, parseProfileIsAdmin, parseProfileIsModerator, parseProfileBypassFeedGate } from '../config/admin';
import { unregisterPushDevice } from '../services/pushNotifications';
import { bootstrapUserDocWithUsername, syncAuthDisplayNameIfNeeded } from '../services/usernameClaim';
import { claimReferral } from '../services/referral';
import { scheduleLeapStatsHealOnSession } from '../services/verticalScore';

export type AuthUser = {
  uid: string;
  email: string;
  username: string;
  isAdmin?: boolean;
  /** Set in Firestore `users/{uid}.isModerator` (staff; cannot self-grant). */
  isModerator?: boolean;
  /** Set in Firestore `users/{uid}.bypassFeedGate` — full feed without posting (review demo only). */
  bypassFeedGate?: boolean;
  /** Firebase email/password account whose email is not verified yet (user is still signed in). */
  needsEmailVerification?: boolean;
};

export type EmailPasswordSignInResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_credential' }
  | { ok: false; reason: 'unknown'; message: string };

type AuthContextValue = {
  /** False until Firebase `authStateReady()` resolves — avoids a one-frame signed-out flash on cold start. */
  authReady: boolean;
  user: AuthUser | null;
  signUp: (args: {
    email: string;
    password: string;
    username: string;
    invitedByUsername?: string;
  }) => Promise<void>;
  signInWithEmailPassword: (args: { email: string; password: string }) => Promise<EmailPasswordSignInResult>;
  signOut: () => Promise<void>;
  resendEmailVerification: () => Promise<void>;
  refreshEmailVerification: () => Promise<boolean>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

function withTimeout<T>(ms: number, run: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('LEAP_SIGN_IN_TIMEOUT')), ms);
    void run()
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

const hasPasswordProvider = (u: { providerData: { providerId?: string | null }[] }) =>
  Boolean(u.providerData?.some((p) => p?.providerId === 'password'));

async function tokenClaimEmailVerified(u: User): Promise<boolean> {
  try {
    const idt = await getIdTokenResult(u, true);
    const v = idt.claims.email_verified as unknown;
    return v === true || v === 'true';
  } catch {
    return false;
  }
}

/** Keep Firestore-hydrated fields when the same account is refreshed from Firebase Auth. */
function mergeAuthUser(prev: AuthUser | null, next: AuthUser): AuthUser {
  return prev != null && prev.uid === next.uid ? { ...prev, ...next } : next;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = React.useState(() => !isFirebaseConfigured());
  const signOutInProgressRef = React.useRef(false);

  React.useEffect(() => {
    if (!isFirebaseConfigured()) {
      setAuthReady(true);
      return;
    }
    void firebaseAuth()
      .authStateReady()
      .then(() => setAuthReady(true))
      .catch(() => setAuthReady(true));
  }, []);

  /**
   * Maps Firebase Auth → in-app `user`.
   * Email/password users stay signed in while unverified (`needsEmailVerification`); they are not kicked to the sign-in screen.
   */
  const applyFirebaseSession = React.useCallback(async (raw: User | null): Promise<boolean> => {
    if (!raw) {
      setUser(null);
      return false;
    }

    /** Firebase session may end or switch while reload loops run — never resurrect a stale user after sign-out. */
    const sessionUid = raw.uid;
    const commitIfCurrent = (user: User, needsEmailVerification: boolean) => {
      const cur = firebaseAuth().currentUser;
      if (cur == null) {
        setUser(null);
        return;
      }
      if (cur.uid !== sessionUid) {
        return;
      }
      const username = user.displayName ?? (user.email?.split('@')[0] ?? 'user');
      // Preserve fields hydrated from Firestore (e.g. `isAdmin`, `isModerator`). `applyFirebaseSession` runs
      // multiple times (initial commit, final commit after reload loops, and on AppState active);
      // replacing the whole object would clear `isAdmin` while the profile effect only re-runs on uid change.
      setUser((prev) => {
        if (prev != null && prev.uid === user.uid) {
          return {
            ...prev,
            email: user.email ?? '',
            username,
            needsEmailVerification,
          };
        }
        return {
          uid: user.uid,
          email: user.email ?? '',
          username,
          needsEmailVerification,
        };
      });
    };

    try {
      let u: User = raw;
      try {
        await reload(u);
      } catch {
        // ignore
      }
      u = firebaseAuth().currentUser ?? u;
      {
        const cur = firebaseAuth().currentUser;
        if (cur == null || cur.uid !== sessionUid) {
          if (cur == null) setUser(null);
          return false;
        }
      }

      // Let Tabs render immediately — do not wait for long reload / token loops.
      {
        const pwd0 = hasPasswordProvider(u);
        commitIfCurrent(u, pwd0 && !u.emailVerified);
      }

      for (let i = 0; i < 20; i++) {
        try {
          await reload(u);
        } catch {
          // ignore
        }
        const curLoop = firebaseAuth().currentUser;
        if (curLoop == null || curLoop.uid !== sessionUid) {
          if (curLoop == null) setUser(null);
          return false;
        }
        u = curLoop;
        if (u.providerData?.length) break;
        await new Promise((r) => setTimeout(r, 100));
      }

      let effectiveVerified = u.emailVerified;
      const pwd = hasPasswordProvider(u);

      if (pwd && !effectiveVerified) {
        for (let i = 0; i < 8; i++) {
          try {
            await reload(u);
          } catch {
            // ignore
          }
          const curEv = firebaseAuth().currentUser;
          if (curEv == null || curEv.uid !== sessionUid) {
            if (curEv == null) setUser(null);
            return false;
          }
          u = curEv;
          if (u.emailVerified) {
            effectiveVerified = true;
            break;
          }
          if (await tokenClaimEmailVerified(u)) {
            effectiveVerified = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 280));
        }
      }

      const needsEmailVerification = pwd && !effectiveVerified;
      const username = u.displayName ?? (u.email?.split('@')[0] ?? 'user');

      try {
        void (async () => {
          try {
            const resolved = await bootstrapUserDocWithUsername({
              uid: u.uid,
              candidateUsername: username,
            });
            await syncAuthDisplayNameIfNeeded(resolved.username);
          } catch {
            // Offline / stale rules — session still works; profile sync can retry on next session tick.
          }
        })();

        void setDoc(
          doc(firestore(), 'users', u.uid, 'private', 'profile'),
          {
            email: u.email ?? '',
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ).catch(() => {});
      } catch {
        // `doc` / `firestore()` can throw synchronously; still keep auth session in React.
      }

      commitIfCurrent(u, needsEmailVerification);
      scheduleLeapStatsHealOnSession(u.uid);
      return true;
    } catch {
      try {
        const live = firebaseAuth().currentUser;
        if (live && live.uid === raw.uid) {
          commitIfCurrent(live, hasPasswordProvider(live) && !live.emailVerified);
          scheduleLeapStatsHealOnSession(live.uid);
          return true;
        }
        commitIfCurrent(raw, hasPasswordProvider(raw) && !raw.emailVerified);
        scheduleLeapStatsHealOnSession(raw.uid);
        return true;
      } catch {
        return false;
      }
    }
  }, []);

  React.useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const auth = firebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u == null) {
        // Avoid wiping React state on a stale `null` while native auth still has a user (seen on some phones).
        if (!signOutInProgressRef.current) {
          const still = firebaseAuth().currentUser;
          if (still != null) {
            void applyFirebaseSession(still);
            return;
          }
        }
        void applyFirebaseSession(null);
        return;
      }
      void applyFirebaseSession(u);
    });
    return () => unsub();
  }, [applyFirebaseSession]);

  React.useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      const cur = firebaseAuth().currentUser;
      if (!cur) return;
      void applyFirebaseSession(cur);
    });
    return () => sub.remove();
  }, [applyFirebaseSession]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid) return;
    const uid = user.uid;
    const ref = doc(firestore(), 'users', uid);

    const applyProfile = (d: Record<string, unknown> | undefined, exists: boolean) => {
      const fromUidList = isAdminUid(uid);
      const isAdmin = exists && d ? parseProfileIsAdmin(d.isAdmin) || fromUidList : fromUidList;
      const isModerator = exists && d ? parseProfileIsModerator(d.isModerator) : false;
      const bypassFeedGate = exists && d ? parseProfileBypassFeedGate(d.bypassFeedGate) : false;
      const fromDoc = d?.username;
      const usernameFromDoc = typeof fromDoc === 'string' && fromDoc.length > 0 ? fromDoc : null;
      setUser((prev) => {
        if (prev == null || prev.uid !== uid) return prev;
        return {
          ...prev,
          isAdmin,
          isModerator,
          bypassFeedGate,
          username: usernameFromDoc ?? prev.username,
        };
      });
    };

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          applyProfile(undefined, false);
          return;
        }
        applyProfile(snap.data() as Record<string, unknown>, true);
      },
      () => {
        // Do not clear `isAdmin` on transient errors; optional dev allowlist still applies.
        if (!isAdminUid(uid)) return;
        setUser((prev) => (prev != null && prev.uid === uid ? { ...prev, isAdmin: true } : prev));
      }
    );
    return () => unsub();
  }, [user?.uid]);

  const signUp = React.useCallback(
    async ({
      email,
      password,
      username,
      invitedByUsername,
    }: {
      email: string;
      password: string;
      username: string;
      invitedByUsername?: string;
    }) => {
      if (!isFirebaseConfigured()) {
        setUser({
          uid: `local_${Date.now()}`,
          email,
          username,
          needsEmailVerification: false,
        });
        return;
      }
      const auth = firebaseAuth();
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: username });
      await sendEmailVerification(cred.user);
      const u = cred.user;

      // Username search queries `users.usernameLower` — must exist before others can find this account.
      try {
        const resolved = await bootstrapUserDocWithUsername({ uid: u.uid, candidateUsername: username });
        await syncAuthDisplayNameIfNeeded(resolved.username);
      } catch {
        // Offline / transient rules — applyFirebaseSession retries bootstrap on next session tick.
      }

      setUser((prev) =>
        mergeAuthUser(prev, {
          uid: u.uid,
          email: u.email ?? '',
          username: u.displayName ?? (u.email?.split('@')[0] ?? 'user'),
          needsEmailVerification: hasPasswordProvider(u) && !u.emailVerified,
        })
      );
      void applyFirebaseSession(u).catch(() => {});

      const invite = invitedByUsername?.trim();
      if (invite && isFirebaseConfigured()) {
        try {
          await auth.authStateReady();
          if (auth.currentUser?.uid === u.uid) {
            await claimReferral(invite);
          }
        } catch {
          // Signup still succeeds if referral claim fails (invalid username, etc.).
        }
      }
    },
    [applyFirebaseSession]
  );

  const signInWithEmailPassword = React.useCallback(
    async ({ email, password }: { email: string; password: string }): Promise<EmailPasswordSignInResult> => {
      if (!isFirebaseConfigured()) {
        setUser({
          uid: `local_${Date.now()}`,
          email,
          username: email.split('@')[0] ?? 'user',
          needsEmailVerification: false,
        });
        return { ok: true };
      }
      const auth = firebaseAuth();
      try {
        let signed: User | undefined;
        await withTimeout(25_000, async () => {
          const cred = await signInWithEmailAndPassword(auth, email, password);
          const uIn = cred.user;
          signed = uIn;
          setUser((prev) =>
            mergeAuthUser(prev, {
              uid: uIn.uid,
              email: uIn.email ?? '',
              username: uIn.displayName ?? (uIn.email?.split('@')[0] ?? 'user'),
              needsEmailVerification: hasPasswordProvider(uIn) && !uIn.emailVerified,
            })
          );
        });
        if (signed) {
          void applyFirebaseSession(signed).catch(() => {});
        }
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : '';
        if (errMsg === 'LEAP_SIGN_IN_TIMEOUT') {
          return {
            ok: false,
            reason: 'unknown',
            message: 'Sign-in timed out after 25 seconds. Check Wi‑Fi / VPN, or try again.',
          };
        }
        const code =
          e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code ?? '') : '';
        const invalidPw =
          code === 'auth/invalid-credential' ||
          code === 'auth/wrong-password' ||
          code === 'auth/invalid-login-credentials' ||
          code === 'auth/user-not-found' ||
          code === 'auth/missing-password';
        if (invalidPw) {
          return { ok: false, reason: 'invalid_credential' };
        }
        const fallbackMsg = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
        return { ok: false, reason: 'unknown', message: fallbackMsg };
      }
      return { ok: true };
    },
    [applyFirebaseSession]
  );

  // Sign in with Apple removed for now (email/password only).

  const resendEmailVerificationCb = React.useCallback(async () => {
    if (!isFirebaseConfigured()) return;
    const cur = firebaseAuth().currentUser;
    if (!cur) throw new Error('Not signed in.');
    await sendEmailVerification(cur);
  }, []);

  const sendPasswordResetEmailCb = React.useCallback(async (email: string) => {
    const trimmed = email.trim();
    if (!trimmed) throw new Error('Enter the email for your account.');
    if (!isFirebaseConfigured()) {
      throw new Error('Firebase is not configured.');
    }
    await sendPasswordResetEmail(firebaseAuth(), trimmed);
  }, []);

  const refreshEmailVerificationCb = React.useCallback(async () => {
    if (!isFirebaseConfigured()) return false;
    let u = firebaseAuth().currentUser;
    if (!u) return false;
    try {
      await reload(u);
    } catch {
      // ignore
    }
    u = firebaseAuth().currentUser ?? u;
    if (!u) return false;

    await applyFirebaseSession(u);

    const after = firebaseAuth().currentUser;
    if (!after || after.uid !== u.uid) return false;

    if (!hasPasswordProvider(after)) {
      setUser((prev) =>
        prev && prev.uid === after.uid ? { ...prev, needsEmailVerification: false } : prev
      );
      return true;
    }

    const ok = after.emailVerified || (await tokenClaimEmailVerified(after));
    setUser((prev) =>
      prev && prev.uid === after.uid ? { ...prev, needsEmailVerification: !ok } : prev
    );
    return ok;
  }, [applyFirebaseSession]);

  const signOut = React.useCallback(async () => {
    if (!isFirebaseConfigured()) {
      setUser(null);
      return;
    }
    signOutInProgressRef.current = true;
    try {
      const uid = firebaseAuth().currentUser?.uid;
      if (uid) {
        try {
          await unregisterPushDevice(uid);
        } catch {
          // ignore
        }
      }
      await fbSignOut(firebaseAuth());
    } finally {
      signOutInProgressRef.current = false;
    }
    // Auth listener can race with in-flight `applyFirebaseSession`; keep UI in sync immediately.
    if (firebaseAuth().currentUser == null) {
      setUser(null);
    }
  }, []);

  const value: AuthContextValue = React.useMemo(
    () => ({
      authReady,
      user,
      signUp,
      signInWithEmailPassword,
      signOut,
      resendEmailVerification: resendEmailVerificationCb,
      refreshEmailVerification: refreshEmailVerificationCb,
      sendPasswordResetEmail: sendPasswordResetEmailCb,
    }),
    [
      authReady,
      user,
      signUp,
      signInWithEmailPassword,
      signOut,
      resendEmailVerificationCb,
      refreshEmailVerificationCb,
      sendPasswordResetEmailCb,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
