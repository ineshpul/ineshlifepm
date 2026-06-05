import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import {
  RekognitionClient,
  GetContentModerationCommand,
} from '@aws-sdk/client-rekognition';

import { awsAccessKeyId, awsSecretAccessKey } from './awsSecrets';

export const MODERATION_JOBS_COLLECTION = 'videoModerationJobs';
export const CONFIDENCE_THRESHOLD_PCT = 80;
const JOB_MAX_AGE_MS = 45 * 60 * 1000;

export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : undefined;
}

export function awsClients(): { s3: S3Client; rekognition: RekognitionClient; bucket: string } | null {
  const awsRegion = env('AWS_REGION') ?? 'us-east-1';
  const moderationBucket = env('AWS_MODERATION_BUCKET');
  const accessKeyId = awsAccessKeyId.value() || env('AWS_ACCESS_KEY_ID');
  const secretAccessKey = awsSecretAccessKey.value() || env('AWS_SECRET_ACCESS_KEY');
  if (!moderationBucket || !accessKeyId || !secretAccessKey) return null;
  const credentials = { accessKeyId, secretAccessKey };
  return {
    bucket: moderationBucket,
    s3: new S3Client({ region: awsRegion, credentials }),
    rekognition: new RekognitionClient({ region: awsRegion, credentials }),
  };
}

export async function applyModerationResult(videoDocId: string, flagged: boolean): Promise<void> {
  const moderationStatus = flagged ? 'rejected' : 'approved';
  const status = flagged ? 'flagged' : 'live';
  await admin.firestore().doc(`videos/${videoDocId}`).set(
    {
      status,
      moderationStatus,
      moderationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  logger.info('Video moderation complete', { videoDocId, status, moderationStatus });
}

export async function deleteModerationS3Object(
  s3: S3Client,
  bucket: string,
  s3Key: string
): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: s3Key }));
  } catch (delErr) {
    logger.warn('Could not delete temporary S3 object', { s3Key, delErr });
  }
}

export type RekognitionPollResult =
  | { state: 'done'; flagged: boolean }
  | { state: 'pending' }
  | { state: 'failed'; message: string };

export async function pollRekognitionJob(
  rekognition: RekognitionClient,
  jobId: string
): Promise<RekognitionPollResult> {
  const poll = await rekognition.send(new GetContentModerationCommand({ JobId: jobId }));
  const jobStatus = String(poll.JobStatus ?? '');
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
    return { state: 'done', flagged };
  }
  if (jobStatus === 'FAILED') {
    return { state: 'failed', message: String(poll.StatusMessage ?? 'unknown') };
  }
  return { state: 'pending' };
}

function jobCreatedMs(data: Record<string, unknown>): number {
  const at = data.createdAt as { toMillis?: () => number } | undefined;
  return at?.toMillis?.() ?? 0;
}

/** Polls pending Rekognition jobs (short-lived scheduler; upload function no longer blocks on polls). */
export async function processPendingModerationJobs(limit = 15): Promise<void> {
  const clients = awsClients();
  if (!clients) {
    logger.error('pollVideoModerationJobs: missing AWS config');
    return;
  }
  const { s3, rekognition, bucket } = clients;
  const db = admin.firestore();
  const snap = await db
    .collection(MODERATION_JOBS_COLLECTION)
    .where('status', '==', 'running')
    .limit(limit)
    .get();

  const now = Date.now();
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const videoDocId = String(data.videoDocId ?? doc.id);
    const jobId = String(data.jobId ?? '');
    const s3Key = String(data.s3Key ?? '');
    if (!jobId || !s3Key) {
      await doc.ref.delete().catch(() => {});
      continue;
    }

    const createdMs = jobCreatedMs(data);
    if (createdMs && now - createdMs > JOB_MAX_AGE_MS) {
      logger.error('Moderation job timed out', { videoDocId, jobId });
      await doc.ref.set({ status: 'timeout', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      await deleteModerationS3Object(s3, bucket, s3Key);
      continue;
    }

    try {
      const result = await pollRekognitionJob(rekognition, jobId);
      if (result.state === 'pending') continue;
      if (result.state === 'failed') {
        logger.error('Rekognition job FAILED', { videoDocId, message: result.message });
        await doc.ref.set({ status: 'failed', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        await deleteModerationS3Object(s3, bucket, s3Key);
        continue;
      }
      await applyModerationResult(videoDocId, result.flagged);
      await doc.ref.delete().catch(() => {});
      await deleteModerationS3Object(s3, bucket, s3Key);
    } catch (e) {
      logger.error('poll moderation job error', { videoDocId, e });
    }
  }
}
