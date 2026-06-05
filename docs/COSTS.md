# Cloud Functions cost guide (Leap)

For ~120 users, **$55/month** on Google Cloud usually means **invocation count × memory × runtime**, not “too many users.” Check **Billing → Reports** filtered by **Cloud Run** (Gen2 functions) and **Cloud Scheduler**.

## Biggest drivers in this repo

| Driver | Why it costs | What we changed |
|--------|----------------|-----------------|
| **Video moderation** | Was **1 GiB** with up to **9 min** billed time per upload (GCS→S3 + Rekognition polling). | Upload function ends after starting the job (**512 MiB**, 5 min max). Polling moved to **`pollVideoModerationJobs`** (256 MiB, every 3 min). |
| **`scheduledLeapViewingMeta`** | Was **` * * * * *`** (every minute) ≈ **43,200 runs/month**, plus a Firestore write each time. | Now **every 5 minutes** and **skips write** when config unchanged. |
| **Like → leap retotal** | Each like triggered `adminRetotalAwardedVideoLeapInches` (reads likes/views/comments). | Likes only update `likesCount`; retotal throttled to **5 min** on comments. |
| **Client `recomputeVerticalScoreCallable`** | Called on Me / Top / Record focus — duplicates Firestore triggers. | Removed automatic client calls; triggers + Settings refresh remain. |
| **Many deployed functions** | ~30 separate functions → separate cold starts / billing lines. | Admin/backfill callables are rarely used; keep them undeployed in prod if never needed. |

## Rough math (upload moderation)

Gen2 pricing is dominated by **GB-seconds**:

- **Before:** 1 GB × 300 s average × 400 uploads/month ≈ **120,000 GB-seconds**
- **After upload step:** 0.5 GB × 90 s × 400 ≈ **18,000 GB-seconds**
- **After poll scheduler:** 0.25 GB × 10 s × ~4,000 polls/month ≈ **10,000 GB-seconds**

Savings on moderation alone are often **~60–80%** of that pipeline (exact % depends on video length and Rekognition latency).

## Further savings (optional)

1. **`requirePostModeration: false`** in `app.json` for a beta — disables AWS pipeline entirely (human/mod-only workflow).
2. **Sample Rekognition** — moderate every Nth upload or first upload of the day only.
3. **Move view counts client-side** — replace `recordVideoViewCallable` with a rules-gated Firestore write (fewer HTTPS invocations).
4. **Debounce `recomputeUserLeapStatsAdmin`** — queue one recompute per user per 10 min instead of on every video field change.
5. **Delete unused exports** from `functions/src/index.ts` in production (backfill callables) if never called.
6. **AWS Rekognition** — appears on AWS bill, not GCP; still worth optimizing poll frequency.

## Verify after deploy

```bash
cd functions && npm run build
firebase deploy --only functions,firestore:rules
```

In GCP Console → Cloud Run → sort services by **billable instance time** and confirm `onleapvideouploadedmoderate` and `scheduledleapviewingmeta` dropped.
