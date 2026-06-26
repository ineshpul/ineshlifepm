/** Retry async work with exponential backoff — for transient network / Firestore errors. */
export async function withRetries<T>(
  fn: () => Promise<T>,
  opts?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    /** Return true to retry this error. */
    shouldRetry?: (err: unknown, attempt: number) => boolean;
  }
): Promise<T> {
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? 3);
  const baseDelayMs = opts?.baseDelayMs ?? 800;
  const shouldRetry =
    opts?.shouldRetry ??
    ((err: unknown) => {
      const code = String((err as { code?: string })?.code ?? '').toLowerCase();
      const msg = String((err as Error)?.message ?? err ?? '').toLowerCase();
      if (code === 'permission-denied' || code === 'invalid-argument') return false;
      if (msg.includes('already posted')) return false;
      return (
        code === 'unavailable' ||
        code === 'deadline-exceeded' ||
        code === 'resource-exhausted' ||
        code === 'aborted' ||
        code === 'cancelled' ||
        msg.includes('network') ||
        msg.includes('timeout') ||
        msg.includes('timed out') ||
        msg.includes('fetch')
      );
    });

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLast = attempt >= maxAttempts - 1;
      if (isLast || !shouldRetry(err, attempt)) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
