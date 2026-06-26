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
const TERMINAL_MODERATION_STATUSES = new Set(['approved', 'rejected', 'nulled']);

export type ModerationApplyResult = 'applied' | 'already_decided' | 'not_ready';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Manual staff decision or Rekognition — first terminal status wins; stale jobs are ignored. */
export async function applyModerationResult(
  videoDocId: string,
  flagged: boolean
): Promise<ModerationApplyResult> {
  const db = admin.firestore();
  const videoRef = db.doc(`videos/${videoDocId}`);
  const moderationStatus = flagged ? 'rejected' : 'approved';
  const status = flagged ? 'flagged' : 'live';

  return db.runTransaction(async (tx) => {
    const videoSnap = await tx.get(videoRef);
    if (!videoSnap.exists) {
      logger.info('Moderation deferred: video doc not created yet', { videoDocId });
      return 'not_ready';
    }

    const data = videoSnap.data() as Record<string, unknown> | undefined;
    const current = String(data?.moderationStatus ?? 'pending');
    if (TERMINAL_MODERATION_STATUSES.has(current)) {
      logger.info('Moderation skipped: already decided', { videoDocId, current });
      return 'already_decided';
    }

    tx.set(
      videoRef,
      {
        status,
        moderationStatus,
        moderationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        moderationSource: 'rekognition',
      },
      { merge: true }
    );
    return 'applied';
  }).then((result) => {
    if (result === 'applied') {
      logger.info('Video moderation complete (Rekognition)', { videoDocId, moderationStatus });
    }
    return result;
  });
}

/** Stop polling Rekognition when staff (or an earlier decision) has already settled the video. */
export async function cancelModerationJob(videoDocId: string): Promise<void> {
  const clients = awsClients();
  const db = admin.firestore();
  const jobRef = db.doc(`${MODERATION_JOBS_COLLECTION}/${videoDocId}`);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) return;

  const data = jobSnap.data() as Record<string, unknown>;
  const s3Key = String(data.s3Key ?? '');
  const bucket = String(data.s3Bucket ?? clients?.bucket ?? '');
  if (clients && s3Key && bucket) {
    await deleteModerationS3Object(clients.s3, bucket, s3Key);
  }
  await jobRef.delete().catch(() => {});
  logger.info('Moderation job cancelled', { videoDocId });
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

async function finishModerationJobDoc(
  jobRef: admin.firestore.DocumentReference,
  data: Record<string, unknown>,
  s3: S3Client,
  bucket: string
): Promise<void> {
  const s3Key = String(data.s3Key ?? '');
  await jobRef.delete().catch(() => {});
  if (s3Key) await deleteModerationS3Object(s3, bucket, s3Key);
}

/** When AWS moderation is unavailable, approve once the Firestore video doc exists. */
export async function processAutoApproveWhenReadyJob(
  jobRef: admin.firestore.DocumentReference,
  data: Record<string, unknown>
): Promise<boolean> {
  const videoDocId = String(data.videoDocId ?? jobRef.id);
  const applyResult = await applyModerationResult(videoDocId, false);
  if (applyResult === 'not_ready') return false;
  await jobRef.delete().catch(() => {});
  logger.info('Video auto-approved (moderation fallback)', { videoDocId });
  return true;
}

/** Poll one Firestore moderation job doc; returns true when the job doc was removed or failed out. */
export async function processOneModerationJobDoc(
  jobRef: admin.firestore.DocumentReference,
  data: Record<string, unknown>,
  clients: { s3: S3Client; rekognition: RekognitionClient; bucket: string }
): Promise<boolean> {
  const status = String(data.status ?? '');
  if (status === 'auto_approve_when_ready') {
    return processAutoApproveWhenReadyJob(jobRef, data);
  }

  const { s3, rekognition, bucket } = clients;
  const videoDocId = String(data.videoDocId ?? jobRef.id);
  const jobId = String(data.jobId ?? '');
  const s3Key = String(data.s3Key ?? '');
  if (!jobId || !s3Key) {
    await jobRef.delete().catch(() => {});
    return true;
  }

  const createdMs = jobCreatedMs(data);
  if (createdMs && Date.now() - createdMs > JOB_MAX_AGE_MS) {
    logger.error('Moderation job timed out — auto-approving', { videoDocId, jobId });
    const applyResult = await applyModerationResult(videoDocId, false);
    if (applyResult === 'not_ready') return false;
    await finishModerationJobDoc(jobRef, data, s3, bucket);
    return true;
  }

  const result = await pollRekognitionJob(rekognition, jobId);
  if (result.state === 'pending') return false;

  if (result.state === 'failed') {
    logger.error('Rekognition job FAILED — auto-approving', { videoDocId, message: result.message });
    const applyResult = await applyModerationResult(videoDocId, false);
    if (applyResult === 'not_ready') return false;
    await finishModerationJobDoc(jobRef, data, s3, bucket);
    return true;
  }

  const applyResult = await applyModerationResult(videoDocId, result.flagged);
  if (applyResult === 'not_ready') return false;
  await finishModerationJobDoc(jobRef, data, s3, bucket);
  return true;
}

/** Actively poll a single job (used right after upload) until Rekognition finishes or attempts exhaust. */
export async function pollModerationJobWithRetries(
  videoDocId: string,
  opts?: { maxAttempts?: number; intervalMs?: number }
): Promise<void> {
  const maxAttempts = opts?.maxAttempts ?? 18;
  const intervalMs = opts?.intervalMs ?? 10_000;
  const db = admin.firestore();
  const jobRef = db.doc(`${MODERATION_JOBS_COLLECTION}/${videoDocId}`);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const snap = await jobRef.get();
    if (!snap.exists) return;
    const data = snap.data() as Record<string, unknown>;
    const status = String(data.status ?? '');
    if (status === 'auto_approve_when_ready') {
      const done = await processAutoApproveWhenReadyJob(jobRef, data);
      if (done) return;
      await sleep(intervalMs);
      continue;
    }

    const clients = awsClients();
    if (!clients) return;
    if (status !== 'running') return;

    try {
      const done = await processOneModerationJobDoc(jobRef, data, clients);
      if (done) return;
    } catch (e) {
      logger.error('poll moderation job error', { videoDocId, attempt, e });
    }

    await sleep(intervalMs);
  }
}

/** Polls pending Rekognition jobs (scheduler backup; upload trigger does the fast path). */
export async function processPendingModerationJobs(limit = 15): Promise<void> {
  const db = admin.firestore();
  const fallbackSnap = await db
    .collection(MODERATION_JOBS_COLLECTION)
    .where('status', '==', 'auto_approve_when_ready')
    .limit(limit)
    .get();

  for (const doc of fallbackSnap.docs) {
    try {
      await processAutoApproveWhenReadyJob(doc.ref, doc.data() as Record<string, unknown>);
    } catch (e) {
      logger.error('auto-approve moderation job error', { videoDocId: doc.id, e });
    }
  }

  const clients = awsClients();
  if (!clients) {
    if (fallbackSnap.empty) {
      logger.error('pollVideoModerationJobs: missing AWS config');
    }
    return;
  }

  const snap = await db
    .collection(MODERATION_JOBS_COLLECTION)
    .where('status', '==', 'running')
    .limit(limit)
    .get();

  for (const doc of snap.docs) {
    try {
      await processOneModerationJobDoc(doc.ref, doc.data() as Record<string, unknown>, clients);
    } catch (e) {
      logger.error('poll moderation job error', { videoDocId: doc.id, e });
    }
  }
}
