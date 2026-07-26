import * as FileSystem from 'expo-file-system/legacy';

const memory = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function cachePathForUrl(url: string): string {
  const hash = url
    .split('')
    .reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0)
    .toString(36)
    .replace(/^-/, 'n');
  return `${FileSystem.cacheDirectory}leap-week-prefetch-${hash}.mp4`;
}

/** Local file URI if already cached; otherwise the remote URL. */
export function peekWeekRecapLocalUri(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  return memory.get(trimmed) ?? null;
}

/**
 * Download a week-recap clip into the app cache (idempotent).
 * Returns a local `file://` URI when possible so playback starts without buffering the network.
 */
export async function ensureWeekRecapLocalUri(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error('Missing video URL.');
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;

  const cached = memory.get(trimmed);
  if (cached) return cached;

  const existing = inflight.get(trimmed);
  if (existing) return existing;

  const job = (async () => {
    const dest = cachePathForUrl(trimmed);
    try {
      const info = await FileSystem.getInfoAsync(dest);
      if (info.exists && typeof info.size === 'number' && info.size > 0) {
        memory.set(trimmed, dest);
        return dest;
      }
    } catch {
      /* download fresh */
    }

    const result = await FileSystem.downloadAsync(trimmed, dest);
    if (result.status !== 200) {
      throw new Error(`Prefetch failed (${result.status})`);
    }
    memory.set(trimmed, result.uri);
    return result.uri;
  })();

  inflight.set(trimmed, job);
  try {
    return await job;
  } finally {
    inflight.delete(trimmed);
  }
}

/** Kick off background prefetch; does not throw. First URL is prioritized, then the rest in parallel. */
export function prefetchWeekRecapClips(urls: string[]): void {
  const unique = Array.from(
    new Set(urls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u)))
  );
  if (unique.length === 0) return;

  const [first, ...rest] = unique;
  void (async () => {
    if (first) {
      try {
        await ensureWeekRecapLocalUri(first);
      } catch {
        /* best-effort */
      }
    }
    await Promise.all(
      rest.map((url) =>
        ensureWeekRecapLocalUri(url).catch(() => {
          /* best-effort */
        })
      )
    );
  })();
}
