import * as admin from 'firebase-admin';

import { adminRetotalAwardedVideoXp, recomputeVerticalScoreAdmin } from './verticalScoreRecompute';
import {
  DAILY_CHALLENGE_STATS_COLLECTION,
  FIRST_LEAP_BONUS_XP,
  FIRST_POST_OF_DAY_BONUS_XP,
} from './verticalXpBonuses';
import { leapChallengeDateKeyFromMs, nyDateKeyFromMs } from './timeKeys';

const POST_COLLECTION = 'videos';

/** Earliest `createdAt` among awarded+approved posts for this user (paginated). */
export async function findEarliestAwardedApprovedVideoId(
  db: admin.firestore.Firestore,
  uid: string
): Promise<string | null> {
  let last: admin.firestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db
      .collection(POST_COLLECTION)
      .where('uid', '==', uid)
      .orderBy('createdAt', 'asc')
      .limit(120);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      const x = d.data() as Record<string, unknown>;
      if (String(x.moderationStatus ?? '') !== 'approved') continue;
      if (x.awardedVerticalXP !== true) continue;
      return d.id;
    }
    if (snap.size < 120) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return null;
}

/** Globally earliest awarded+approved post for `challengeDate` (by `createdAt`). */
export async function findFirstPostOfDayWinnerId(
  db: admin.firestore.Firestore,
  dayKey: string
): Promise<string | null> {
  const key = String(dayKey ?? '').trim();
  if (!key) return null;
  const snap = await db
    .collection(POST_COLLECTION)
    .where('challengeDate', '==', key)
    .where('moderationStatus', '==', 'approved')
    .where('awardedVerticalXP', '==', true)
    .orderBy('createdAt', 'asc')
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0]!.id;
}

export function defaultDayKeysForBonusBackfill(nowMs: number, spanDays: number): string[] {
  const keys = new Set<string>();
  const span = Math.min(Math.max(spanDays, 1), 120);
  for (let i = 0; i < span; i++) {
    const ms = nowMs - i * 86400000;
    keys.add(leapChallengeDateKeyFromMs(ms));
    keys.add(nyDateKeyFromMs(ms));
  }
  return [...keys];
}

export async function runBackfillFirstLeapBonusesUserPage(
  db: admin.firestore.Firestore,
  opts: { cursorUid: string; pageSize: number; dryRun: boolean }
): Promise<{ processed: number; nextCursorUid: string | null; done: boolean; failedUids: string[] }> {
  const pageSize = Math.min(Math.max(opts.pageSize || 25, 1), 60);
  let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
  if (opts.cursorUid) {
    const cur = await db.doc(`users/${opts.cursorUid}`).get();
    if (cur.exists) q = q.startAfter(cur);
  }
  const snap = await q.get();
  const failedUids: string[] = [];
  let processed = 0;

  for (const udoc of snap.docs) {
    const uid = udoc.id;
    try {
      const vid = await findEarliestAwardedApprovedVideoId(db, uid);
      if (!vid) {
        processed += 1;
        continue;
      }
      const vs = await db.doc(`${POST_COLLECTION}/${vid}`).get();
      const vd = vs.data() as Record<string, unknown> | undefined;
      const curFl = Math.max(0, Math.round(Number(vd?.firstLeapBonusXP ?? 0)));
      if (!opts.dryRun) {
        if (curFl < FIRST_LEAP_BONUS_XP) {
          await adminRetotalAwardedVideoXp(db, vid, { forcedFirstLeap: FIRST_LEAP_BONUS_XP });
          await recomputeVerticalScoreAdmin(uid);
        }
        await db.doc(`users/${uid}`).set({ hasReceivedFirstLeapBonus: true }, { merge: true });
      }
      processed += 1;
    } catch {
      failedUids.push(uid);
    }
  }

  const lastUid = snap.empty ? null : snap.docs[snap.docs.length - 1]?.id ?? null;
  return { processed, nextCursorUid: lastUid, done: snap.size < pageSize, failedUids };
}

export async function runBackfillFirstPostOfDayForDayKeys(
  db: admin.firestore.Firestore,
  dayKeys: string[],
  opts: { dryRun: boolean; overwriteStats: boolean }
): Promise<{ daysProcessed: number; details: { dayKey: string; winnerId: string | null; skipped?: boolean }[] }> {
  const details: { dayKey: string; winnerId: string | null; skipped?: boolean }[] = [];
  let daysProcessed = 0;
  const uniq = [...new Set(dayKeys.map((k) => String(k ?? '').trim()).filter(Boolean))];

  for (const dayKey of uniq) {
    const winnerId = await findFirstPostOfDayWinnerId(db, dayKey);
    if (!winnerId) {
      details.push({ dayKey, winnerId: null });
      daysProcessed += 1;
      continue;
    }
    const statsRef = db.doc(`${DAILY_CHALLENGE_STATS_COLLECTION}/${dayKey}`);
    const st = await statsRef.get();
    const existing = String(st.data()?.firstPostBonusAwardedPostId ?? '').trim();
    if (existing && existing !== winnerId && !opts.overwriteStats) {
      details.push({ dayKey, winnerId: winnerId, skipped: true });
      daysProcessed += 1;
      continue;
    }
    const vSnap = await db.doc(`${POST_COLLECTION}/${winnerId}`).get();
    const owner = String(vSnap.data()?.uid ?? '').trim();
    if (!opts.dryRun) {
      if (!existing || opts.overwriteStats || existing === winnerId) {
        await statsRef.set(
          {
            firstPostBonusAwardedPostId: winnerId,
            firstPostBonusAwardedUserId: owner,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      await adminRetotalAwardedVideoXp(db, winnerId, { forcedFirstPost: FIRST_POST_OF_DAY_BONUS_XP });
      if (owner) await recomputeVerticalScoreAdmin(owner);
    }
    details.push({ dayKey, winnerId });
    daysProcessed += 1;
  }

  return { daysProcessed, details };
}
