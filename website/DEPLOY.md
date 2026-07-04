# Deploy taketheleap.app on Vercel

`main` already includes this `website/` folder. After a one-time Vercel setup, every push to `main` redeploys automatically.

## Option A — GitHub (recommended, no CLI)

1. Open [vercel.com/new](https://vercel.com/new) and import **Ineshpul/leap** (GitHub).
2. **Root Directory:** click *Edit* → set to `website` (required).
3. **Production Branch:** `main`.
4. Deploy. Framework should detect **Next.js**; build command `npm run build`, output `.next`.
5. **Domain:** Project → **Settings** → **Domains** → add:
   - `taketheleap.app` (primary)
   - `www.taketheleap.app` (optional; redirects to apex via `vercel.json`)
6. At your domain registrar (where you bought `taketheleap.app`), add the DNS records Vercel shows. Typical setup:
   - **A** `@` → `76.76.21.21`
   - **CNAME** `www` → `cname.vercel-dns.com`
   - Or use Vercel nameservers if you transfer DNS to Vercel.
7. Wait for SSL (usually a few minutes). Site is live at **https://taketheleap.app**.

If you previously connected this repo with the wrong root directory, fix **Settings → General → Root Directory** to `website` and redeploy.

## Option B — CLI (manual deploy)

From repo root:

```bash
cd website
npx vercel login
npm run deploy
```

First run links the folder to a Vercel project; choose your team and confirm `website` as the path.

Add the domain in the dashboard (same as step 5–7 above) or:

```bash
npx vercel domains add taketheleap.app
npx vercel domains add www.taketheleap.app
```

## Local check

```bash
cd website
npm install
npm run build
npm run dev
```

## Environment variables (Vercel)

Set in **Project → Settings → Environment Variables** (never commit values):

| Name | Required | Purpose |
|------|----------|---------|
| `RESEND_API_KEY` | Yes | Sends website challenge suggestions |
| `RESEND_FROM_EMAIL` | No | Verified sender (defaults to Resend onboarding address) |
| `SUGGESTION_TO_EMAIL` | No | Inbox for suggestions (defaults to team Gmail) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_JSON_B64` | No | Direct Firestore read for Leap of the Day (optional if Cloud Function fallback is deployed) |
| `WEBSITE_MARKETING_URL` | No | Override URL for `getWebsiteMarketing` Cloud Function fallback |

See [../docs/SECURITY.md](../docs/SECURITY.md) for App Check, AWS secrets, and API key restrictions.

## What does *not* redeploy the site

Changes only under `src/` (React Native app) do not affect the marketing site unless you also change files under `website/`. The app ships via the App Store separately.
