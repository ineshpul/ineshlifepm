import { Alert } from 'react-native';

export function showError(title: string, err: unknown) {
  const message =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'message' in err
        ? String((err as any).message)
        : 'Something went wrong. Please try again.';
  Alert.alert(title, message);
}

export function showInfo(title: string, message: string) {
  Alert.alert(title, message);
}
