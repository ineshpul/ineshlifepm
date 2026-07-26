import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

import { countApprovedVideosForDay } from './dailyChallengeStatsPosts';
import { sendExpoPushBatch } from './expoPush';
import { getDayKey, leapDayKeyFromStoredChallengeDate } from './leapDayKey';
import { DAILY_CHALLENGE_STATS_COLLECTION } from './verticalXpBonuses';

const REGION = 'us-central1';
const NOTIFICATION_PROMPT_MAX = 150;
const USER_PAGE_SIZE = 200;

type ReminderKind = 'noon' | 'afternoon' | 'streak';

function truncateForNotification(text: string, max = NOTIFICATION_PROMPT_MAX): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function remindersEnabled(prefs: Record<string, unknown> | undefined): boolean {
  if (prefs?.notificationsEnabled === false) return false;
  if (prefs?.streakReminders === false) return false;
  return true;
}

async function resolveChallengePrompt(
  db: admin.firestore.Firestore,
  dateKey: string
): Promise<string | null> {
  const snap = await db.doc(`challenges/${dateKey}`).get();
  if (!snap.exists) return null;
  const title = String(snap.data()?.title ?? '').trim();
  return title || null;
}

function buildReminderContent(
  kind: ReminderKind,
  prompt: string | null,
  postedCount: number
): { title: string; body: string } {
  if (kind === 'noon') {
    return {
      title: 'Today’s Leap is live',
      body: prompt
        ? truncateForNotification(prompt)
        : 'Open Leap and post before midnight.',
    };
  }
  if (kind === 'afternoon') {
    const body =
      postedCount <= 0
        ? 'Be the first to take today’s leap.'
        : postedCount === 1
          ? 'Join 1 person who posted and take today’s leap.'
          : `Join ${postedCount} people who posted and take today’s leap.`;
    return { title: 'People are leaping', body };
  }
  const base = prompt
    ? `${truncateForNotification(prompt)} — You still have time to post today.`
    : 'You still have time to post today’s challenge.';
  return { title: 'Don’t lose your streak', body: base };
}

function todayVideoDocId(uid: string, challengeDate: string): string {
  return `${uid}_${challengeDate}`;
}

function coLeapCreditVideoDocId(uid: string, challengeDate: string): string {
  return `${uid}_${challengeDate}_coleap`;
}

/** Prefer submission count on stats; fall back to live approved query. */
async function countPeoplePostedForDay(
  db: admin.firestore.Firestore,
  dayKey: string
): Promise<number> {
  const statsKey = leapDayKeyFromStoredChallengeDate(dayKey);
  try {
    const snap = await db.doc(`${DAILY_CHALLENGE_STATS_COLLECTION}/${statsKey}`).get();
    if (snap.exists) {
      const data = snap.data() as Record<string, unknown>;
      const posted = Number(data.postedPostCount);
      if (Number.isFinite(posted) && posted >= 0) return posted;
      const approved = Number(data.approvedPostCount);
      if (Number.isFinite(approved) && approved >= 0) return approved;
    }
  } catch (e) {
    logger.warn('posted count stats read failed', { dayKey, e });
  }
  return countApprovedVideosForDay(db, dayKey);
}

function userHasPostedVideo(
  snap: admin.firestore.DocumentSnapshot,
  uid: string
): boolean {
  if (!snap.exists) return false;
  const data = snap.data() as Record<string, unknown>;
  if (String(data.uid ?? '') !== uid) return false;
  if (data.deleted === true) return false;
  return true;
}

async function sendLeapDailyReminders(kind: ReminderKind): Promise<void> {
  const db = admin.firestore();
  const now = Date.now();
  const viewingChallengeDateKey = getDayKey('America/New_York', now);

  const [prompt, postedCount] = await Promise.all([
    kind === 'afternoon' ? Promise.resolve(null) : resolveChallengePrompt(db, viewingChallengeDateKey),
    kind === 'afternoon'
      ? countPeoplePostedForDay(db, viewingChallengeDateKey)
      : Promise.resolve(0),
  ]);

  const content = buildReminderContent(kind, prompt, postedCount);
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

    const soloRefs = userIds.map((uid) =>
      db.doc(`videos/${todayVideoDocId(uid, viewingChallengeDateKey)}`)
    );
    const creditRefs = userIds.map((uid) =>
      db.doc(`videos/${coLeapCreditVideoDocId(uid, viewingChallengeDateKey)}`)
    );
    const videoSnaps = await db.getAll(...soloRefs, ...creditRefs);
    const postedUids = new Set<string>();
    videoSnaps.forEach((snap, idx) => {
      const uid = userIds[idx % userIds.length];
      if (userHasPostedVideo(snap, uid)) postedUids.add(uid);
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
          title: content.title,
          body: content.body,
          sound: 'default',
          priority: 'high',
          data: { kind: 'leap_reminder', reminderKind: kind },
        });
      }
    }

    lastDoc = usersSnap.docs[usersSnap.docs.length - 1];
    if (usersSnap.size < USER_PAGE_SIZE) break;
  }

  await sendExpoPushBatch(messages);

  logger.info('leapDailyReminders sent', {
    kind,
    viewingChallengeDateKey,
    postedCount: kind === 'afternoon' ? postedCount : null,
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

/** Noon ET — today’s challenge is live. */
export const scheduledLeapNoonReminder = onSchedule(
  { ...SCHEDULE_OPTS, schedule: '0 12 * * *' },
  async () => {
    try {
      await sendLeapDailyReminders('noon');
    } catch (e) {
      logger.error('scheduledLeapNoonReminder failed', e);
    }
  }
);

/** 4 PM ET — how many people have posted (count resolved at send time). */
export const scheduledLeapAfternoonReminder = onSchedule(
  { ...SCHEDULE_OPTS, schedule: '0 16 * * *' },
  async () => {
    try {
      await sendLeapDailyReminders('afternoon');
    } catch (e) {
      logger.error('scheduledLeapAfternoonReminder failed', e);
    }
  }
);

/** 10:30 PM ET — streak nudge; skipped when the user already posted today. */
export const scheduledLeapStreakReminder = onSchedule(
  { ...SCHEDULE_OPTS, schedule: '30 22 * * *' },
  async () => {
    try {
      await sendLeapDailyReminders('streak');
    } catch (e) {
      logger.error('scheduledLeapStreakReminder failed', e);
    }
  }
);
