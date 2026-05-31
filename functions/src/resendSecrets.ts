import { defineSecret } from 'firebase-functions/params';

/**
 * Resend API key (OTP, challenge suggestions, etc.).
 *
 * Set once in Secret Manager, then deploy functions that list it in `secrets`:
 *   firebase functions:secrets:set RESEND_API_KEY
 *
 * Local emulator: put `RESEND_API_KEY=...` in `functions/.env` or your shell.
 *
 * Sender defaults to Leap <inesh@taketheleap.app> (see resendFrom.ts). Optional override:
 *   firebase functions:config:set (legacy) or set RESEND_FROM_EMAIL in the function env.
 */
export const resendApiKey = defineSecret('RESEND_API_KEY');
