import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';
import { getDownloadURL, ref, uploadBytesResumable, type UploadTaskSnapshot } from 'firebase/storage';

import { storage } from '../../firebase/firebase';
import type { AttachmentKind, MessageAttachment } from '../../chat/types';
import {
  CHAT_ALLOWED_AUDIO_MIMES,
  CHAT_ALLOWED_DOC_MIMES,
  CHAT_ALLOWED_IMAGE_MIMES,
  CHAT_ALLOWED_VIDEO_MIMES,
  CHAT_MAX_AUDIO_BYTES,
  CHAT_MAX_DOC_BYTES,
  CHAT_MAX_IMAGE_BYTES,
  CHAT_MAX_VIDEO_BYTES,
} from '../../chat/constants';

function kindFromMime(mime: string): AttachmentKind {
  if (CHAT_ALLOWED_IMAGE_MIMES.includes(mime)) return 'image';
  if (CHAT_ALLOWED_VIDEO_MIMES.includes(mime)) return 'video';
  if (CHAT_ALLOWED_AUDIO_MIMES.includes(mime)) return 'audio';
  return 'document';
}

function maxBytesForKind(k: AttachmentKind): number {
  if (k === 'image') return CHAT_MAX_IMAGE_BYTES;
  if (k === 'video') return CHAT_MAX_VIDEO_BYTES;
  if (k === 'audio') return CHAT_MAX_AUDIO_BYTES;
  return CHAT_MAX_DOC_BYTES;
}

function allowedMime(k: AttachmentKind, mime: string): boolean {
  if (k === 'image') return CHAT_ALLOWED_IMAGE_MIMES.includes(mime);
  if (k === 'video') return CHAT_ALLOWED_VIDEO_MIMES.includes(mime);
  if (k === 'audio') return CHAT_ALLOWED_AUDIO_MIMES.includes(mime);
  return CHAT_ALLOWED_DOC_MIMES.includes(mime);
}

export async function validateLocalFile(uri: string, mime: string): Promise<{ ok: true; size: number } | { ok: false; error: string }> {
  const kind = kindFromMime(mime);
  if (!allowedMime(kind, mime)) {
    return { ok: false, error: 'This file type is not allowed in chat.' };
  }
  const info = await FileSystem.getInfoAsync(uri as any);
  const size = info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
  if (!size) return { ok: false, error: 'Could not read file size.' };
  if (size > maxBytesForKind(kind)) {
    return { ok: false, error: 'File is too large for chat.' };
  }
  return { ok: true, size };
}

function base64ToBytes(b64: string): Uint8Array {
  // `atob` exists in Expo/RN JS runtime. Fallback keeps typechecker happy.
  const a = typeof globalThis.atob === 'function' ? globalThis.atob : undefined;
  if (!a) throw new Error('Base64 decoder is unavailable.');
  const bin = a(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function uploadChatAttachment(args: {
  conversationId: string;
  uploaderUid: string;
  localUri: string;
  mimeType: string;
  bytes: number;
  onProgress?: (pct: number) => void;
  thumbnailUri?: string | null;
}): Promise<MessageAttachment> {
  const kind = kindFromMime(args.mimeType);
  if (!allowedMime(kind, args.mimeType)) throw new Error('Unsupported file type.');
  if (args.bytes > maxBytesForKind(kind)) throw new Error('File too large.');

  const id = Crypto.randomUUID();
  const ext =
    kind === 'image'
      ? 'jpg'
      : kind === 'video'
        ? 'mp4'
        : kind === 'audio'
          ? 'm4a'
          : 'bin';
  const path = `chat/${args.conversationId}/${args.uploaderUid}/${id}.${ext}`;
  const sref = ref(storage(), path);

  // `fetch(file://...)` can fail on some iOS/Android URI schemes. Read via FileSystem as base64.
  const b64 = await FileSystem.readAsStringAsync(args.localUri, {
    encoding: 'base64' as any,
  } as any);
  const bytes = base64ToBytes(b64);

  const task = uploadBytesResumable(sref, bytes, { contentType: args.mimeType });
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

  const downloadUrl = await getDownloadURL(sref);
  let thumbnailUrl: string | undefined;
  if (args.thumbnailUri && kind === 'video') {
    const tpath = `chat/${args.conversationId}/${args.uploaderUid}/${id}_thumb.jpg`;
    const tref = ref(storage(), tpath);
    const tb64 = await FileSystem.readAsStringAsync(args.thumbnailUri, {
      encoding: 'base64' as any,
    } as any);
    const tbytes = base64ToBytes(tb64);
    await uploadBytesResumable(tref, tbytes, { contentType: 'image/jpeg' });
    thumbnailUrl = await getDownloadURL(tref);
  }

  const att: MessageAttachment = {
    id,
    kind,
    storagePath: path,
    downloadUrl,
    mimeType: args.mimeType,
    sizeBytes: args.bytes,
    thumbnailUrl,
  };
  return att;
}
