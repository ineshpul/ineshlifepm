import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

import { sendExpoPushBatch } from './expoPush';
import { nyDateKeyFromMs } from './timeKeys';

const REGION = 'us-central1';
const USER_PAGE_SIZE = 200;

const BEST_PART_REMINDER_TITLE = 'New Update';
const BEST_PART_REMINDER_BODY = '';

function remindersEnabled(prefs: Record<string, unknown> | undefined): boolean {
  if (prefs?.notificationsEnabled === false) return false;
  if (prefs?.streakReminders === false) return false;
  return true;
}

function bestPartDocId(uid: string, dateKey: string): string {
  return `${uid}_${dateKey}`;
}

function userPostedBestPartToday(
  snap: admin.firestore.DocumentSnapshot,
  uid: string
): boolean {
  if (!snap.exists) return false;
  const data = snap.data() as Record<string, unknown>;
  if (String(data.uid ?? '') !== uid) return false;
  if (data.deleted === true) return false;
  return true;
}

async function sendBestPartNoonReminders(): Promise<void> {
  const db = admin.firestore();
  const dateKey = nyDateKeyFromMs(Date.now());

  const messages: Array<{
    to: string;
    title: string;
    body: string;
    sound: 'default';
    priority: 'high';
    data: Record<string, unknown>;
  }> = [];

  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  let scannedUsers = 0;
  let skippedPosted = 0;
  let skippedPrefs = 0;
  let skippedNoTokens = 0;

  while (true) {
    let q = db
      .collection('users')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(USER_PAGE_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const usersSnap = await q.get();
    if (usersSnap.empty) break;

    const userIds = usersSnap.docs.map((d) => d.id);
    scannedUsers += userIds.length;

    const bestPartRefs = userIds.map((uid) => db.doc(`bestParts/${bestPartDocId(uid, dateKey)}`));
    const bestPartSnaps = await db.getAll(...bestPartRefs);
    const postedUids = new Set<string>();
    bestPartSnaps.forEach((snap, idx) => {
      const uid = userIds[idx]!;
      if (userPostedBestPartToday(snap, uid)) postedUids.add(uid);
    });

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const prefs = userDoc.data() as Record<string, unknown>;
      if (!remindersEnabled(prefs)) {
        skippedPrefs += 1;
        continue;
      }
      if (postedUids.has(uid)) {
        skippedPosted += 1;
        continue;
      }

      const tokensSnap = await db.collection(`users/${uid}/pushDevices`).get();
      const tokens = [
        ...new Set(tokensSnap.docs.map((d) => String(d.data()?.token ?? '')).filter(Boolean)),
      ];
      if (!tokens.length) {
        skippedNoTokens += 1;
        continue;
      }

      for (const to of tokens) {
        messages.push({
          to,
          title: BEST_PART_REMINDER_TITLE,
          body: BEST_PART_REMINDER_BODY,
          sound: 'default',
          priority: 'high',
          data: { kind: 'best_part_reminder' },
        });
      }
    }

    lastDoc = usersSnap.docs[usersSnap.docs.length - 1];
    if (usersSnap.size < USER_PAGE_SIZE) break;
  }

  await sendExpoPushBatch(messages);

  logger.info('bestPartNoonReminders sent', {
    dateKey,
    scannedUsers,
    skippedPosted,
    skippedPrefs,
    skippedNoTokens,
    pushMessages: messages.length,
  });
}

const SCHEDULE_OPTS = {
  region: REGION,
  timeZone: 'America/New_York',
  memory: '512MiB' as const,
  timeoutSeconds: 540,
};

/** 11:20 AM ET — ~40 minutes before noon; skipped if user already posted today. */
export const scheduledBestPartNoonReminder = onSchedule(
  { ...SCHEDULE_OPTS, schedule: '20 11 * * *' },
  async () => {
    try {
      await sendBestPartNoonReminders();
    } catch (e) {
      logger.error('scheduledBestPartNoonReminder failed', e);
    }
  }
);
