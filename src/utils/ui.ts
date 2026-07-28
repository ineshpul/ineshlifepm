import { Alert } from 'react-native';

import { toUserFacingCameraRecordingError } from './cameraRecordingErrors';

function errorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const e = err as { message?: string; code?: string };
    const msg = String(e.message ?? '').trim();
    if (msg && msg !== 'internal') return msg;
    const code = String(e.code ?? '').replace(/^functions\//u, '');
    if (code === 'deadline-exceeded') return 'Request timed out. Please try again.';
    if (code) return code;
  }
  return 'Something went wrong. Please try again.';
}

export function showError(title: string, err: unknown) {
  Alert.alert(title, errorMessage(err));
}

export function showCameraRecordingError(err: unknown, title = 'Camera error') {
  let body = toUserFacingCameraRecordingError(err).message;
  const lower = body.toLowerCase();
  if (lower.includes('recording a video') || lower.includes('video recording failed')) {
    body = 'The camera was busy. Wait a moment, then tap record to try again.';
  }
  Alert.alert(title, body);
}

export function showInfo(title: string, message: string) {
  Alert.alert(title, message);
}
