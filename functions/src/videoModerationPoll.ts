import { onSchedule } from 'firebase-functions/v2/scheduler';

import { awsModerationSecrets } from './awsSecrets';
import { processPendingModerationJobs } from './videoModerationCore';

/** Poll Rekognition for in-flight moderation jobs (cheap vs holding 1 GiB on the upload function). */
export const pollVideoModerationJobs = onSchedule(
  {
    schedule: '*/3 * * * *',
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
