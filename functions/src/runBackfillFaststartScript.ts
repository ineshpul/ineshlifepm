/**
 * Backfill 720p feed encodes (`*_feed.mp4`) for leaps and/or Best Parts.
 *
 * Prerequisites:
 *   cd functions && npm run build
 *
 * Auth:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   or gcloud auth application-default login
 *
 * Usage (dry-run — default):
 *   npm run backfill:faststart
 *
 * Apply writes (today's leap day only):
 *   DRY_RUN=0 TODAY_ONLY=1 npm run backfill:faststart
 *
 * Recent N videos missing current encode version:
 *   DRY_RUN=0 LIMIT=40 npm run backfill:faststart
 *
 * Best Parts only:
 *   DRY_RUN=0 SCOPE=bestParts LIMIT=30 npm run backfill:faststart
 *
 * Both collections:
 *   DRY_RUN=0 SCOPE=all LIMIT=40 npm run backfill:faststart
 *
 * Force re-encode even when already on 720p-v1:
 *   DRY_RUN=0 FORCE=1 LIMIT=10 npm run backfill:faststart
 */

import * as admin from 'firebase-admin';

import { FEED_ENCODE_VERSION, ensureFeedClipEncode } from './faststartVideoCore';
import { leapChallengeDateKeyFromMs, nyDateKeyFromMs } from './timeKeys';

const DEFAULT_PROJECT =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  'leap-e4cce';

const DEFAULT_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || 'leap-e4cce.firebasestorage.app';

type MediaRow = {
  id: string;
  collection: 'videos' | 'bestParts';
  storagePath?: string;
  secondaryStoragePath?: string;
  feedUrl?: string;
  feedSecondaryUrl?: string;
  feedEncodeVersion?: string;
  posterUrl?: string;
  dayKey?: string;
};

function needsEncode(row: MediaRow, force: boolean): { primary: boolean; pip: boolean } {
  if (force) {
    return {
      primary: Boolean(row.storagePath),
      pip: Boolean(row.secondaryStoragePath),
    };
  }
  const versionOk = String(row.feedEncodeVersion ?? '').trim() === FEED_ENCODE_VERSION;
  const missingPoster = !String(row.posterUrl ?? '').trim();
  const primary =
    Boolean(row.storagePath) &&
    (!String(row.feedUrl ?? '').trim() || !versionOk || missingPoster);
  const pip =
    Boolean(row.secondaryStoragePath) &&
    (!String(row.feedSecondaryUrl ?? '').trim() || !versionOk);
  return { primary, pip };
}

