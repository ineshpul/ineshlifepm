import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

import { incrementUserLeapInches } from './leaperPoints';
import { nyDateKeyFromMs } from './timeKeys';

export const REFERRAL_ACTIVATION_BONUS_INCHES = 5;
export const REFERRAL_OVERRIDE_RATE = 0.1;
export const REFERRAL_OVERRIDE_WINDOW_DAYS = 7;

const REFERRALS_COLLECTION = 'referrals';
const REFERRAL_GRANTS_COLLECTION = 'referralGrants';

/** Matches client `usernameClaimDocId`. */
export function normalizeReferrerUsername(raw: string): string {
  let s = String(raw ?? '')
    .trim()
    .replace(/^@+/u, '')
    .toLowerCase();
  s = s.replace(/\s+/g, '_');
  s = s.replace(/[^a-z0-9_]/g, '_');
  s = s.replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!s) return '';
  return s.length > 40 ? s.slice(0, 40) : s;
}

function nyCalendarPartsFromUtc(ms: number) {
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/New_York',
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

function utcMsForNyWallClock(y: number, mo: number, d: number, hh: number, mm: number): number {
  let t = Date.UTC(y, mo - 1, d, 17, 0, 0);
  for (let i = 0; i < 120; i++) {
    const cur = nyCalendarPartsFromUtc(t);
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

function normalizeChallengeDateKey(raw: string): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(raw ?? '').trim());
  if (!m) return '';
  return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`;
}

function nextChallengeDateKey(key: string): string {
  const canon = normalizeChallengeDateKey(key);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(canon);
  if (!m) return canon;
  const t = utcMsForNyWallClock(Number(m[1]), Number(m[2]), Number(m[3]), 12, 0) + 25 * 3600000;
  return nyDateKeyFromMs(t);
}

function addChallengeDateKeys(startKey: string, count: number): string[] {
  const out: string[] = [];
  let cur = normalizeChallengeDateKey(startKey);
  if (!cur) return out;
  for (let i = 0; i < count; i++) {
    out.push(cur);
    cur = nextChallengeDateKey(cur);
  }
  return out;
}

function challengeDateInOverrideWindow(
  windowStart: string,
  windowEnd: string,
  challengeDate: string
): boolean {
  const day = normalizeChallengeDateKey(challengeDate);
  const start = normalizeChallengeDateKey(windowStart);
  const end = normalizeChallengeDateKey(windowEnd);
  if (!day || !start || !end) return false;
  return day >= start && day <= end;
}

export async function resolveReferrerUidByUsername(
  db: admin.firestore.Firestore,
  usernameRaw: string
): Promise<{ uid: string; usernameLower: string; username: string } | null> {
  const key = normalizeReferrerUsername(usernameRaw);
  if (!key) return null;
  const claimSnap = await db.doc(`usernameClaims/${key}`).get();
  if (!claimSnap.exists) return null;
  const referrerUid = String(claimSnap.data()?.uid ?? '').trim();
  if (!referrerUid) return null;
  const userSnap = await db.doc(`users/${referrerUid}`).get();
  const username = userSnap.exists
    ? String(userSnap.data()?.username ?? key).trim() || key
    : key;
  return { uid: referrerUid, usernameLower: key, username };
}

async function hasApprovedLeapOnDay(
  db: admin.firestore.Firestore,
  uid: string,
  challengeDate: string
): Promise<boolean> {
  const day = normalizeChallengeDateKey(challengeDate);
  if (!uid || !day) return false;
  const snap = await db.doc(`videos/${uid}_${day}`).get();
  if (!snap.exists) return false;
  const d = snap.data() ?? {};
  if (d.deleted === true) return false;
  return String(d.moderationStatus ?? '') === 'approved';
}

async function createReferrerNotification(args: {
  db: admin.firestore.Firestore;
  referrerUid: string;
  refereeUid: string;
  refereeUsername: string;
  type: 'referral_activation' | 'referral_override';
  snippet: string;
}): Promise<void> {
  const { db, referrerUid, refereeUid, refereeUsername, type, snippet } = args;
  if (!referrerUid || referrerUid === refereeUid) return;
  await db.collection(`users/${referrerUid}/notifications`).add({
    type,
    fromUid: refereeUid,
    fromUsername: refereeUsername,
    videoId: null,
    snippet,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function grantReferralInches(args: {
  db: admin.firestore.Firestore;
  referrerUid: string;
  inchDelta: number;
  challengeDayKey: string;
  grantId: string;
  grantType: 'activation' | 'override';
  refereeUid: string;
  refereeOrganicInches?: number;
}): Promise<boolean> {
  const {
    db,
    referrerUid,
    inchDelta,
    challengeDayKey,
    grantId,
    grantType,
    refereeUid,
    refereeOrganicInches,
  } = args;
  const inch = Math.round(Number(inchDelta ?? 0) * 10) / 10;
  if (!referrerUid || inch <= 0) return false;

  const grantRef = db.doc(`${REFERRAL_GRANTS_COLLECTION}/${grantId}`);
  const nowMs = Date.now();

  const granted = await db.runTransaction(async (tx) => {
    const existing = await tx.get(grantRef);
    if (existing.exists) return false;

    tx.set(grantRef, {
      type: grantType,
      referrerUid,
      refereeUid,
      leapDayKey: challengeDayKey,
      overrideInches: inch,
      refereeOrganicInches: refereeOrganicInches ?? null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return true;
  });

  if (!granted) return false;

  await incrementUserLeapInches(db, referrerUid, inch, challengeDayKey, nowMs, nowMs);
  return true;
}

async function ensureReferralDoc(args: {
  db: admin.firestore.Firestore;
  referrerUid: string;
  refereeUid: string;
  firstApprovedLeapDay: string;
}): Promise<admin.firestore.DocumentReference> {
  const { db, referrerUid, refereeUid, firstApprovedLeapDay } = args;
  const ref = db.doc(`${REFERRALS_COLLECTION}/${referrerUid}_${refereeUid}`);
  const windowDays = addChallengeDateKeys(firstApprovedLeapDay, REFERRAL_OVERRIDE_WINDOW_DAYS);
  const windowEnd = windowDays[windowDays.length - 1] ?? firstApprovedLeapDay;

  await ref.set(
    {
      referrerUid,
      refereeUid,
      overrideWindowStartLeapDay: firstApprovedLeapDay,
      overrideWindowEndLeapDay: windowEnd,
      activationBonusGranted: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return ref;
}

export async function maybeGrantReferralActivationBonus(args: {
  db: admin.firestore.Firestore;
  refereeUid: string;
  refereeUsername: string;
  firstApprovedLeapDay: string;
}): Promise<void> {
  const { db, refereeUid, refereeUsername, firstApprovedLeapDay } = args;
  const refereeSnap = await db.doc(`users/${refereeUid}`).get();
  if (!refereeSnap.exists) return;

  const refereeData = refereeSnap.data() ?? {};
  const referrerUid = String(refereeData.referredByUid ?? '').trim();
  if (!referrerUid || referrerUid === refereeUid) return;

  const referralRef = await ensureReferralDoc({
    db,
    referrerUid,
    refereeUid,
    firstApprovedLeapDay,
  });

  const granted = await db.runTransaction(async (tx) => {
    const refSnap = await tx.get(referralRef);
    if (!refSnap.exists) return false;
    if (refSnap.data()?.activationBonusGranted === true) return false;

    tx.set(
      referralRef,
      {
        activationBonusGranted: true,
        activationBonusGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
        firstApprovedLeapDay,
      },
      { merge: true }
    );
    return true;
  });

  if (!granted) return;

  const ok = await grantReferralInches({
    db,
    referrerUid,
    inchDelta: REFERRAL_ACTIVATION_BONUS_INCHES,
    challengeDayKey: firstApprovedLeapDay,
    grantId: `activation_${referrerUid}_${refereeUid}`,
    grantType: 'activation',
    refereeUid,
  });

  if (!ok) return;

  try {
    await createReferrerNotification({
      db,
      referrerUid,
      refereeUid,
      refereeUsername,
      type: 'referral_activation',
      snippet: `+${REFERRAL_ACTIVATION_BONUS_INCHES}″ — first leap complete`,
    });
  } catch (e) {
    logger.warn('referral activation notification failed', { referrerUid, refereeUid, e });
  }
}

export async function maybeGrantReferralDayOverride(args: {
  db: admin.firestore.Firestore;
  refereeUid: string;
  refereeUsername: string;
  challengeDate: string;
  organicInchesGranted: number;
}): Promise<void> {
  const { db, refereeUid, refereeUsername, challengeDate, organicInchesGranted } = args;
  const organic = Math.round(Number(organicInchesGranted ?? 0) * 10) / 10;
  if (organic <= 0) return;

  const refereeSnap = await db.doc(`users/${refereeUid}`).get();
  if (!refereeSnap.exists) return;

  const refereeData = refereeSnap.data() ?? {};
  const referrerUid = String(refereeData.referredByUid ?? '').trim();
  if (!referrerUid || referrerUid === refereeUid) return;

  const referralRef = db.doc(`${REFERRALS_COLLECTION}/${referrerUid}_${refereeUid}`);
  const referralSnap = await referralRef.get();
  if (!referralSnap.exists) return;

  const referral = referralSnap.data() ?? {};
  const windowStart = String(referral.overrideWindowStartLeapDay ?? '').trim();
  const windowEnd = String(referral.overrideWindowEndLeapDay ?? '').trim();
  if (!windowStart || !windowEnd) return;
  if (!challengeDateInOverrideWindow(windowStart, windowEnd, challengeDate)) return;

  const day = normalizeChallengeDateKey(challengeDate);
  const [refereePosted, referrerPosted] = await Promise.all([
    hasApprovedLeapOnDay(db, refereeUid, day),
    hasApprovedLeapOnDay(db, referrerUid, day),
  ]);
  if (!refereePosted || !referrerPosted) return;

  const overrideInches = Math.round(organic * REFERRAL_OVERRIDE_RATE * 10) / 10;
  if (overrideInches <= 0) return;

  const ok = await grantReferralInches({
    db,
    referrerUid,
    inchDelta: overrideInches,
    challengeDayKey: day,
    grantId: `override_${referrerUid}_${refereeUid}_${day}`,
    grantType: 'override',
    refereeUid,
    refereeOrganicInches: organic,
  });

  if (!ok) return;

  try {
    await createReferrerNotification({
      db,
      referrerUid,
      refereeUid,
      refereeUsername,
      type: 'referral_override',
      snippet: `+${overrideInches}″ — you both leaped today`,
    });
  } catch (e) {
    logger.warn('referral override notification failed', { referrerUid, refereeUid, e });
  }
}

export async function processReferralRewardsOnApproval(args: {
  db: admin.firestore.Firestore;
  refereeUid: string;
  refereeUsername: string;
  challengeDate: string;
  organicInchesGranted: number;
  isFirstApprovedLeap: boolean;
}): Promise<void> {
  const day = normalizeChallengeDateKey(args.challengeDate);
  if (!day) return;

  if (args.isFirstApprovedLeap) {
    try {
      await maybeGrantReferralActivationBonus({
        db: args.db,
        refereeUid: args.refereeUid,
        refereeUsername: args.refereeUsername,
        firstApprovedLeapDay: day,
      });
    } catch (e) {
      logger.error('referral activation bonus failed', {
        refereeUid: args.refereeUid,
        challengeDate: day,
        e,
      });
    }
  }

  try {
    await maybeGrantReferralDayOverride({
      db: args.db,
      refereeUid: args.refereeUid,
      refereeUsername: args.refereeUsername,
      challengeDate: day,
      organicInchesGranted: args.organicInchesGranted,
    });
  } catch (e) {
    logger.error('referral day override failed', {
      refereeUid: args.refereeUid,
      challengeDate: day,
      e,
    });
  }
}
