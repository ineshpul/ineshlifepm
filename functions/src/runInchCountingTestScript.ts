/**
 * End-to-end inch / streak verification against deployed Cloud Function triggers.
 *
 * Writes Firestore docs the same way the client does, then polls until triggers settle
 * and prints PASS/FAIL per step.
 *
 * Prerequisites:
 *   cd functions && npm run build
 *   GOOGLE_APPLICATION_CREDENTIALS=... or gcloud auth application-default login
 *   Functions deployed (onVerticalScoreVideoCreated, onVerticalScoreVideoApprovedLeaper,
 *   onVideoLikeCreated, onVideoLikeDeleted, onVerticalScoreVideoDeleted)
 *
 * Usage:
 *   TEST_UID=<firebase-uid> npm run test:inches
 *
 * Optional env:
 *   TEST_LIKER_UID=<other-uid>   — non-owner liker (defaults: first other user in Firestore)
 *   TEST_CHALLENGE_DATE=2099-12-01 — isolated leap day (default 2099-12-01)
 *   DRY_RUN=1                    — print plan only; no writes
 *   SKIP_CLEANUP=1               — run test but skip restore at end
 *   POLL_MS=2000                   — poll interval (default 2000)
 *   POLL_MAX_MS=90000              — max wait per step (default 90000)
 */

import * as admin from 'firebase-admin';

import { DAILY_CHALLENGE_STATS_COLLECTION } from './verticalXpBonuses';
import { leapDayKeyFromStoredChallengeDate } from './leapDayKey';
import {
  computePostLeapInches,
  isAwardedLeapVideo,
  leapInchesFromVideo,
} from './verticalScoreEngine';
import { updateStreakState } from './verticalScoreStreak';

const DEFAULT_PROJECT =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  'leap-e4cce';

const POST_COLLECTION = 'videos';
const DEFAULT_TEST_CHALLENGE_DATE = '2099-12-01';

const DRY_RUN = String(process.env.DRY_RUN ?? '1').trim() !== '0';
const SKIP_CLEANUP = String(process.env.SKIP_CLEANUP ?? '0').trim() === '1';
const POLL_MS = Math.max(500, Number(process.env.POLL_MS ?? 2000));
const POLL_MAX_MS = Math.max(POLL_MS, Number(process.env.POLL_MAX_MS ?? 90_000));

type UserSnapshot = {
  leaperLifetimePoints: number;
  leaperDayKey: string;
  leaperDayPoints: number;
  leaperWeekKey: string;
  leaperWeekPoints: number;
  leaperPriorWeekKey: string;
  leaperPriorWeekPoints: number;
  activeLeapStreakDays: number;
  longestLeapStreakDays: number;
  lastApprovedLeapDateKey: string;
  hasApprovedLeapEver: boolean;
};

type StepResult = { name: string; pass: boolean; detail: string };

const results: StepResult[] = [];

function round10(n: number): number {
  return Math.round(n * 10) / 10;
}

function near(a: number, b: number, eps = 0.05): boolean {
  return Math.abs(round10(a) - round10(b)) <= eps;
}

function passFail(name: string, ok: boolean, detail: string): void {
  results.push({ name, pass: ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}`);
  console.log(`       ${detail}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(
  label: string,
  fn: () => Promise<boolean>,
  opts?: { maxMs?: number; intervalMs?: number }
): Promise<boolean> {
  const maxMs = opts?.maxMs ?? POLL_MAX_MS;
  const intervalMs = opts?.intervalMs ?? POLL_MS;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await fn()) return true;
    await sleep(intervalMs);
  }
  console.log(`       (timeout waiting: ${label}, ${maxMs}ms)`);
  return false;
}

function snapshotUser(data: Record<string, unknown> | undefined): UserSnapshot {
  const d = data ?? {};
  return {
    leaperLifetimePoints: Math.max(0, Number(d.leaperLifetimePoints ?? 0)),
    leaperDayKey: String(d.leaperDayKey ?? ''),
    leaperDayPoints: Math.max(0, Number(d.leaperDayPoints ?? 0)),
    leaperWeekKey: String(d.leaperWeekKey ?? ''),
    leaperWeekPoints: Math.max(0, Number(d.leaperWeekPoints ?? 0)),
    leaperPriorWeekKey: String(d.leaperPriorWeekKey ?? ''),
    leaperPriorWeekPoints: Math.max(0, Number(d.leaperPriorWeekPoints ?? 0)),
    activeLeapStreakDays: Math.max(0, Math.floor(Number(d.activeLeapStreakDays ?? 0))),
    longestLeapStreakDays: Math.max(0, Math.floor(Number(d.longestLeapStreakDays ?? 0))),
    lastApprovedLeapDateKey: String(d.lastApprovedLeapDateKey ?? '').trim(),
    hasApprovedLeapEver: d.hasApprovedLeapEver === true,
  };
}

