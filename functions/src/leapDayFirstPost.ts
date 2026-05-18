import * as admin from 'firebase-admin';

import { isAwardedLeapVideo } from './verticalScoreEngine';
import { DAILY_CHALLENGE_STATS_COLLECTION } from './verticalXpBonuses';

const POST_COLLECTION = 'videos';

function toMillis(v: unknown): number {
  if (v && typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function dayKeyVariants(key: string): string[] {
  const out = new Set<string>([String(key ?? '').trim()]);
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(key ?? '').trim());
  if (m) {
    const pad = (n: string) => String(Number(n)).padStart(2, '0');
    out.add(`${m[1]}-${pad(m[2])}-${pad(m[3])}`);
    out.add(`${m[1]}-${Number(m[2])}-${Number(m[3])}`);
  }
  return [...out].filter(Boolean);
}

/** Canonical `YYYY-MM-DD` used as `dailyChallengeStats/{dayKey}` id. */
export function canonicalChallengeDayKey(challengeDate: string): string {
  const variants = dayKeyVariants(challengeDate);
  const padded = variants.find((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  return padded ?? variants[0] ?? String(challengeDate ?? '').trim();
}

/**
 * Within a transaction: claim global first approved leap for this challenge day, or return true if
 * this video already holds the slot.
 */
export function claimGlobalFirstPostOfDayInTransaction(args: {
  tx: admin.firestore.Transaction;
  statsRef: admin.firestore.DocumentReference;
  statsSnap: admin.firestore.DocumentSnapshot;
  videoId: string;
  ownerUid: string;
  challengeDate: string;
}): boolean {
  const { tx, statsRef, statsSnap, videoId, ownerUid, challengeDate } = args;
  const existingId = statsSnap.exists
    ? String((statsSnap.data() as Record<string, unknown>)?.firstApprovedVideoId ?? '').trim()
    : '';

  if (!existingId) {
    tx.set(statsRef, {
      challengeDate: canonicalChallengeDayKey(challengeDate),
      firstApprovedVideoId: videoId,
      firstApprovedUid: ownerUid,
      firstApprovedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  }
  return existingId === videoId;
}

/** Earliest awarded approved video for the day (stats doc, then query fallback). */
export async function resolveGlobalFirstApprovedVideoIdForDay(
  db: admin.firestore.Firestore,
  challengeDate: string
): Promise<string | null> {
  const dayKey = canonicalChallengeDayKey(challengeDate);
  const statsSnap = await db.doc(`${DAILY_CHALLENGE_STATS_COLLECTION}/${dayKey}`).get();
  if (statsSnap.exists) {
    const id = String((statsSnap.data() as Record<string, unknown>)?.firstApprovedVideoId ?? '').trim();
    if (id) return id;
  }

  const inKeys = dayKeyVariants(challengeDate).slice(0, 30);
  if (!inKeys.length) return null;

  const snap = await db
    .collection(POST_COLLECTION)
    .where('challengeDate', 'in', inKeys)
    .where('moderationStatus', '==', 'approved')
    .limit(120)
    .get();

  let bestId: string | null = null;
  let bestMs = Infinity;
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    if (data.deleted === true) continue;
    if (!isAwardedLeapVideo(data)) continue;
    const ms = toMillis(data.leapInchesAwardedAt ?? data.approvedAt ?? data.createdAt);
    if (ms > 0 && ms < bestMs) {
      bestMs = ms;
      bestId = d.id;
    }
  }
  return bestId;
}