async function main(): Promise<void> {
  const dryRun = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false';
  const todayOnly = process.env.TODAY_ONLY === '1' || process.env.TODAY_ONLY === 'true';
  const force = process.env.FORCE === '1' || process.env.FORCE === 'true';
  const limit = Math.min(Math.max(parseInt(process.env.LIMIT ?? '30', 10) || 30, 1), 200);
  const scopeRaw = String(process.env.SCOPE ?? 'all').trim().toLowerCase();
  const scope: 'videos' | 'bestParts' | 'all' =
    scopeRaw === 'videos' || scopeRaw === 'leaps'
      ? 'videos'
      : scopeRaw === 'bestparts' || scopeRaw === 'bestpart'
        ? 'bestParts'
        : 'all';

  const challengeDateEnv = String(process.env.CHALLENGE_DATE ?? '').trim();
  const dateKeyEnv = String(process.env.DATE_KEY ?? '').trim();
  const todayLeapKey = leapChallengeDateKeyFromMs(Date.now());
  const todayNyKey = nyDateKeyFromMs(Date.now());
  const leapDayFilter = challengeDateEnv || (todayOnly ? todayLeapKey : '');
  const bestPartDayFilter = dateKeyEnv || (todayOnly ? todayNyKey : '');

  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: DEFAULT_PROJECT,
      storageBucket: DEFAULT_BUCKET,
    });
  }

  const db = admin.firestore();
  const bucketName = admin.storage().bucket().name;

  console.log(
    JSON.stringify(
      {
        project: DEFAULT_PROJECT,
        bucket: bucketName,
        dryRun,
        force,
        limit,
        scope,
        encodeVersion: FEED_ENCODE_VERSION,
        leapDayFilter: leapDayFilter || null,
        bestPartDayFilter: bestPartDayFilter || null,
      },
      null,
      2
    )
  );

  const candidates: MediaRow[] = [];

  if (scope === 'videos' || scope === 'all') {
    const snap = leapDayFilter
      ? await db.collection('videos').where('challengeDate', '==', leapDayFilter).limit(limit).get()
      : await db.collection('videos').orderBy('createdAt', 'desc').limit(limit).get();

    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (data.deleted === true) continue;
      if (data.mediaType === 'photo') continue;
      const cd = String(data.challengeDate ?? '').trim();
      if (leapDayFilter && cd !== leapDayFilter) continue;
      const storagePath = String(data.storagePath ?? '').trim();
      if (!storagePath || !storagePath.endsWith('.mp4')) continue;
      const row: MediaRow = {
        id: d.id,
        collection: 'videos',
        storagePath,
        secondaryStoragePath: String(data.secondaryStoragePath ?? '').trim() || undefined,
        feedUrl: typeof data.feedUrl === 'string' ? data.feedUrl : undefined,
        feedSecondaryUrl:
          typeof data.feedSecondaryUrl === 'string' ? data.feedSecondaryUrl : undefined,
        feedEncodeVersion:
          typeof data.feedEncodeVersion === 'string' ? data.feedEncodeVersion : undefined,
        posterUrl: typeof data.posterUrl === 'string' ? data.posterUrl : undefined,
        dayKey: cd,
      };
      const need = needsEncode(row, force);
      if (!need.primary && !need.pip) continue;
      candidates.push(row);
    }
  }

  if (scope === 'bestParts' || scope === 'all') {
    const snap = bestPartDayFilter
      ? await db.collection('bestParts').where('dateKey', '==', bestPartDayFilter).limit(limit).get()
      : await db.collection('bestParts').orderBy('createdAt', 'desc').limit(limit).get();

    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (data.deleted === true) continue;
      if (data.mediaType === 'photo') continue;
      const dateKey = String(data.dateKey ?? '').trim();
      if (bestPartDayFilter && dateKey !== bestPartDayFilter) continue;
      const storagePath = String(data.storagePath ?? '').trim();
      if (!storagePath || !storagePath.endsWith('.mp4')) continue;
      const row: MediaRow = {
        id: d.id,
        collection: 'bestParts',
        storagePath,
        secondaryStoragePath: String(data.secondaryStoragePath ?? '').trim() || undefined,
        feedUrl: typeof data.feedUrl === 'string' ? data.feedUrl : undefined,
        feedSecondaryUrl:
          typeof data.feedSecondaryUrl === 'string' ? data.feedSecondaryUrl : undefined,
        feedEncodeVersion:
          typeof data.feedEncodeVersion === 'string' ? data.feedEncodeVersion : undefined,
        posterUrl: typeof data.posterUrl === 'string' ? data.posterUrl : undefined,
        dayKey: dateKey,
      };
      const need = needsEncode(row, force);
      if (!need.primary && !need.pip) continue;
      candidates.push(row);
    }
  }

  console.log(`Candidates: ${candidates.length}`);

  let ok = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of candidates) {
    const primary = String(row.storagePath ?? '').trim();
    const secondary = String(row.secondaryStoragePath ?? '').trim();
    const need = needsEncode(row, force);
    console.log(`\n→ ${row.collection}/${row.id} (${row.dayKey ?? '?'})`);

    if (dryRun) {
      console.log(`  dry-run primary=${need.primary ? primary : 'skip'} force=${force}`);
      if (need.pip) console.log(`  dry-run pip=${secondary}`);
      skipped += 1;
      continue;
    }

    try {
      if (need.primary && primary) {
        const r = await ensureFeedClipEncode({
          bucketName,
          sourceObjectPath: primary,
          forceRebuild: force,
        });
        console.log(`  primary feed: ${r?.feedObjectPath ?? 'null'}`);
      }
      if (need.pip && secondary) {
        const r = await ensureFeedClipEncode({
          bucketName,
          sourceObjectPath: secondary,
          forceRebuild: force,
        });
        console.log(`  pip feed: ${r?.feedObjectPath ?? 'null'}`);
      }
      ok += 1;
    } catch (e) {
      failed += 1;
      console.error(`  FAILED ${row.collection}/${row.id}`, e);
    }
  }

  console.log(
    JSON.stringify(
      {
        done: true,
        dryRun,
        force,
        encodeVersion: FEED_ENCODE_VERSION,
        candidates: candidates.length,
        ok,
        failed,
        skippedDryRun: skipped,
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
