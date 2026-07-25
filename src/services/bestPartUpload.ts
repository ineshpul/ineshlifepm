import { getDownloadURL, ref, uploadBytesResumable, type UploadTaskSnapshot } from 'firebase/storage';
// Expo SDK 54+ requires importing the legacy filesystem API explicitly.
import * as FileSystem from 'expo-file-system/legacy';

import { storage } from '../firebase/firebase';
import type { BestPartMediaType } from '../types/bestPart';

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 90 * 1024 * 1024;

function uriToBlobViaXhr(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      const blob = xhr.response;
      if (blob instanceof Blob && blob.size >= 32) {
        resolve(blob);
        return;
      }
      reject(new Error('This capture looks empty. Try again.'));
    };
    xhr.onerror = () => reject(new Error('Could not read your capture. Try again.'));
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
}

function base64ToBytes(b64: string): Uint8Array {
  const a = typeof globalThis.atob === 'function' ? globalThis.atob : undefined;
  if (!a) throw new Error('Base64 decoder is unavailable.');
  const bin = a(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function uriToUploadBody(uri: string): Promise<Blob | Uint8Array> {
  try {
    return await uriToBlobViaXhr(uri);
  } catch {
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64' as FileSystem.EncodingType,
    });
    return base64ToBytes(b64);
  }
}

export async function uploadBestPartMedia(args: {
  uid: string;
  dateKey: string;
  localUri: string;
  mediaType: BestPartMediaType;
  onProgress?: (pct: number) => void;
}): Promise<{ url: string; storagePath: string }> {
  const ext = args.mediaType === 'photo' ? 'jpg' : 'mp4';
  const contentType = args.mediaType === 'photo' ? 'image/jpeg' : 'video/mp4';
  const storagePath = `bestParts/${args.uid}/${args.dateKey}/${Date.now()}.${ext}`;
  const body = await uriToUploadBody(args.localUri);
  const size = body instanceof Blob ? body.size : body.byteLength;
  const max = args.mediaType === 'photo' ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
  if (size > max) {
    throw new Error(args.mediaType === 'photo' ? 'Photo is too large.' : 'Video is too large.');
  }

  const sref = ref(storage(), storagePath);
  const task = uploadBytesResumable(sref, body, { contentType });
  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snap: UploadTaskSnapshot) => {
        const pct = snap.totalBytes ? Math.round((100 * snap.bytesTransferred) / snap.totalBytes) : 0;
        args.onProgress?.(pct);
      },
      reject,
      () => resolve()
    );
  });
  const url = await getDownloadURL(sref);
  return { url, storagePath };
}
