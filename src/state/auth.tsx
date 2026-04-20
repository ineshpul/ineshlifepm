import * as React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {
  OAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';

import { firebaseAuth, firestore, isFirebaseConfigured } from '../firebase/firebase';
import { unregisterPushDevice } from '../services/pushNotifications';

const BIO_EMAIL = 'leap.biometricEmail';
const BIO_FLAG = 'leap.biometricEnabled';
const BIO_KEY = 'leap.biometricKeyV1';

export type AuthUser = {
  uid: string;
  email: string;
  username: string;
  isAdmin?: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  signUp: (args: { email: string; password: string; username: string }) => Promise<void>;
  signIn: (args: { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  saveBiometricCredentials: (email: string, password: string) => Promise<void>;
  tryBiometricSignIn: () => Promise<void>;
  isBiometricSaved: () => Promise<boolean>;
  resendEmailVerification: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);

  React.useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const auth = firebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setUser(null);
        return;
      }
      const username = u.displayName ?? (u.email?.split('@')[0] ?? 'user');

      // Public profile doc (no email; no admin trust from client).
      void setDoc(
        doc(firestore(), 'users', u.uid),
        {
          uid: u.uid,
          username,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => {});

      // Private profile doc (owner-readable only via rules).
      void setDoc(
        doc(firestore(), 'users', u.uid, 'private', 'profile'),
        {
          email: u.email ?? '',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => {});
      setUser({
        uid: u.uid,
        email: u.email ?? '',
        username,
      });
    });
    return () => unsub();
  }, []);

  // Keep `isAdmin` (and any server-managed profile fields) sourced from Firestore, not client config.
  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid) return;
    const ref = doc(firestore(), 'users', user.uid);
    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data() as Record<string, unknown>;
        const isAdmin = d.isAdmin === true;
        const username = String(d.username ?? user.username ?? 'user');
        setUser((prev) => (prev && prev.uid === user.uid ? { ...prev, isAdmin, username } : prev));
      },
      () => {
        // ignore
      }
    );
  }, [user?.uid]);

  const signUp = React.useCallback(
    async ({ email, password, username }: { email: string; password: string; username: string }) => {
      if (!isFirebaseConfigured()) {
        setUser({ uid: `local_${Date.now()}`, email, username });
        return;
      }
      const auth = firebaseAuth();
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: username });

      // Require email verification for email/password accounts.
      await sendEmailVerification(cred.user);
      await fbSignOut(auth);
      throw new Error('EMAIL_VERIFICATION_REQUIRED');
    },
    []
  );

  const signIn = React.useCallback(async ({ email, password }: { email: string; password: string }) => {
    if (!isFirebaseConfigured()) {
      setUser({ uid: `local_${Date.now()}`, email, username: email.split('@')[0] ?? 'user' });
      return;
    }
    const auth = firebaseAuth();
    await signInWithEmailAndPassword(auth, email, password);
    const cur = auth.currentUser;
    if (cur && cur.emailVerified === false) {
      await fbSignOut(auth);
      throw new Error('EMAIL_NOT_VERIFIED');
    }
  }, []);

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
  }, []);

  const saveBiometricCredentials = React.useCallback(async (email: string, _password: string) => {
    // Store only an app-specific secret protected by device biometrics.
    // Never store the user's raw password on-device.
    const key = Crypto.randomUUID();
    await SecureStore.setItemAsync(BIO_KEY, key, {
      requireAuthentication: true,
      authenticationPrompt: 'Save your Leap sign-in',
    });
    await AsyncStorage.setItem(BIO_EMAIL, email);
    await AsyncStorage.setItem(BIO_FLAG, '1');
  }, []);

  const tryBiometricSignIn = React.useCallback(async () => {
    if (!isFirebaseConfigured()) return;
    const enabled = await AsyncStorage.getItem(BIO_FLAG);
    if (enabled !== '1') throw new Error('Face ID sign-in is not enabled.');
    const email = await AsyncStorage.getItem(BIO_EMAIL);
    if (!email) throw new Error('No saved email.');
    const key = await SecureStore.getItemAsync(BIO_KEY);
    if (!key) throw new Error('Biometric unlock is not available. Sign in again.');

    // Safer behavior: biometrics unlock the app only if Firebase already has a valid session.
    // This avoids storing primary credentials on-device.
    const auth = firebaseAuth();
    if (auth.currentUser) return;
    throw new Error(`No active session for ${email}. Please sign in with your password.`);
  }, []);

  const isBiometricSaved = React.useCallback(async () => (await AsyncStorage.getItem(BIO_FLAG)) === '1', []);

  const resendEmailVerificationCb = React.useCallback(async () => {
    if (!isFirebaseConfigured()) return;
    const cur = firebaseAuth().currentUser;
    if (!cur) throw new Error('Not signed in.');
    await sendEmailVerification(cur);
  }, []);

  const signOut = React.useCallback(async () => {
    if (!isFirebaseConfigured()) {
      setUser(null);
      return;
    }
    const uid = firebaseAuth().currentUser?.uid;
    if (uid) {
      try {
        await unregisterPushDevice(uid);
      } catch {
        // ignore
      }
    }
    try {
      await SecureStore.deleteItemAsync(BIO_KEY);
    } catch {
      // ignore
    }
    await AsyncStorage.multiRemove([BIO_EMAIL, BIO_FLAG]);
    await fbSignOut(firebaseAuth());
  }, []);

  const value: AuthContextValue = React.useMemo(
    () => ({
      user,
      signUp,
      signIn,
      signOut,
      signInWithApple,
      saveBiometricCredentials,
      tryBiometricSignIn,
      isBiometricSaved,
      resendEmailVerification: resendEmailVerificationCb,
    }),
    [
      user,
      signUp,
      signIn,
      signOut,
      signInWithApple,
      saveBiometricCredentials,
      tryBiometricSignIn,
      isBiometricSaved,
      resendEmailVerificationCb,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