async function readUser(db: admin.firestore.Firestore, uid: string): Promise<UserSnapshot> {
  const snap = await db.doc(`users/${uid}`).get();
  return snapshotUser(snap.data() as Record<string, unknown> | undefined);
}

async function pickLikerUid(
  db: admin.firestore.Firestore,
  ownerUid: string
): Promise<string> {
  const fromEnv = String(process.env.TEST_LIKER_UID ?? '').trim();
  if (fromEnv && fromEnv !== ownerUid) return fromEnv;

  const snap = await db.collection('users').limit(25).get();
  for (const d of snap.docs) {
    if (d.id !== ownerUid) return d.id;
  }
  throw new Error('TEST_LIKER_UID required — no other user found in Firestore');
}

function expectedPostInches(userBefore: UserSnapshot, priorStreak: number): number {
  const br = computePostLeapInches({
    streakDays: priorStreak,
    isFirstEverLeap: !userBefore.hasApprovedLeapEver,
    isFirstPostOfDay: false,
    baseInchesReduction: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0,
  });
  return br.leapInches;
}

function expectedStreakAfterApprove(
  userAtPost: UserSnapshot,
  challengeDate: string
): { activeLeapStreakDays: number; longestLeapStreakDays: number } {
  return updateStreakState({
    lastApprovedLeapDateKey: userAtPost.lastApprovedLeapDateKey,
    newApprovedLeapDayKey: challengeDate,
    priorActiveStreak: userAtPost.activeLeapStreakDays,
    priorLongest: userAtPost.longestLeapStreakDays,
  });
}

function buildClientVideoPayload(args: {
  uid: string;
  username: string;
  challengeDate: string;
}): Record<string, unknown> {
  const { uid, challengeDate } = args;
  const username = String(args.username ?? 'user').trim() || 'user';
  return {
    uid,
    username,
    challengeDate,
    challengeTitle: 'Inch counting integration test',
    challengeSubtitle: 'Automated trigger verification',
    prompt: 'Inch counting integration test',
    maxDurationSeconds: 60,
    source: 'integration-test',
    url: 'https://example.com/leap-inch-test.mp4',
    storagePath: `videos/${uid}/${challengeDate}/inch-test.mp4`,
    moderationStatus: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    viewCount: 0,
    likesCount: 0,
    commentsCount: 0,
    shareCount: 0,
    saveCount: 0,
    reportCount: 0,
    deleted: false,
    challengeCompleted: true,
  };
}

async function deleteTestArtifacts(args: {
  db: admin.firestore.Firestore;
  videoId: string;
  likerUid: string;
}): Promise<void> {
  const { db, videoId, likerUid } = args;
  await db.doc(`${POST_COLLECTION}/${videoId}/likes/${likerUid}`).delete().catch(() => {});
  await db.doc(`${POST_COLLECTION}/${videoId}`).delete().catch(() => {});
}

async function restoreUser(
  db: admin.firestore.Firestore,
  uid: string,
  snap: UserSnapshot
): Promise<void> {
  await db.doc(`users/${uid}`).set(
    {
      leaperLifetimePoints: snap.leaperLifetimePoints,
      leaperDayKey: snap.leaperDayKey || admin.firestore.FieldValue.delete(),
      leaperDayPoints: snap.leaperDayPoints,
      leaperWeekKey: snap.leaperWeekKey || admin.firestore.FieldValue.delete(),
      leaperWeekPoints: snap.leaperWeekPoints,
      leaperPriorWeekKey: snap.leaperPriorWeekKey || admin.firestore.FieldValue.delete(),
      leaperPriorWeekPoints: snap.leaperPriorWeekPoints,
      activeLeapStreakDays: snap.activeLeapStreakDays,
      longestLeapStreakDays: snap.longestLeapStreakDays,
      lastApprovedLeapDateKey: snap.lastApprovedLeapDateKey || admin.firestore.FieldValue.delete(),
      hasApprovedLeapEver: snap.hasApprovedLeapEver,
    },
    { merge: true }
  );
}

