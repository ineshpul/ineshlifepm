import * as logger from 'firebase-functions/logger';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import * as admin from 'firebase-admin';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import {
  RekognitionClient,
  StartContentModerationCommand,
  GetContentModerationCommand,
} from '@aws-sdk/client-rekognition';

/** Rekognition Video stored-video moderation (analogous to image DetectModerationLabels). */
const CONFIDENCE_THRESHOLD_PCT = 80;

const VIDEO_PATH_RE = /^videos\/([^/]+)\/([^/]+)\/[^/]+$/;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : undefined;
}

export const onLeapVideoUploadedModerate = onObjectFinalized(
  {
    region: 'us-east1',
    timeoutSeconds: 540,
    memory: '1GiB',
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

    const isVideoMime = contentType.startsWith('video/') || /\.mp4$/i.test(objectPath);
    if (!isVideoMime) {
      logger.info('Skip moderation: not a video object', { objectPath, contentType });
      return;
    }

    const awsRegion = env('AWS_REGION') ?? 'us-east-1';
    const moderationBucket = env('AWS_MODERATION_BUCKET');
    const accessKeyId = env('AWS_ACCESS_KEY_ID');
    const secretAccessKey = env('AWS_SECRET_ACCESS_KEY');

    if (!moderationBucket || !accessKeyId || !secretAccessKey) {
      logger.error('Missing AWS env (AWS_MODERATION_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY); skipping moderation', {
        videoDocId,
      });
      return;
    }

    const s3Key = `firebase-moderation/${videoDocId}/${event.data.generation ?? Date.now()}-${objectPath.split('/').pop() ?? 'video.mp4'}`;

    const s3 = new S3Client({
      region: awsRegion,
      credentials: { accessKeyId, secretAccessKey },
    });

    const rekognition = new RekognitionClient({
      region: awsRegion,
      credentials: { accessKeyId, secretAccessKey },
    });

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

      let jobStatus = '';
      for (let attempt = 0; attempt < 120; attempt++) {
        const poll = await rekognition.send(new GetContentModerationCommand({ JobId: jobId }));
        jobStatus = String(poll.JobStatus ?? '');
        if (jobStatus === 'SUCCEEDED') {
          let flagged = false;
          let nextToken: string | undefined;
          do {
            const page = await rekognition.send(
              new GetContentModerationCommand({ JobId: jobId, NextToken: nextToken })
            );
            for (const row of page.ModerationLabels ?? []) {
              const conf = row.ModerationLabel?.Confidence ?? 0;
              if (conf >= CONFIDENCE_THRESHOLD_PCT) {
                flagged = true;
                break;
              }
            }
            if (flagged) break;
            nextToken = page.NextToken;
          } while (nextToken);

          const status = flagged ? 'flagged' : 'live';
          const moderationStatus = flagged ? 'rejected' : 'approved';

          await admin.firestore().doc(`videos/${videoDocId}`).set(
            {
              status,
              moderationStatus,
              moderationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          logger.info('Video moderation complete', { videoDocId, status, moderationStatus });
          return;
        }
        if (jobStatus === 'FAILED') {
          throw new Error(`Rekognition job FAILED: ${poll.StatusMessage ?? 'unknown'}`);
        }
        await sleep(4000);
      }

      throw new Error(`Rekognition job did not finish (last status: ${jobStatus || 'UNKNOWN'})`);
    } catch (e) {
      logger.error('Video moderation pipeline error', { videoDocId, err: e });
      throw e;
    } finally {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: moderationBucket, Key: s3Key }));
      } catch (delErr) {
        logger.warn('Could not delete temporary S3 object', { s3Key, delErr });
      }
    }
  }
);
