import type { CallableOptions } from 'firebase-functions/v2/https';

export const REGION = 'us-central1';

/** Verifies App Check when the client sends a token; does not reject missing tokens (enable enforcement in Console when ready). */
export const CALLABLE_OPTIONS: CallableOptions = {
  region: REGION,
  consumeAppCheckToken: true,
};
