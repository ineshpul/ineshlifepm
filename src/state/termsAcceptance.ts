import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';

const keyForUid = (uid: string) => `leap.termsAccepted.v1.${uid}`;

export async function hasAcceptedTerms(uid: string): Promise<boolean> {
  if (!uid) return false;
  try {
    const v = await AsyncStorage.getItem(keyForUid(uid));
    return v === '1';
  } catch {
    return false;
  }
}

export async function acceptTerms(uid: string): Promise<void> {
  if (!uid) return;
  await AsyncStorage.setItem(keyForUid(uid), '1');
  if (!isFirebaseConfigured()) return;
  // Mirror to Firestore (owner-only) so we can prove acceptance across devices.
  await setDoc(
    doc(firestore(), 'users', uid, 'private', 'profile'),
    { acceptedTermsAt: serverTimestamp() },
    { merge: true }
  );
}

