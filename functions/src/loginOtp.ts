import * as crypto from 'crypto';
import * as logger from 'firebase-functions/logger';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const REGION = 'us-central1';
const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;

function normEmail(s: unknown): string {
  const e = String(s ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpsError('invalid-argument', 'Invalid email.');
  return e;
}

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

async function sendResend(to: string, code: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    logger.error('RESEND_API_KEY is not set');
    throw new HttpsError(
      'failed-precondition',
      'Sign-in email is not configured. Set RESEND_API_KEY (Resend) on your Cloud Functions environment.'
    );
  }
  const from = process.env.RESEND_FROM_EMAIL || 'Leap <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Your Leap sign-in code',
      html: `<p style="font-size:15px;color:#333">Your Leap sign-in code is:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#111">${code}</p><p style="font-size:14px;color:#666">This code expires in 10 minutes. If you did not try to sign in, you can ignore this email.</p>`,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    logger.error('Resend API error', { status: res.status, body: t });
    throw new HttpsError('internal', 'Could not send email. Try again later.');
  }
}

/** Email/password sign-in: sends a 6-digit code (Apple / Google flows do not use this). */
export const sendLoginOtp = onCall({ region: REGION }, async (request) => {
  const email = normEmail(request.data?.email);

  let userRecord: admin.auth.UserRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'No account exists for that email.');
    }
    logger.error('getUserByEmail failed', e);
    throw new HttpsError('internal', 'Could not verify email.');
  }
  if (!userRecord.email) {
    throw new HttpsError('failed-precondition', 'This account has no email on file.');
  }

  const db = admin.firestore();
  const rateId = sha256Hex(email);
  const rateRef = db.collection('loginOtpRate').doc(rateId);
  await db.runTransaction(async (tx) => {
    const r = await tx.get(rateRef);
    const now = Date.now();
    const windowStart = now - RATE_WINDOW_MS;
    const sends = ((r.data()?.sends as number[] | undefined) ?? []).filter((t) => t > windowStart);
    if (sends.length >= MAX_SENDS_PER_HOUR) {
      throw new HttpsError('resource-exhausted', 'Too many codes requested. Try again in an hour.');
    }
    sends.push(now);
    tx.set(
      rateRef,
      { sends, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  });

  const code = String(crypto.randomInt(100000, 1000000));
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = sha256Hex(`${code}:${salt}`);
  const otpId = crypto.randomUUID();
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_MS);

  await db.collection('loginOtps').doc(otpId).set({
    email,
    hash,
    salt,
    expiresAt,
    attempts: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await sendResend(email, code);

  return { otpId };
});

export const verifyLoginOtp = onCall({ region: REGION }, async (request) => {
  const otpId = String(request.data?.otpId ?? '').trim();
  const code = String(request.data?.code ?? '')
    .trim()
    .replace(/\s/g, '');
  if (!otpId) throw new HttpsError('invalid-argument', 'Missing verification.');
  if (!/^\d{6}$/.test(code)) throw new HttpsError('invalid-argument', 'Enter the 6-digit code.');

  const ref = admin.firestore().collection('loginOtps').doc(otpId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Invalid or expired code.');

  const d = snap.data()!;
  const exp = d.expiresAt as admin.firestore.Timestamp | undefined;
  if (!exp || exp.toMillis() < Date.now()) {
    await ref.delete().catch(() => {});
    throw new HttpsError('deadline-exceeded', 'This code has expired. Request a new one.');
  }

  const attempts = Number(d.attempts ?? 0);
  if (attempts >= MAX_ATTEMPTS) {
    await ref.delete().catch(() => {});
    throw new HttpsError('permission-denied', 'Too many attempts. Request a new code.');
  }

  const salt = String(d.salt ?? '');
  const expected = String(d.hash ?? '');
  const got = sha256Hex(`${code}:${salt}`);
  if (got !== expected) {
    await ref.update({ attempts: admin.firestore.FieldValue.increment(1) });
    throw new HttpsError('permission-denied', 'Wrong code. Try again.');
  }

  await ref.delete();
  return { ok: true };
});