async function main(): Promise<void> {
  const testUid = String(process.env.TEST_UID ?? '').trim();
  if (!testUid) {
    console.error('Set TEST_UID to a dedicated test Firebase Auth uid.');
    process.exit(1);
  }

  const challengeDate =
    String(process.env.TEST_CHALLENGE_DATE ?? '').trim() || DEFAULT_TEST_CHALLENGE_DATE;
  const videoId = `${testUid}_${challengeDate}`;
  const dayStatsKey = leapDayKeyFromStoredChallengeDate(challengeDate);

  console.log('=== Leap inch / streak integration test ===');
  console.log(`project: ${DEFAULT_PROJECT}`);
  console.log(`TEST_UID: ${testUid}`);
  console.log(`challengeDate: ${challengeDate}`);
  console.log(`videoId: ${videoId}`);
  console.log(`DRY_RUN: ${DRY_RUN}`);
  console.log(`SKIP_CLEANUP: ${SKIP_CLEANUP}`);
  console.log('');

  if (DRY_RUN) {
    console.log('DRY_RUN=1 — no Firestore writes. Re-run with DRY_RUN=0 to execute.');
    console.log('Steps: POST → APPROVE → LIKE → REVOKE → CLEANUP');
    process.exit(0);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: DEFAULT_PROJECT });
  }
  const db = admin.firestore();

  const userSnap = await db.doc(`users/${testUid}`).get();
  if (!userSnap.exists) {
    console.error(`users/${testUid} not found.`);
    process.exit(1);
  }
  const username = String(userSnap.data()?.username ?? 'inch-test-user').trim() || 'inch-test-user';
  const likerUid = await pickLikerUid(db, testUid);

  const baseline = await readUser(db, testUid);
  const dayStatsRef = db.doc(`${DAILY_CHALLENGE_STATS_COLLECTION}/${dayStatsKey}`);
  const dayStatsBefore = (await dayStatsRef.get()).data() as Record<string, unknown> | undefined;

  console.log(`likerUid: ${likerUid}`);
  console.log(
    `baseline lifetime=${baseline.leaperLifetimePoints} streak=${baseline.activeLeapStreakDays} hasEver=${baseline.hasApprovedLeapEver}`
  );
  console.log('');

  // Prep: remove stale test artifacts from a prior failed run.
  await deleteTestArtifacts({ db, videoId, likerUid });

  const videoRef = db.doc(`${POST_COLLECTION}/${videoId}`);
  const userRef = db.doc(`users/${testUid}`);

  let lifetimeAfterPost = baseline.leaperLifetimePoints;
  let lifetimeAfterApprove = baseline.leaperLifetimePoints;
  let lifetimeAfterLike = baseline.leaperLifetimePoints;
  let videoInchesBeforeReject = 0;
  let expectedPostDelta = 0;
  let userAtPost = baseline;

  try {
    // ── 1. POST (pending create) ─────────────────────────────────────────────
    console.log('--- Step 1: POST (pending video create) ---');
    const beforePost = await readUser(db, testUid);
    const priorStreak = beforePost.activeLeapStreakDays;
    expectedPostDelta = expectedPostInches(beforePost, priorStreak);

    await videoRef.set(buildClientVideoPayload({ uid: testUid, username, challengeDate }));

    const postSettled = await waitFor('pending award', async () => {
      const [v, u] = await Promise.all([videoRef.get(), userRef.get()]);
      const vd = v.data() as Record<string, unknown> | undefined;
      const ud = snapshotUser(u.data() as Record<string, unknown> | undefined);
      return (
        Boolean(vd) &&
        isAwardedLeapVideo(vd) &&
        vd?.leapInchesPendingApproval === true &&
        String(vd?.moderationStatus ?? '') === 'pending' &&
        ud.leaperLifetimePoints > beforePost.leaperLifetimePoints
      );
    });

    const afterPostUser = await readUser(db, testUid);
    const afterPostVideo = (await videoRef.get()).data() as Record<string, unknown> | undefined;
    lifetimeAfterPost = afterPostUser.leaperLifetimePoints;
    userAtPost = beforePost;

    const postDelta = round10(lifetimeAfterPost - beforePost.leaperLifetimePoints);
    const videoInchesPost = leapInchesFromVideo(afterPostVideo);

    passFail(
      'POST: trigger settled',
      postSettled,
      `leapInchesAwarded=${String(afterPostVideo?.leapInchesAwarded)} pendingApproval=${String(afterPostVideo?.leapInchesPendingApproval)}`
    );
    passFail(
      'POST: lifetime delta',
      near(postDelta, expectedPostDelta),
      `lifetime ${beforePost.leaperLifetimePoints} → ${lifetimeAfterPost} (Δ ${postDelta}); expected Δ ${expectedPostDelta}`
    );
    passFail(
      'POST: video leapInches',
      near(videoInchesPost, expectedPostDelta),
      `video.leapInches=${videoInchesPost}; expected ${expectedPostDelta}`
    );

    // ── 2. APPROVE ─────────────────────────────────────────────────────────
    console.log('');
    console.log('--- Step 2: APPROVE (pending → approved) ---');
    const beforeApprove = await readUser(db, testUid);
    const streakBeforeApprove = beforeApprove.activeLeapStreakDays;
    const expectedStreak = expectedStreakAfterApprove(userAtPost, challengeDate);

    await videoRef.set({ moderationStatus: 'approved' }, { merge: true });

    const approveSettled = await waitFor('approval finalize', async () => {
      const v = await videoRef.get();
      const vd = v.data() as Record<string, unknown> | undefined;
      return (
        String(vd?.moderationStatus ?? '') === 'approved' &&
        vd?.leapInchesPendingApproval === false &&
        vd?.leapInchesAwarded === true
      );
    });

    const afterApproveUser = await readUser(db, testUid);
    lifetimeAfterApprove = afterApproveUser.leaperLifetimePoints;
    const approveDelta = round10(lifetimeAfterApprove - lifetimeAfterPost);

    passFail(
      'APPROVE: finalize settled',
      approveSettled,
      `pendingApproval=false moderationStatus=approved`
    );
    passFail(
      'APPROVE: no duplicate full post award',
      near(approveDelta, 0),
      `lifetime ${lifetimeAfterPost} → ${lifetimeAfterApprove} (Δ ${approveDelta}); expected Δ 0`
    );
    passFail(
      'APPROVE: streak updated',
      afterApproveUser.activeLeapStreakDays === expectedStreak.activeLeapStreakDays,
      `streak ${streakBeforeApprove} → ${afterApproveUser.activeLeapStreakDays}; expected ${expectedStreak.activeLeapStreakDays}`
    );
    passFail(
      'APPROVE: hasApprovedLeapEver',
      afterApproveUser.hasApprovedLeapEver === true,
      `hasApprovedLeapEver=${afterApproveUser.hasApprovedLeapEver}`
    );

    // ── 3. LIKE ──────────────────────────────────────────────────────────────
    console.log('');
    console.log('--- Step 3: LIKE (non-owner like → engagement) ---');
    const beforeLikeUser = await readUser(db, testUid);
    const beforeLikeVideo = leapInchesFromVideo(
      (await videoRef.get()).data() as Record<string, unknown> | undefined
    );

    await db.doc(`${POST_COLLECTION}/${videoId}/likes/${likerUid}`).set({
      uid: likerUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const likeCountOk = await waitFor('likesCount increment', async () => {
      const v = await videoRef.get();
      return Math.max(0, Number(v.data()?.likesCount ?? 0)) >= 1;
    });

    const likeEngagementOk = await waitFor('engagement inch credit', async () => {
      const [u, v] = await Promise.all([userRef.get(), videoRef.get()]);
      const ud = snapshotUser(u.data() as Record<string, unknown> | undefined);
      const vi = leapInchesFromVideo(v.data() as Record<string, unknown> | undefined);
      return ud.leaperLifetimePoints > beforeLikeUser.leaperLifetimePoints || vi > beforeLikeVideo;
    });

    const afterLikeUser = await readUser(db, testUid);
    const afterLikeVideo = (await videoRef.get()).data() as Record<string, unknown> | undefined;
    lifetimeAfterLike = afterLikeUser.leaperLifetimePoints;
    const likeLifetimeDelta = round10(lifetimeAfterLike - beforeLikeUser.leaperLifetimePoints);
    const likeVideoDelta = round10(
      leapInchesFromVideo(afterLikeVideo) - beforeLikeVideo
    );
    videoInchesBeforeReject = leapInchesFromVideo(afterLikeVideo);

    passFail('LIKE: likesCount synced', likeCountOk, `likesCount=${String(afterLikeVideo?.likesCount ?? 0)}`);
    passFail(
      'LIKE: ~1.0 inch engagement credit',
      likeEngagementOk && (near(likeLifetimeDelta, 1) || near(likeVideoDelta, 1)),
      `lifetime ${beforeLikeUser.leaperLifetimePoints} → ${lifetimeAfterLike} (Δ ${likeLifetimeDelta}); video inches ${beforeLikeVideo} → ${leapInchesFromVideo(afterLikeVideo)} (Δ ${likeVideoDelta}); expected ~+1.0`
    );
    if (likeCountOk && !likeEngagementOk) {
      console.log(
        '       NOTE: likesCount updated but lifetime/video inches did not — onVideoLikeCreated does not call engagement retotal (only comments do). This is a known trigger gap.'
      );
    }

    // ── 4. REVOKE (reject) ─────────────────────────────────────────────────
    console.log('');
    console.log('--- Step 4: REVOKE (reject video) ---');
    const beforeRevokeUser = await readUser(db, testUid);
    const inchesToRevoke = videoInchesBeforeReject > 0 ? videoInchesBeforeReject : leapInchesFromVideo(
      (await videoRef.get()).data() as Record<string, unknown> | undefined
    );

    await videoRef.set({ moderationStatus: 'rejected' }, { merge: true });

    const revokeSettled = await waitFor('reject + revoke', async () => {
      const v = await videoRef.get();
      if (v.exists) {
        const vd = v.data() as Record<string, unknown> | undefined;
        if (String(vd?.moderationStatus ?? '') !== 'rejected' && vd?.leapInchesAwarded !== false) {
          return false;
        }
      }
      const u = await readUser(db, testUid);
      return u.leaperLifetimePoints < beforeRevokeUser.leaperLifetimePoints || !v.exists;
    });

    const afterRevokeUser = await readUser(db, testUid);
    const revokeDelta = round10(afterRevokeUser.leaperLifetimePoints - beforeRevokeUser.leaperLifetimePoints);
    const expectedRevokeDelta = round10(-inchesToRevoke);

    passFail(
      'REVOKE: trigger settled',
      revokeSettled,
      `video exists=${(await videoRef.get()).exists}; leapInchesAwarded cleared on reject path`
    );
    passFail(
      'REVOKE: exact negative inch delta',
      inchesToRevoke > 0 ? near(revokeDelta, expectedRevokeDelta) : revokeSettled,
      `lifetime ${beforeRevokeUser.leaperLifetimePoints} → ${afterRevokeUser.leaperLifetimePoints} (Δ ${revokeDelta}); expected Δ ${expectedRevokeDelta} (revoking ${inchesToRevoke} in)`
    );
    passFail(
      'REVOKE: streak restored to baseline',
      afterRevokeUser.activeLeapStreakDays === baseline.activeLeapStreakDays,
      `streak ${afterRevokeUser.activeLeapStreakDays}; baseline ${baseline.activeLeapStreakDays}`
    );
    passFail(
      'REVOKE: lifetime restored to baseline',
      near(afterRevokeUser.leaperLifetimePoints, baseline.leaperLifetimePoints),
      `lifetime ${afterRevokeUser.leaperLifetimePoints}; baseline ${baseline.leaperLifetimePoints}`
    );
  } finally {
    if (!SKIP_CLEANUP) {
      console.log('');
      console.log('--- Cleanup ---');
      await deleteTestArtifacts({ db, videoId, likerUid });
      await restoreUser(db, testUid, baseline);
      if (dayStatsBefore) {
        await dayStatsRef.set(dayStatsBefore, { merge: false }).catch(() => {
          dayStatsRef.delete().catch(() => {});
        });
      } else {
        await dayStatsRef.delete().catch(() => {});
      }
      const restored = await readUser(db, testUid);
      console.log(
        `restored user lifetime=${restored.leaperLifetimePoints} streak=${restored.activeLeapStreakDays}`
      );
    } else {
      console.log('');
      console.log('SKIP_CLEANUP=1 — test artifacts left in place for inspection.');
    }
  }

  console.log('');
  console.log('=== Summary ===');
  let allPass = true;
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
    if (!r.pass) allPass = false;
  }
  console.log('');
  console.log(allPass ? 'ALL STEPS PASSED' : 'SOME STEPS FAILED — see details above');
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
