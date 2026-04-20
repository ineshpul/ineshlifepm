import * as React from 'react';
import { AppState } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import type { User } from 'firebase/auth';
import {
  OAuthProvider,
  createUserWithEmailAndPassword,
  getIdTokenResult,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { firebaseAuth, firestore, isFirebaseConfigured } from '../firebase/firebase';
import { unregisterPushDevice } from '../services/pushNotifications';

export type AuthUser = {
  uid: string;
  email: string;
  username: string;
  isAdmin?: boolean;
  /** Firebase email/password account whose email is not verified yet (user is still signed in). */
  needsEmailVerification?: boolean;
};

export type EmailPasswordSignInResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_credential' }
  | { ok: false; reason: 'unknown'; message: string };

type AuthContextValue = {
  user: AuthUser | null;
  signUp: (args: { email: string; password: string; username: string }) => Promise<void>;
  signInWithEmailPassword: (args: { email: string; password: string }) => Promise<EmailPasswordSignInResult>;
  signOut: () => Promise<void>;
  signInWithApple: () => Promise<void>;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const signOutInProgressRef = React.useRef(false);

  /**
   * Maps Firebase Auth → in-app `user`.
   * Email/password users stay signed in while unverified (`needsEmailVerification`); they are not kicked to the sign-in screen.
   */
  const applyFirebaseSession = React.useCallback(async (raw: User | null): Promise<boolean> => {
    if (!raw) {
      setUser(null);
      return false;
    }

    const commit = (user: User, needsEmailVerification: boolean) => {
      const username = user.displayName ?? (user.email?.split('@')[0] ?? 'user');
      setUser({
        uid: user.uid,
        email: user.email ?? '',
        username,
        needsEmailVerification,
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

      // Let Tabs render immediately — do not wait for long reload / token loops.
      {
        const pwd0 = hasPasswordProvider(u);
        commit(u, pwd0 && !u.emailVerified);
      }

      for (let i = 0; i < 20; i++) {
        try {
          await reload(u);
        } catch {
          // ignore
        }
        u = firebaseAuth().currentUser ?? u;
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
          u = firebaseAuth().currentUser ?? u;
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
        void setDoc(
          doc(firestore(), 'users', u.uid),
          {
            uid: u.uid,
            username,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ).catch(() => {});

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

      commit(u, needsEmailVerification);
      return true;
    } catch {
      try {
        const live = firebaseAuth().currentUser;
        if (live && live.uid === raw.uid) {
          commit(live, hasPasswordProvider(live) && !live.emailVerified);
          return true;
        }
        commit(raw, hasPasswordProvider(raw) && !raw.emailVerified);
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
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDoc(doc(firestore(), 'users', uid));
        if (cancelled) return;
        if (!snap.exists()) return;
        const d = snap.data() as Record<string, unknown>;
        const isAdmin = d.isAdmin === true;
        const fromDoc = d.username;
        const usernameFromDoc = typeof fromDoc === 'string' && fromDoc.length > 0 ? fromDoc : null;
        setUser((prev) => {
          if (prev == null || prev.uid !== uid) return prev;
          return { ...prev, isAdmin, username: usernameFromDoc ?? prev.username };
        });
      } catch {
        // ignore (offline / rules); auth user still valid
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const signUp = React.useCallback(
    async ({ email, password, username }: { email: string; password: string; username: string }) => {
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
      setUser({
        uid: u.uid,
        email: u.email ?? '',
        username: u.displayName ?? (u.email?.split('@')[0] ?? 'user'),
        needsEmailVerification: hasPasswordProvider(u) && !u.emailVerified,
      });
      void applyFirebaseSession(u).catch(() => {});
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
          signed = cred.user;
          setUser({
            uid: signed.uid,
            email: signed.email ?? '',
            username: signed.displayName ?? (signed.email?.split('@')[0] ?? 'user'),
            needsEmailVerification: hasPasswordProvider(signed) && !signed.emailVerified,
          });
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

  const signInWithApple = React.useCallback(async () => {
    if (!isFirebaseConfigured()) return;
    const rawNonce = Crypto.randomUUID();
    const nonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    const apple = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce,
    });
    if (!apple.identityToken) {
      throw new Error('Apple did not return an identity token.');
    }
    const auth = firebaseAuth();
    const oauth = new OAuthProvider('apple.com');
    const cred = oauth.credential({ idToken: apple.identityToken, rawNonce });
    const userCred = await signInWithCredential(auth, cred);
    const dn =
      apple.fullName?.givenName || apple.fullName?.familyName
        ? [apple.fullName?.givenName, apple.fullName?.familyName].filter(Boolean).join(' ')
        : '';
    if (dn && userCred.user && !userCred.user.displayName) {
      await updateProfile(userCred.user, { displayName: dn });
    }
    const u = userCred.user;
    setUser({
      uid: u.uid,
      email: u.email ?? '',
      username: u.displayName ?? (u.email?.split('@')[0] ?? 'user'),
      needsEmailVerification: hasPasswordProvider(u) && !u.emailVerified,
    });
    void applyFirebaseSession(u).catch(() => {});
  }, [applyFirebaseSession]);

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
  }, []);

  const value: AuthContextValue = React.useMemo(
    () => ({
      user,
      signUp,
      signInWithEmailPassword,
      signOut,
      signInWithApple,
      resendEmailVerification: resendEmailVerificationCb,
      refreshEmailVerification: refreshEmailVerificationCb,
      sendPasswordResetEmail: sendPasswordResetEmailCb,
    }),
    [
      user,
      signUp,
      signInWithEmailPassword,
      signOut,
      signInWithApple,
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
