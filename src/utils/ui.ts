import { Alert } from 'react-native';

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

export function showInfo(title: string, message: string) {
  Alert.alert(title, message);
}
