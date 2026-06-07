import * as logger from 'firebase-functions/logger';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import * as admin from 'firebase-admin';
import { Upload } from '@aws-sdk/lib-storage';
import { StartContentModerationCommand } from '@aws-sdk/client-rekognition';

import { awsModerationSecrets } from './awsSecrets';
import {
  CONFIDENCE_THRESHOLD_PCT,
  MODERATION_JOBS_COLLECTION,
  awsClients,
  deleteModerationS3Object,
} from './videoModerationCore';

const VIDEO_PATH_RE = /^videos\/([^/]+)\/([^/]+)\/[^/]+$/;

/**
 * On upload: copy primary video to S3, start Rekognition, exit. Fast polling runs on job create;
 * scheduler is backup.
 */
export const onLeapVideoUploadedModerate = onObjectFinalized(
  {
    region: 'us-east1',
    timeoutSeconds: 300,
    memory: '512MiB',
    secrets: [...awsModerationSecrets],
  },
  async (event) => {
    const bucketName = event.data.bucket;
    const objectPath = event.data.name;
    const contentType = event.data.contentType ?? '';

    const m = objectPath.match(VIDEO_PATH_RE);
    if (!m) return;

    const uid = m[1];
    const challengeDate = m[2];
    const videoDocId = `${uid}_${challengeDate}`;
    const fileName = objectPath.split('/').pop() ?? '';

    // Dual-camera PIP is a secondary upload — moderating it would overwrite the primary job.
    if (/_pip\.(mp4|mov)$/i.test(fileName)) {
      logger.info('Skip moderation: PIP secondary upload', { objectPath });
      return;
    }

    const isVideoMime = contentType.startsWith('video/') || /\.(mp4|mov)$/i.test(objectPath);
    if (!isVideoMime) {
      logger.info('Skip moderation: not a video object', { objectPath, contentType });
      return;
    }

    const clients = awsClients();
    if (!clients) {
      logger.error('Missing AWS env; skipping moderation', { videoDocId });
      return;
    }

    const jobRef = admin.firestore().doc(`${MODERATION_JOBS_COLLECTION}/${videoDocId}`);
    const existingJob = await jobRef.get();
    if (existingJob.exists && String(existingJob.data()?.status ?? '') === 'running') {
      logger.info('Skip moderation: job already running for video', { videoDocId, objectPath });
      return;
    }

    const { s3, rekognition, bucket: moderationBucket } = clients;
    const s3Key = `firebase-moderation/${videoDocId}/${event.data.generation ?? Date.now()}-${fileName || 'video.mp4'}`;

    const gcsFile = admin.storage().bucket(bucketName).file(objectPath);

    try {
      const readStream = gcsFile.createReadStream();
      const upload = new Upload({
        client: s3,
        params: {
          Bucket: moderationBucket,
          Key: s3Key,
          Body: readStream,
          ContentType: contentType || 'video/mp4',
        },
      });
      await upload.done();

      const startOut = await rekognition.send(
        new StartContentModerationCommand({
          Video: { S3Object: { Bucket: moderationBucket, Name: s3Key } },
          MinConfidence: CONFIDENCE_THRESHOLD_PCT,
        })
      );

      const jobId = startOut.JobId;
      if (!jobId) {
        throw new Error('Rekognition StartContentModeration returned no JobId');
      }

      await jobRef.set({
        videoDocId,
        jobId,
        s3Key,
        s3Bucket: moderationBucket,
        status: 'running',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info('Moderation job queued', { videoDocId, jobId });
    } catch (e) {
      logger.error('Video moderation upload/start error', { videoDocId, err: e });
      await deleteModerationS3Object(s3, moderationBucket, s3Key);
      throw e;
    }
  }
);
