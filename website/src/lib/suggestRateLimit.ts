/** Best-effort rate limit for the public suggest API (no Redis). */

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 8;
const MIN_INTERVAL_MS = 45_000;

type Entry = { times: number[]; lastAt: number };

const globalStore = globalThis as typeof globalThis & {
  __leapSuggestRate?: Map<string, Entry>;
};

function store(): Map<string, Entry> {
  if (!globalStore.__leapSuggestRate) {
    globalStore.__leapSuggestRate = new Map();
  }
  return globalStore.__leapSuggestRate;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function checkSuggestRateLimit(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const key = ip.slice(0, 120) || 'unknown';
  const now = Date.now();
  const map = store();
  let entry = map.get(key);
  if (!entry) {
    entry = { times: [], lastAt: 0 };
    map.set(key, entry);
  }

  if (entry.lastAt && now - entry.lastAt < MIN_INTERVAL_MS) {
    const retryAfterSec = Math.ceil((MIN_INTERVAL_MS - (now - entry.lastAt)) / 1000);
    return { ok: false, retryAfterSec };
  }

  const windowStart = now - WINDOW_MS;
  entry.times = entry.times.filter((t) => t > windowStart);
  if (entry.times.length >= MAX_PER_WINDOW) {
    const oldest = entry.times[0] ?? now;
    const retryAfterSec = Math.max(60, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    return { ok: false, retryAfterSec };
  }

  entry.times.push(now);
  entry.lastAt = now;
  if (map.size > 5000) {
    for (const [k, v] of map) {
      if (!v.times.some((t) => t > windowStart)) map.delete(k);
    }
  }
  return { ok: true };
}
