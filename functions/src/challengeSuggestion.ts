import * as logger from 'firebase-functions/logger';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { resendFromAddress } from './resendFrom';
import { resendApiKey } from './resendSecrets';

const REGION = 'us-central1';
const MAX_LEN = 1200;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_SUBMITS_PER_HOUR = 12;

const DEFAULT_INBOX = 'taketheleap.app@gmail.com';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendSuggestionEmail(params: {
  to: string;
  from: string;
  key: string;
  suggestion: string;
  uid: string;
  username: string;
  email: string;
}) {
  const { to, from, key, suggestion, uid, username, email } = params;
  const safeBody = escapeHtml(suggestion).replace(/\r\n|\n|\r/gu, '<br/>');
  const meta = escapeHtml(`uid: ${uid}\nusername: @${username}\naccount email: ${email || 'n/a'}`).replace(
    /\n/gu,
    '<br/>'
  );

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Leap challenge suggestion',
      html: `<p style="font-size:14px;color:#333;font-weight:700">New challenge idea</p><p style="font-size:15px;color:#111;white-space:pre-wrap">${safeBody}</p><hr style="border:none;border-top:1px solid #ddd;margin:16px 0"/><p style="font-size:13px;color:#666">${meta}</p>`,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    logger.error('Resend challenge suggestion error', { status: res.status, body: t });
    const hint = resendFailureUserHint(res.status, t);
    throw new HttpsError('failed-precondition', hint);
  }
}

/** Short, safe message for the app when Resend rejects the send (see function logs for full body). */
function resendFailureUserHint(status: number, bodyText: string): string {
  let msg = '';
  try {
    const j = JSON.parse(bodyText) as { message?: string };
    msg = String(j?.message ?? '');
  } catch {
    msg = bodyText.slice(0, 200);
  }
  const lower = msg.toLowerCase();
  if (
    status === 403 &&
    (lower.includes('testing') || lower.includes('verify your domain') || lower.includes('only send'))
  ) {
    return (
      'Resend blocked this send: with the default test sender you can usually only mail your own signup email. ' +
      'In Resend, verify a domain, set Cloud Function env RESEND_FROM_EMAIL to an address on that domain, ' +
      'and set CHALLENGE_SUGGESTION_TO_EMAIL to an allowed inbox (or your verified address) if needed.'
    );
  }
  if (status === 422 || lower.includes('domain') || lower.includes('invalid')) {
    return (
      'Resend rejected the message (often unverified From domain or invalid to/from). ' +
      'Check Resend → Domains and set RESEND_FROM_EMAIL on your function to a verified sender.'
    );
  }
  return 'Could not deliver your suggestion. Check Firebase function logs for the Resend response, or try again later.';
}

/**
 * Authenticated users submit a challenge idea; delivered to the team inbox via Resend (no mail client).
 */
export const submitChallengeSuggestionCallable = onCall(
  { region: REGION, invoker: 'public', secrets: [resendApiKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

    const suggestion = String(request.data?.text ?? '').trim();
    if (!suggestion) throw new HttpsError('invalid-argument', 'Enter your idea first.');
    if (suggestion.length > MAX_LEN) {
      throw new HttpsError('invalid-argument', `Keep it under ${MAX_LEN} characters.`);
    }

    const key = resendApiKey.value() || process.env.RESEND_API_KEY || '';
    if (!key.trim()) {
      logger.error('RESEND_API_KEY is not set (secret or env)');
      throw new HttpsError(
        'failed-precondition',
        'Suggestions are not configured yet. Set the RESEND_API_KEY secret (see Firebase docs) and redeploy.'
      );
    }

    const from = resendFromAddress();
    const to = String(process.env.CHALLENGE_SUGGESTION_TO_EMAIL ?? DEFAULT_INBOX)
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(to)) {
      logger.error('CHALLENGE_SUGGESTION_TO_EMAIL invalid', { to });
      throw new HttpsError('failed-precondition', 'Suggestion inbox is misconfigured.');
    }

    const db = admin.firestore();
    const rateRef = db.collection('challengeSuggestionRate').doc(uid);
    await db.runTransaction(async (tx) => {
      const r = await tx.get(rateRef);
      const now = Date.now();
      const windowStart = now - RATE_WINDOW_MS;
      const sends = ((r.data()?.sends as number[] | undefined) ?? []).filter((t) => t > windowStart);
      if (sends.length >= MAX_SUBMITS_PER_HOUR) {
        throw new HttpsError('resource-exhausted', 'Too many suggestions this hour. Try again later.');
      }
      sends.push(now);
      tx.set(rateRef, { sends, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    });

    const userSnap = await db.doc(`users/${uid}`).get();
    const username = String(userSnap.data()?.username ?? 'unknown').trim() || 'unknown';
    const email = String(request.auth?.token?.email ?? '').trim();

    await sendSuggestionEmail({ to, from, key, suggestion, uid, username, email });

    return { ok: true };
  }
);
