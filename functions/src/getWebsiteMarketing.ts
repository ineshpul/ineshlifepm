import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { REGION } from './callableOptions';
import { buildWebsiteMarketingPayload } from './websiteMarketingCore';

const ALLOWED_ORIGINS = [
  'https://taketheleap.app',
  'https://www.taketheleap.app',
  'http://localhost:3000',
];

export const getWebsiteMarketing = onRequest(
  {
    region: REGION,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      const payload = await buildWebsiteMarketingPayload(admin.firestore());
      res.set('Cache-Control', 'no-store');
      res.status(200).json(payload);
    } catch (e) {
      console.error('getWebsiteMarketing failed', e);
      res.status(500).json({ error: 'Could not load marketing data.' });
    }
  }
);
