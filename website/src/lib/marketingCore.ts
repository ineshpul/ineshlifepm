import type * as admin from "firebase-admin";

import { isLeapLiveAtMs, nyDateKeyFromMs } from "./nyChallengeWindow";

export type MarketingPayload = {
  leapDayKey: string;
  isLive: boolean;
  leapTitle: string | null;
  postersCount: number;
  updatedAtMs: number;
};

export async function buildMarketingPayload(
  db: admin.firestore.Firestore,
  nowMs: number = Date.now(),
): Promise<MarketingPayload> {
  const leapDayKey = nyDateKeyFromMs(nowMs);
  const isLive = isLeapLiveAtMs(nowMs);

  if (!isLive) {
    return {
      leapDayKey,
      isLive: false,
      leapTitle: null,
      postersCount: 0,
      updatedAtMs: nowMs,
    };
  }

  const challengeSnap = await db.collection("challenges").doc(leapDayKey).get();
  const challengeTitle = String(challengeSnap.data()?.title ?? "").trim();

  let postersCount = 0;
  try {
    const agg = await db
      .collection("users")
      .where("leaperDayKey", "==", leapDayKey)
      .where("leaperDayPoints", ">", 0)
      .count()
      .get();
    postersCount = agg.data().count;
  } catch {
    try {
      const agg = await db
        .collection("users")
        .where("leaperDayKey", "==", leapDayKey)
        .count()
        .get();
      postersCount = agg.data().count;
    } catch {
      postersCount = 0;
    }
  }

  return {
    leapDayKey,
    isLive: true,
    leapTitle: challengeTitle || null,
    postersCount,
    updatedAtMs: nowMs,
  };
}

const DEFAULT_MARKETING_FUNCTION_URL =
  "https://us-central1-leap-e4cce.cloudfunctions.net/getWebsiteMarketing";

export async function fetchMarketingPayloadRemote(
  nowMs: number = Date.now(),
): Promise<MarketingPayload> {
  const base =
    process.env.WEBSITE_MARKETING_URL?.trim() || DEFAULT_MARKETING_FUNCTION_URL;
  const url = new URL(base);
  url.searchParams.set("_ts", String(nowMs));

  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const data = (await res.json()) as MarketingPayload & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "Could not load marketing data.");
  }
  return data;
}
