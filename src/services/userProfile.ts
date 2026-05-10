import { updateProfile } from 'firebase/auth';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { firebaseAuth, isFirebaseConfigured, storage } from '../firebase/firebase';
import { runUserProfileUsernameTransaction } from './usernameClaim';

async function uriToBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`Could not read image (HTTP ${res.status}).`);
  return res.blob();
}

function isLocalAssetUri(uri: string) {
  return uri.startsWith('file:') || uri.startsWith('content:') || uri.startsWith('ph://');
}

/**
 * Uploads a square-ish profile image to Storage and returns the download URL.
 */
export async function uploadProfileAvatar(uid: string, localUri: string): Promise<string> {
  const blob = await uriToBlob(localUri);
  const ext =
    blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  const contentType =
    blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
  const path = `avatars/${uid}/profile_${Date.now()}.${ext}`;
  const rref = ref(storage(), path);
  await uploadBytes(rref, blob, { contentType });
  return getDownloadURL(rref);
}

export type SavePublicProfileArgs = {
  uid: string;
  username: string;
  bio: string;
  /** When user picked a new image from the library, upload and set `photoUrl`. */
  newPhotoLocalUri?: string | null;
};

/**
 * Persists public profile fields on `users/{uid}` and syncs Firebase Auth display name / photo URL.
 * @returns `photoUrl` when a new avatar was uploaded.
 */
export async function saveUserPublicProfile(args: SavePublicProfileArgs): Promise<{ photoUrl?: string }> {
  if (!isFirebaseConfigured()) return {};
  const username = args.username.trim() || 'user';
  const bio = args.bio.trim();

  let uploadedUrl: string | undefined;
  if (args.newPhotoLocalUri && isLocalAssetUri(args.newPhotoLocalUri)) {
    uploadedUrl = await uploadProfileAvatar(args.uid, args.newPhotoLocalUri);
  }

  const extraFields: Record<string, unknown> = {};
  if (uploadedUrl) extraFields.photoUrl = uploadedUrl;

  await runUserProfileUsernameTransaction({
    uid: args.uid,
    username,
    bio,
    extraFields,
  });

  const cur = firebaseAuth().currentUser;
  if (cur && cur.uid === args.uid) {
    if (uploadedUrl) {
      await updateProfile(cur, { displayName: username, photoURL: uploadedUrl });
    } else {
      await updateProfile(cur, { displayName: username });
    }
  }

  return uploadedUrl ? { photoUrl: uploadedUrl } : {};
}
