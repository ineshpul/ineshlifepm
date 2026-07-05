import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';

import { REGION } from './callableOptions';
import { bootstrapUserProfileIfNeeded } from './bootstrapUserProfile';

function candidateFromAuthUser(user: admin.auth.UserRecord): string {
  return (
    String(user.displayName ?? '').trim() ||
    String(user.email ?? '')
      .split('@')[0]
      ?.trim() ||
    'user'
  );
}

/**
 * Safety net when the client bootstrap fails or is delayed — without `usernameLower`,
 * prefix search on `users` cannot find new accounts.
 *
 * Runs at Auth account creation (often before client `updateProfile`), then re-checks
 * after a short delay once the chosen handle is usually written to displayName.
 */
export const bootstrapUserOnAuthCreate = functions
  .region(REGION)
  .auth.user()
  .onCreate(async (user: admin.auth.UserRecord) => {
    const uid = user.uid;
    const db = admin.firestore();

    const runBootstrap = async (candidate: string, pass: 'initial' | 'delayed') => {
      try {
        const result = await bootstrapUserProfileIfNeeded(db, { uid, candidateUsername: candidate });
        logger.info('bootstrapUserOnAuthCreate', { uid, pass, ...result });
      } catch (e) {
        logger.error('bootstrapUserOnAuthCreate failed', { uid, pass, e });
      }
    };

    await runBootstrap(candidateFromAuthUser(user), 'initial');

    const hadDisplayName = Boolean(String(user.displayName ?? '').trim());
    if (hadDisplayName) return;

    await new Promise((r) => setTimeout(r, 8000));
    try {
      const fresh = await admin.auth().getUser(uid);
      const delayedCandidate = candidateFromAuthUser(fresh);
      if (delayedCandidate !== candidateFromAuthUser(user)) {
        await runBootstrap(delayedCandidate, 'delayed');
      }
    } catch (e) {
      logger.warn('bootstrapUserOnAuthCreate delayed refresh failed', { uid, e });
    }
  });
