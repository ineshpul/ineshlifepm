/** Verified sender on taketheleap.app in Resend. Override with RESEND_FROM_EMAIL on the function if needed. */
export const DEFAULT_RESEND_FROM = 'Leap <inesh@taketheleap.app>';

export function resendFromAddress(): string {
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  return from || DEFAULT_RESEND_FROM;
}
