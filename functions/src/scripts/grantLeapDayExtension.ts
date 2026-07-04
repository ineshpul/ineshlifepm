/**
 * Extend today's leap until midnight CT for specific users (streak posts for current viewing day).
 *
 *   $env:USER_UIDS = "uid1,uid2"
 *   npm run grant:leap-extension
 */

import * as admin from 'firebase-admin';

import { leapChallengeDateKeyFromMs } from '../timeKeys';

const DEFAULT_PROJECT =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  'leap-e4cce';

const CT_TIMEZONE = 'America/Chicago';

function ctCalendarPartsFromUtc(ms: number) {
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone: CT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(ms));
  const [date, time] = s.split(' ');
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return { y, mo, d, h, mi };
}

function utcMsForCtWallClock(y: number, mo: number, d: number, hh: number, mm: number): number {
  let t = Date.UTC(y, mo - 1, d, 18, 0, 0);
  for (let i = 0; i < 120; i++) {
    const cur = ctCalendarPartsFromUtc(t);
    if (cur.y === y && cur.mo === mo && cur.d === d && cur.h === hh && cur.mi === mm) {
      return t;
    }
    const targetMidnight = Date.UTC(y, mo - 1, d);
    const curMidnight = Date.UTC(cur.y, cur.mo - 1, cur.d);
    const dayDeltaMs = targetMidnight - curMidnight;
    const timeDeltaMs = ((hh - cur.h) * 60 + (mm - cur.mi)) * 60 * 1000;
    t += dayDeltaMs + timeDeltaMs;
  }
  return Date.now() + 60_000;
}

function nextCtCalendarDay(y: number, mo: number, d: number) {
  const t = utcMsForCtWallClock(y, mo, d, 12, 0) + 25 * 3600000;
  return ctCalendarPartsFromUtc(t);
}

function midnightCtAfterDateKey(dateKey: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey).trim());
  if (!m) return Date.now() + 3600000;
  const next = nextCtCalendarDay(Number(m[1]), Number(m[2]), Number(m[3]));
  return utcMsForCtWallClock(next.y, next.mo, next.d, 0, 0);
}

async function prepareLeapDay(
  db: admin.firestore.Firestore,
  uid: string,
  challengeDate: string
): Promise<void> {
  const attemptId = `${uid}_${challengeDate}`;
  const videoRef = db.doc(`videos/${attemptId}`);
  const videoSnap = await videoRef.get();
  if (videoSnap.exists) {
    const vd = videoSnap.data() as { uid?: string; url?: string; deleted?: boolean };
    if (!vd.url || vd.deleted === true || String(vd.uid ?? '') !== uid) {
      await videoRef.delete();
    }
  }

  const challengeSnap = await db.doc(`challenges/${challengeDate}`).get();
  const max = Math.min(
    50,
    Math.max(1, Math.round(Number(challengeSnap.data()?.maxRecordingAttempts ?? 3)) || 3)
  );

  await db.doc(`postAttempts/${attemptId}`).set(
    {
      uid,
      challengeDate,
      used: 0,
      max,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      bonusRecordingAttempts: admin.firestore.FieldValue.delete(),
      leapBaseReductionInches: admin.firestore.FieldValue.delete(),
    },
    { merge: true }
  );
}

async function main(): Promise<void> {
  const rawUids =
    String(process.env.USER_UIDS ?? '').trim() ||
    '1VwC2MVrEpcLxWYytr4z0BsIe7U2,is10Doy7zQYUeCi36P8gE1M3lZe2';
  const uids = rawUids
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  if (uids.length === 0) {
    console.error('Set USER_UIDS (comma-separated).');
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: DEFAULT_PROJECT });
  }
  const db = admin.firestore();

  const challengeDate = leapChallengeDateKeyFromMs(Date.now());
  const expiresAtMs = midnightCtAfterDateKey(challengeDate);

  const grantRef = db.doc('config/leapDayExtensions');
  const grantSnap = await grantRef.get();
  const byUid = { ...(grantSnap.data()?.byUid as Record<string, unknown> | undefined) };

  const results: Record<string, unknown>[] = [];

  for (const uid of uids) {
    await prepareLeapDay(db, uid, challengeDate);
    byUid[uid] = {
      challengeDate,
      expiresAtMs,
      grantedAtMs: Date.now(),
    };
    results.push({ uid, ok: true, challengeDate, expiresAtMs });
  }

  await grantRef.set({ byUid, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  // Clear stale catch-up grants so Record does not target yesterday.
  await db.doc('config/latePostGrants').set(
    { byUid: {}, clearedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        challengeDate,
        expiresAtMs,
        expiresAtCt: new Date(expiresAtMs).toLocaleString('en-US', { timeZone: CT_TIMEZONE }),
        results,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
