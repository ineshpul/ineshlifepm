# Security setup (Leap)

Code in this repo wires App Check, Secret Manager, Firestore rules, and rate limits. Finish these **Firebase / Google Cloud / Vercel** steps in the consoles.

## API keys (Firebase client keys in `app.json`)

Client API keys are public by design. Lock them down in [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials):

1. Open the **Browser key** / **iOS key** / **Android key** used by `leap-e4cce`.
2. **Application restrictions**: iOS bundle `com.leapmvp.app`, Android package `com.leapmvp.app`, HTTP referrers for Expo web if used.
3. **API restrictions**: allow only Firebase services you use (Identity Toolkit, Firestore, Storage, FCM, etc.).

Align `app.json` `extra.firebase.apiKey` with `GoogleService-Info.plist` or remove the unused key.

## App Check

1. [Firebase Console → App Check](https://console.firebase.google.com/): register iOS (App Attest / DeviceCheck), Android (Play Integrity), web (reCAPTCHA v3).
2. Add to `app.json` `extra` when ready:
   - `appCheckDebugToken` — debug token from Console (dev builds only)
   - `recaptchaSiteKey` — web reCAPTCHA site key
3. Rebuild the **dev client** after adding `@react-native-firebase/app-check` (`npx expo prebuild` / EAS build).
4. Start with **Monitoring** on Firestore, Storage, Auth, and Functions; switch to **Enforced** once >95% of traffic has valid tokens.
5. Optional: set Cloud Functions `enforceAppCheck: true` on callables after enforcement is stable.

## Secrets (Firebase Functions)

```bash
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set AWS_ACCESS_KEY_ID
firebase functions:secrets:set AWS_SECRET_ACCESS_KEY
```

Redeploy functions. Set non-secret env in Firebase Functions config:

- `AWS_REGION`, `AWS_MODERATION_BUCKET`
- `RESEND_FROM_EMAIL`, `CHALLENGE_SUGGESTION_TO_EMAIL`

Use a dedicated IAM user for moderation (S3 put/get/delete on staging bucket + Rekognition only).

## Vercel (website)

In the Vercel project (**Root Directory** = `website`), set:

| Variable | Required | Notes |
|----------|----------|--------|
| `RESEND_API_KEY` | Yes | Resend sending key |
| `RESEND_FROM_EMAIL` | No | Verified domain sender |
| `SUGGESTION_TO_EMAIL` | No | Inbox for website suggestions |
| `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_JSON_B64` | No | Optional list for Leap of the Day (optional with `getWebsiteMarketing` function) |
| `WEBSITE_MARKETING_URL` | No | Override for marketing Cloud Function URL |

Never commit `.env` files; they are gitignored.

## Redis

**Not required** for this stack. Rate limits use Firestore (`loginOtpRate`, `challengeSuggestionRate`) and in-process limits on the marketing site. Add Redis (e.g. Upstash) only if you need cross-region strict quotas or heavy caching beyond Firestore.
