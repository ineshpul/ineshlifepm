import type * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

import { isAwardedLeapVideo, leapInchesFromVideo } from './verticalScoreEngine';
import {
  challengeDateBelongsToWeek,
  getCurrentWeekKey,
  getPriorWeekKey,
  normalizeWeekKey,
} from './getCurrentWeekKey';

const POST_COLLECTION = 'videos';
const PAGE = 500;

async function sumApprovedLeapInchesForOwner(
  db: admin.firestore.Firestore,
  ownerId: string,
  weekKey: string
): Promise<number> {
  let total = 0;
  let last: admin.firestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db
      .collection(POST_COLLECTION)
      .where('uid', '==', ownerId)
      .orderBy('createdAt', 'desc')
      .limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (data.deleted === true) continue;
      if (String(data.moderationStatus ?? '') !== 'approved') continue;
      if (!isAwardedLeapVideo(data)) continue;
      const cd = String(data.challengeDate ?? '').trim();
      if (!challengeDateBelongsToWeek(cd, weekKey)) continue;
      total += leapInchesFromVideo(data);
    }
    if (snap.size < PAGE) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return Math.round(total * 10) / 10;
}

export type WeeklyLeaperFieldsPatch = {
  leaperWeekKey: string;
  leaperWeekPoints: number;
  leaperPriorWeekKey: string;
  leaperPriorWeekPoints: number;
};

/** Recompute weekly leaperboard fields from approved videos (Sunday noon ET week window). */
export async function recomputeUserWeeklyLeaperFields(
  db: admin.firestore.Firestore,
  ownerId: string,
  nowMs = Date.now()
): Promise<WeeklyLeaperFieldsPatch> {
  const weekKey = getCurrentWeekKey(new Date(nowMs));
  const priorWeekKey = getPriorWeekKey(weekKey) ?? '';

  const weekPoints = await sumApprovedLeapInchesForOwner(db, ownerId, weekKey);
  const priorWeekPoints = priorWeekKey
    ? await sumApprovedLeapInchesForOwner(db, ownerId, priorWeekKey)
    : 0;

  return {
    leaperWeekKey: normalizeWeekKey(weekKey),
    leaperWeekPoints: weekPoints,
    leaperPriorWeekKey: normalizeWeekKey(priorWeekKey),
    leaperPriorWeekPoints: priorWeekPoints,
  };
}

export async function writeUserWeeklyLeaperFields(
  db: admin.firestore.Firestore,
  ownerId: string,
  nowMs = Date.now()
): Promise<WeeklyLeaperFieldsPatch> {
  const patch = await recomputeUserWeeklyLeaperFields(db, ownerId, nowMs);
  await db.doc(`users/${ownerId}`).set(patch, { merge: true });
  return patch;
}
