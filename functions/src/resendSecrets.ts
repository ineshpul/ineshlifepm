import { defineSecret } from 'firebase-functions/params';

/**
 * Resend API key (OTP, challenge suggestions, etc.).
 *
 * Set once in Secret Manager, then deploy functions that list it in `secrets`:
 *   firebase functions:secrets:set RESEND_API_KEY
 *
 * Local emulator: put `RESEND_API_KEY=...` in `functions/.env` or your shell.
 */
export const resendApiKey = defineSecret('RESEND_API_KEY');
