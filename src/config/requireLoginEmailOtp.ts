import { getExpoExtra } from './expoExtra';

/** When true (e.g. production app.json), email/password sign-in sends a 6-digit code first. Apple / Google / biometrics are unchanged. */
export function requireLoginEmailOtp(): boolean {
  const v = getExpoExtra().requireLoginEmailOtp;
  return v === true;
}
