import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { awsModerationSecrets } from './awsSecrets';
import {
  MODERATION_JOBS_COLLECTION,
  pollModerationJobWithRetries,
  processPendingModerationJobs,
} from './videoModerationCore';

/** Poll Rekognition immediately after a job is queued (fast auto-approve path). */
export const onModerationJobCreated = onDocumentCreated(
  {
    document: `${MODERATION_JOBS_COLLECTION}/{videoDocId}`,
    region: 'us-east1',
    memory: '256MiB',
    timeoutSeconds: 300,
    secrets: [...awsModerationSecrets],
  },
  async (event) => {
    const videoDocId = String(event.params.videoDocId ?? '');
    if (!videoDocId) return;
    await pollModerationJobWithRetries(videoDocId);
  }
);

/** Backup poll for in-flight moderation jobs. */
export const pollVideoModerationJobs = onSchedule(
  {
    schedule: '*/1 * * * *',
    region: 'us-east1',
    timeZone: 'America/New_York',
    memory: '256MiB',
    timeoutSeconds: 120,
    secrets: [...awsModerationSecrets],
  },
  async () => {
    await processPendingModerationJobs(20);
  }
);
