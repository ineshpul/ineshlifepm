import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';

import { REGION } from './callableOptions';
import { bootstrapUserProfileIfNeeded } from './bootstrapUserProfile';

/**
 * Safety net when the client bootstrap fails or is delayed — without `usernameLower`,
 * prefix search on `users` cannot find new accounts.
 *
 * Runs at Auth account creation (before client `updateProfile`), so we fall back to
 * email local-part when displayName is not set yet; the client signup flow overwrites
 * with the chosen handle when it runs.
 */
export const bootstrapUserOnAuthCreate = functions
  .region(REGION)
  .auth.user()
  .onCreate(async (user: admin.auth.UserRecord) => {
    const uid = user.uid;
    const candidate =
      String(user.displayName ?? '').trim() ||
      String(user.email ?? '')
        .split('@')[0]
        ?.trim() ||
      'user';

    try {
      await bootstrapUserProfileIfNeeded(admin.firestore(), { uid, candidateUsername: candidate });
    } catch (e) {
      logger.error('bootstrapUserOnAuthCreate failed', { uid, e });
    }
  });
