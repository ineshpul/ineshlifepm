/**
 * Restore streak after an extension-account post was wrongly reset (one missed leap day).
 *
 *   $env:USER_UID = "is10Doy7zQYUeCi36P8gE1M3lZe2"
 *   $env:TARGET_STREAK = "32"
 *   $env:VIDEO_ID = "is10Doy7zQYUeCi36P8gE1M3lZe2_2026-07-01"
 *   npm run heal:streak-continuation
 */

import * as admin from 'firebase-admin';

import { computePostLeapInches } from '../verticalScoreEngine';
import { leapChallengeDateKeyFromMs } from '../timeKeys';

const DEFAULT_PROJECT =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  'leap-e4cce';

async function main(): Promise<void> {
  const uid = String(process.env.USER_UID ?? '').trim();
  const videoId = String(process.env.VIDEO_ID ?? '').trim();
  const targetStreak = Math.max(1, Math.round(Number(process.env.TARGET_STREAK ?? 32)));
  if (!uid || !videoId) {
    console.error('Set USER_UID and VIDEO_ID.');
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: DEFAULT_PROJECT });
  }
  const db = admin.firestore();

  const userRef = db.doc(`users/${uid}`);
  const videoRef = db.doc(`videos/${videoId}`);
  const [userSnap, videoSnap] = await Promise.all([userRef.get(), videoRef.get()]);
  if (!userSnap.exists || !videoSnap.exists) {
    console.error('User or video not found.');
    process.exit(1);
  }

  const ud = userSnap.data() ?? {};
  const vd = videoSnap.data() as Record<string, unknown>;
  const priorStreakBasis = targetStreak - 1;
  const oldLeapInches = Number(vd.leapInches ?? 0);
  const oldLifetime = Number(ud.leaperLifetimePoints ?? 0);

  const computed = computePostLeapInches({
    streakDays: priorStreakBasis,
    isFirstEverLeap: false,
    isFirstPostOfDay: false,
    baseInchesReduction: Number(vd.leapBaseReductionInches ?? 0),
    likes: Number(vd.likesCount ?? 0),
    comments: Number(vd.commentsCount ?? 0),
    shares: Number(vd.shareCount ?? 0),
    views: Number(vd.viewCount ?? 0),
  });

  const challengeDate = String(vd.challengeDate ?? '').trim();
  const todayKey = leapChallengeDateKeyFromMs(Date.now());
  const lifetimeDelta = computed.leapInches - oldLeapInches;

  await videoRef.set(
    {
      leapInches: computed.leapInches,
      leapNominalBaseInches: computed.nominalBaseInches,
      leapBaseInches: computed.baseInches,
      leapStreakMultiplier: computed.streakMultiplier,
      leapEngagementInches: computed.engagementInches,
      leapStreakDaysBasis: priorStreakBasis,
    },
    { merge: true }
  );

  const userPatch: Record<string, unknown> = {
    activeLeapStreakDays: targetStreak,
    longestLeapStreakDays: Math.max(targetStreak, Number(ud.longestLeapStreakDays ?? 0)),
    lastApprovedLeapDateKey: challengeDate || String(ud.lastApprovedLeapDateKey ?? ''),
    leaperLifetimePoints: Math.round((oldLifetime + lifetimeDelta) * 10) / 10,
    leapStatsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (challengeDate === todayKey || String(ud.leaperDayKey ?? '') === todayKey) {
    userPatch.leaperDayKey = todayKey;
    userPatch.leaperDayPoints = computed.leapInches;
  }

  await userRef.set(userPatch, { merge: true });

  console.log(
    JSON.stringify(
      {
        ok: true,
        uid,
        videoId,
        targetStreak,
        priorStreakBasis,
        oldLeapInches,
        newLeapInches: computed.leapInches,
        lifetimeDelta,
        streakMultiplier: computed.streakMultiplier,
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
