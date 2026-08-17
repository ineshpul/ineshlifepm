import * as FileSystem from 'expo-file-system/legacy';

const STAGED_PREFIX = 'leap-feed-playback-';
const LEGACY_STAGED = /^(primary|pip)\.(mp4|jpg)$/;
const SESSION_STAGED = /^(primary|pip)-(\d+)\.(mp4|jpg)$/;

function stagedDir(): string {
  return FileSystem.documentDirectory ?? '';
}

function guessExt(uri: string, mediaType?: 'video' | 'photo'): 'mp4' | 'jpg' {
  if (mediaType === 'photo') return 'jpg';
  if (/\.(jpe?g|png|heic|webp)$/i.test(uri)) return 'jpg';
  return 'mp4';
}

function urisPointAtSameFile(a: string, b: string): boolean {
  const norm = (u: string) => {
    const trimmed = u.replace(/^file:\/\//, '').replace(/\/+$/, '');
    try {
      return decodeURI(trimmed);
    } catch {
      return trimmed;
    }
  };
  return norm(a) === norm(b);
}

export function isStagedFeedPlaybackUri(uri: string): boolean {
  return uri.includes(STAGED_PREFIX);
}

export async function localMediaFileExists(uri: string): Promise<boolean> {
  if (!uri || uri.startsWith('demo://') || /^https?:\/\//i.test(uri)) return false;
  const candidates = uri.startsWith('file://') ? [uri] : [uri, `file://${uri}`];
  for (const candidate of candidates) {
    try {
      const info = await FileSystem.getInfoAsync(candidate);
      if (info.exists) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

function destPath(tag: 'primary' | 'pip', sessionId: number, ext: 'mp4' | 'jpg'): string {
  return `${stagedDir()}${STAGED_PREFIX}${tag}-${sessionId}.${ext}`;
}

function shouldCleanupName(name: string, sessionId?: number): boolean {
  if (!name.startsWith(STAGED_PREFIX)) return false;
  const rest = name.slice(STAGED_PREFIX.length);
  if (sessionId == null) return true;
  const sessionMatch = SESSION_STAGED.exec(rest);
  if (sessionMatch && Number(sessionMatch[2]) === sessionId) return true;
  // Old builds used a single shared filename. Always eligible so a late
  // cleanup cannot be skipped, but callers must pass a session id so a
  // newer unique file is left alone.
  return LEGACY_STAGED.test(rest);
}

/** Stable on-device copy so feed playback survives camera temp cleanup after post. */
export async function stageFeedPlaybackClip(
  sourceUri: string,
  tag: 'primary' | 'pip',
  opts?: { sessionId?: number; mediaType?: 'video' | 'photo' }
): Promise<string> {
  if (!sourceUri || sourceUri.startsWith('demo://')) {
    throw new Error('No video to stage.');
  }
  if (!(await localMediaFileExists(sourceUri))) {
    throw new Error('Recording file is no longer on this device.');
  }

  // Retry / resume already points at a durable copy — never copy a file onto itself
  // (that can delete the only remaining take).
  if (isStagedFeedPlaybackUri(sourceUri)) {
    return sourceUri;
  }

  const ext = guessExt(sourceUri, opts?.mediaType);
  const sessionId = opts?.sessionId ?? Date.now();
  const dest = destPath(tag, sessionId, ext);
  if (urisPointAtSameFile(sourceUri, dest)) {
    return dest;
  }

  const existing = await FileSystem.getInfoAsync(dest);
  if (existing.exists) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
  }
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

export async function cleanupStagedFeedPlaybackClips(sessionId?: number): Promise<void> {
  const dir = stagedDir();
  if (!dir) return;

  let names: string[] = [];
  try {
    names = await FileSystem.readDirectoryAsync(dir);
  } catch {
    // Fall back to known legacy paths if the directory listing fails.
    names = ['primary.mp4', 'pip.mp4', 'primary.jpg', 'pip.jpg'].map(
      (rest) => `${STAGED_PREFIX}${rest}`
    );
  }

  await Promise.all(
    names.map(async (name) => {
      if (!shouldCleanupName(name, sessionId)) return;
      try {
        await FileSystem.deleteAsync(`${dir}${name}`, { idempotent: true });
      } catch {
        /* noop */
      }
    })
  );
}
