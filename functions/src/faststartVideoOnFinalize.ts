import * as logger from 'firebase-functions/logger';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

import {
  FEED_ENCODE_VERSION,
  ensureFeedClipEncode,
  parseBestPartVideoPath,
  parseLeapVideoPath,
} from './faststartVideoCore';

const ENCODE_OPTS = {
  timeoutSeconds: 540,
  memory: '4GiB' as const,
  cpu: 2,
};

/**
 * Storage finalize: 720p feed-encode newly uploaded leap / Best Part MP4s (primary + PIP).
 * Region matches existing storage triggers (us-east1).
 */
export const onLeapVideoUploadedFaststart = onObjectFinalized(
  {
    region: 'us-east1',
    ...ENCODE_OPTS,
  },
  async (event) => {
    const bucketName = event.data.bucket;
    const objectPath = event.data.name;
    const contentType = event.data.contentType ?? '';

    if (!objectPath) return;
    if (contentType && !contentType.startsWith('video/') && !/\.mp4$/i.test(objectPath)) {
      return;
    }

    const parsed = parseLeapVideoPath(objectPath) ?? parseBestPartVideoPath(objectPath);
    if (!parsed) {
      // _feed.mp4 and unrelated paths are ignored
      return;
    }

    try {
      await ensureFeedClipEncode({ bucketName, sourceObjectPath: objectPath });
    } catch (e) {
      logger.error('feed encode failed', { objectPath, kind: parsed.kind, err: e });
      throw e;
    }
  }
);

/**
 * If the leap video doc is created after encode finished, attach feed URLs from existing
 * `_feed` objects (or encode now from storagePath / secondaryStoragePath).
 */
export const onLeapVideoCreatedAttachFaststart = onDocumentCreated(
  {
    document: 'videos/{videoId}',
    region: 'us-central1',
    ...ENCODE_OPTS,
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    if (data.mediaType === 'photo') return;

    const bucket = admin.storage().bucket();
    const bucketName = bucket.name;

    const primaryPath = String(data.storagePath ?? '').trim();
    const secondaryPath = String(data.secondaryStoragePath ?? '').trim();
    const encodeVersion = String(data.feedEncodeVersion ?? '').trim();
    const needsPrimary =
      Boolean(primaryPath) &&
      (!String(data.feedUrl ?? '').trim() || encodeVersion !== FEED_ENCODE_VERSION);
    const needsPip =
      Boolean(secondaryPath) &&
      (!String(data.feedSecondaryUrl ?? '').trim() || encodeVersion !== FEED_ENCODE_VERSION);

    const tasks: Promise<unknown>[] = [];
    if (needsPrimary) {
      tasks.push(
        ensureFeedClipEncode({ bucketName, sourceObjectPath: primaryPath }).catch((e) => {
          logger.error('attach feed encode primary failed', { primaryPath, err: e });
        })
      );
    }
    if (needsPip) {
      tasks.push(
        ensureFeedClipEncode({ bucketName, sourceObjectPath: secondaryPath }).catch((e) => {
          logger.error('attach feed encode pip failed', { secondaryPath, err: e });
        })
      );
    }
    await Promise.all(tasks);
  }
);

/**
 * Same race-fix attach for Best Part video docs.
 */
export const onBestPartCreatedAttachFeedEncode = onDocumentCreated(
  {
    document: 'bestParts/{bestPartId}',
    region: 'us-central1',
    ...ENCODE_OPTS,
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    if (data.mediaType === 'photo') return;

    const bucket = admin.storage().bucket();
    const bucketName = bucket.name;

    const primaryPath = String(data.storagePath ?? '').trim();
    const secondaryPath = String(data.secondaryStoragePath ?? '').trim();
    const encodeVersion = String(data.feedEncodeVersion ?? '').trim();
    const needsPrimary =
      Boolean(primaryPath) &&
      (!String(data.feedUrl ?? '').trim() || encodeVersion !== FEED_ENCODE_VERSION);
    const needsPip =
      Boolean(secondaryPath) &&
      (!String(data.feedSecondaryUrl ?? '').trim() || encodeVersion !== FEED_ENCODE_VERSION);

    const tasks: Promise<unknown>[] = [];
    if (needsPrimary && primaryPath.endsWith('.mp4')) {
      tasks.push(
        ensureFeedClipEncode({ bucketName, sourceObjectPath: primaryPath }).catch((e) => {
          logger.error('attach bestPart feed encode primary failed', { primaryPath, err: e });
        })
      );
    }
    if (needsPip && secondaryPath.endsWith('.mp4')) {
      tasks.push(
        ensureFeedClipEncode({ bucketName, sourceObjectPath: secondaryPath }).catch((e) => {
          logger.error('attach bestPart feed encode pip failed', { secondaryPath, err: e });
        })
      );
    }
    await Promise.all(tasks);
  }
);

export { ensureFeedClipEncode, ensureLeapClipFaststart } from './faststartVideoCore';
