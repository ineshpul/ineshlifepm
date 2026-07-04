import * as admin from "firebase-admin";

import {
  buildMarketingPayload,
  fetchMarketingPayloadRemote,
  type MarketingPayload,
} from "./marketingCore";

function readServiceAccountJson(): string | null {
  const direct = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (direct) return direct;

  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_B64?.trim();
  if (!b64) return null;

  try {
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function initFirebaseAdmin() {
  if (admin.apps.length > 0) return;

  const raw = readServiceAccountJson();
  if (!raw) {
    throw new Error(
      "Missing FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_JSON_B64",
    );
  }

  const creds = JSON.parse(raw) as admin.ServiceAccount;
  admin.initializeApp({
    credential: admin.credential.cert(creds),
  });
}

export async function getMarketing(): Promise<MarketingPayload> {
  try {
    initFirebaseAdmin();
    return await buildMarketingPayload(admin.firestore());
  } catch (adminErr) {
    console.warn(
      "Marketing: Firebase Admin unavailable, using Cloud Function fallback",
      adminErr,
    );
    return fetchMarketingPayloadRemote();
  }
}
