import * as React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { firebaseAuth, firestore, isFirebaseConfigured } from '../firebase/firebase';
import { unregisterPushDevice } from '../services/pushNotifications';
import { isAdminUid } from '../config/admin';

const BIO_EMAIL = 'leap.biometricEmail';
const BIO_FLAG = 'leap.biometricEnabled';
const BIO_PW = 'leap.biometricPassword';

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
  signInWithGoogleIdToken: (idToken: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  saveBiometricCredentials: (email: string, password: string) => Promise<void>;
  tryBiometricSignIn: () => Promise<void>;
  isBiometricSaved: () => Promise<boolean>;
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
      void setDoc(
        doc(firestore(), 'users', u.uid),
        {
          uid: u.uid,
          email: u.email ?? '',
          username: u.displayName ?? (u.email?.split('@')[0] ?? 'user'),
          isAdmin: isAdminUid(u.uid),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setUser({
        uid: u.uid,
        email: u.email ?? '',
        username: u.displayName ?? (u.email?.split('@')[0] ?? 'user'),
        isAdmin: isAdminUid(u.uid),
      });
    });
    return () => unsub();
  }, []);

  const signUp = React.useCallback(
    async ({ email, password, username }: { email: string; password: string; username: string }) => {
      if (!isFirebaseConfigured()) {
        setUser({ uid: `local_${Date.now()}`, email, username });
        return;
      }
      const auth = firebaseAuth();
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: username });
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
  }, []);

  const signInWithGoogleIdToken = React.useCallback(async (idToken: string) => {
    if (!isFirebaseConfigured()) return;
    const auth = firebaseAuth();
    const cred = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(auth, cred);
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

  const saveBiometricCredentials = React.useCallback(async (email: string, password: string) => {
    await SecureStore.setItemAsync(BIO_PW, password, {
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
    const password = await SecureStore.getItemAsync(BIO_PW);
    if (!password) throw new Error('No saved password.');
    await signInWithEmailAndPassword(firebaseAuth(), email, password);
  }, []);

  const isBiometricSaved = React.useCallback(async () => (await AsyncStorage.getItem(BIO_FLAG)) === '1', []);

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
      await SecureStore.deleteItemAsync(BIO_PW);
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
      signInWithGoogleIdToken,
      signInWithApple,
      saveBiometricCredentials,
      tryBiometricSignIn,
      isBiometricSaved,
    }),
    [
      user,
      signUp,
      signIn,
      signOut,
      signInWithGoogleIdToken,
      signInWithApple,
      saveBiometricCredentials,
      tryBiometricSignIn,
      isBiometricSaved,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
