export const LEAP_APP_STORE_URL =
  'https://apps.apple.com/us/app/leap-one-day-one-leap/id6764062329';

export function buildReferralShareMessage(username: string): string {
  const handle = username.trim().replace(/^@+/u, '');
  return (
    `I'm on Leap — one challenge a day at noon ET.\n` +
    `Download: ${LEAP_APP_STORE_URL}\n` +
    `When you sign up, add ${handle} as who invited you.`
  );
}
