function rawMessage(err: unknown): string {
  if (typeof err === 'string') return err.trim();
  if (err && typeof err === 'object') {
    const e = err as {
      message?: string;
      reason?: string;
      code?: string;
      nativeError?: { message?: string };
    };
    const fromNative = String(e.nativeError?.message ?? '').trim();
    if (fromNative) return fromNative;
    const msg = String(e.message ?? e.reason ?? '').trim();
    if (msg && msg !== 'internal') return msg;
    const code = String(e.code ?? '').replace(/^ERR_/u, '').replace(/^functions\//u, '');
    if (code && !code.toLowerCase().includes('internal')) return code;
  }
  return '';
}

/** Maps native / expo-camera recording failures to actionable copy. */
export function toUserFacingCameraRecordingError(err: unknown): Error {
  const lower = rawMessage(err).toLowerCase();
  if (!lower) {
    return new Error('Could not record video. Tap record to try again.');
  }
  if (
    lower.includes('recording a video') ||
    lower.includes('camera not ready') ||
    lower.includes('camera is not ready') ||
    lower.includes('camera output not ready') ||
    lower.includes('video recording failed')
  ) {
    return new Error(
      'The camera was busy. Wait a moment, then tap record to try again.'
    );
  }
  if (lower.includes('unmounted')) {
    return new Error('The camera closed. Tap record to try again.');
  }
  if (lower.includes('microphone') || lower.includes('audio')) {
    return new Error('Microphone access is needed to record video with sound.');
  }
  const original = rawMessage(err);
  if (original.length > 0 && original.length < 160 && !original.includes('internal')) {
    return new Error(original);
  }
  return new Error('Could not record video. Tap record to try again.');
}
