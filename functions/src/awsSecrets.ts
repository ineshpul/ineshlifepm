import { defineSecret } from 'firebase-functions/params';

/**
 * AWS credentials for Rekognition video moderation (S3 staging bucket).
 *
 *   firebase functions:secrets:set AWS_ACCESS_KEY_ID
 *   firebase functions:secrets:set AWS_SECRET_ACCESS_KEY
 *
 * Non-secret config can stay as function env: AWS_REGION, AWS_MODERATION_BUCKET.
 */
export const awsAccessKeyId = defineSecret('AWS_ACCESS_KEY_ID');
export const awsSecretAccessKey = defineSecret('AWS_SECRET_ACCESS_KEY');

export const awsModerationSecrets = [awsAccessKeyId, awsSecretAccessKey] as const;
