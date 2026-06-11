/**

 * One-time admin heal: users with `activeLeapStreakDays > 0` but a broken streak get

 * `activeLeapStreakDays` zeroed.

 *

 * Broken when:

 *   - no qualifying approved awarded leap videos, or

 *   - last approved leap day is not today or yesterday (gap ≥ 2 calendar days).

 *

 * Prerequisites:

 *   cd functions && npm run build

 *

 * Auth:

 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

 *   or gcloud auth application-default login

 *

 * Usage (dry-run — default, no writes):

 *   npm run heal:stale-streaks

 *

 * Apply writes:

 *   DRY_RUN=0 npm run heal:stale-streaks

 *

 * Optional:

 *   PAGE_SIZE=50 DRY_RUN=0 npm run heal:stale-streaks

 */



import * as admin from 'firebase-admin';



import { leapChallengeDateKeyFromMs } from './timeKeys';
import { countsForStreak, isActiveLeapStreakAlive } from './verticalScoreEngine';



const DEFAULT_PROJECT =

  process.env.GCLOUD_PROJECT ||

  process.env.GCP_PROJECT ||

  process.env.GOOGLE_CLOUD_PROJECT ||

  'leap-e4cce';



const POST_COLLECTION = 'videos';



type StaleReason = 'no_qualifying_video' | 'expired_streak';



async function userHasQualifyingStreakVideo(

  db: admin.firestore.Firestore,

  uid: string

): Promise<boolean> {

  const snap = await db

    .collection(POST_COLLECTION)

    .where('uid', '==', uid)

    .where('moderationStatus', '==', 'approved')

    .limit(40)

    .get();



  for (const d of snap.docs) {

    const data = d.data() as Record<string, unknown>;

    if (data.deleted === true) continue;

    if (countsForStreak(data)) return true;

  }

  return false;

}



async function main(): Promise<void> {

  const dryRun = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false';

  const pageSize = Math.min(Math.max(parseInt(process.env.PAGE_SIZE ?? '50', 10) || 50, 1), 100);

  const todayLeapDayKey = leapChallengeDateKeyFromMs(Date.now());



  if (!admin.apps.length) {

    admin.initializeApp({ projectId: DEFAULT_PROJECT });

  }

  const db = admin.firestore();



  let cursorUid = '';

  let page = 0;

  let scanned = 0;

  let stale = 0;

  let healed = 0;

  let failed = 0;

  const staleUids: string[] = [];



  // eslint-disable-next-line no-console

  console.log(JSON.stringify({ dryRun, pageSize, project: DEFAULT_PROJECT, todayLeapDayKey }));



  for (;;) {

    page += 1;

    let q = db

      .collection('users')

      .where('activeLeapStreakDays', '>', 0)

      .orderBy('activeLeapStreakDays', 'desc')

      .limit(pageSize);

    if (cursorUid) {

      const cur = await db.doc(`users/${cursorUid}`).get();

      if (cur.exists) q = q.startAfter(cur);

    }



    const snap = await q.get();

    if (snap.empty) break;



    for (const d of snap.docs) {

      const uid = d.id;

      scanned += 1;

      const data = d.data() as Record<string, unknown>;

      const active = Math.max(0, Math.floor(Number(data.activeLeapStreakDays ?? 0)));

      if (active <= 0) continue;



      try {

        const hasQualifying = await userHasQualifyingStreakVideo(db, uid);

        const lastKey = String(data.lastApprovedLeapDateKey ?? '').trim();

        let reason: StaleReason | null = null;



        if (!hasQualifying) {

          reason = 'no_qualifying_video';

        } else if (!isActiveLeapStreakAlive(lastKey, todayLeapDayKey)) {

          reason = 'expired_streak';

        }



        if (!reason) continue;



        stale += 1;

        staleUids.push(uid);



        // eslint-disable-next-line no-console

        console.log(

          JSON.stringify({

            action: dryRun ? 'would_zero_streak' : 'zero_streak',

            reason,

            uid,

            activeLeapStreakDays: active,

            longestLeapStreakDays: Number(data.longestLeapStreakDays ?? 0),

            lastApprovedLeapDateKey: lastKey,

            todayLeapDayKey,

          })

        );



        if (!dryRun) {

          if (reason === 'no_qualifying_video') {

            await db.doc(`users/${uid}`).set(

              {

                activeLeapStreakDays: 0,

                longestLeapStreakDays: 0,

                lastApprovedLeapDateKey: admin.firestore.FieldValue.delete(),

                leapStatsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),

              },

              { merge: true }

            );

          } else {

            await db.doc(`users/${uid}`).set(

              {

                activeLeapStreakDays: 0,

                leapStatsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),

              },

              { merge: true }

            );

          }

          healed += 1;

        }

      } catch (e) {

        failed += 1;

        // eslint-disable-next-line no-console

        console.error(JSON.stringify({ uid, error: String(e) }));

      }

    }



    cursorUid = snap.docs[snap.docs.length - 1]?.id ?? '';

    // eslint-disable-next-line no-console

    console.log(

      JSON.stringify({

        page,

        batch: snap.size,

        scanned,

        stale,

        healed: dryRun ? 0 : healed,

        failed,

        lastUid: cursorUid,

        done: snap.size < pageSize,

      })

    );



    if (snap.size < pageSize) break;

  }



  // eslint-disable-next-line no-console

  console.log(

    JSON.stringify({

      done: true,

      dryRun,

      scanned,

      stale,

      healed: dryRun ? 0 : healed,

      failed,

      staleUidSample: staleUids.slice(0, 20),

    })

  );

}



void main().catch((e) => {

  // eslint-disable-next-line no-console

  console.error(e);

  process.exit(1);

});


