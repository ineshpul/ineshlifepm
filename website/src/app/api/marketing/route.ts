import { NextResponse } from "next/server";

import * as admin from "firebase-admin";

function nyDateKeyFromMs(ms: number): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function nyHourMinuteFromMs(ms: number): { hour: number; minute: number } {
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
  const [hh, mm] = s.split(":").map(Number);
  return { hour: hh, minute: mm };
}

function readServiceAccountJson(): string | null {
  const direct = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (direct) return direct;

  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_B64?.trim();
  if (!b64) return null;

  try {
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function initFirebaseAdmin() {
  if (admin.apps.length > 0) return;

  const raw = readServiceAccountJson();
  if (!raw) {
    throw new Error(
      "Missing FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_JSON_B64",
    );
  }

  const creds = JSON.parse(raw) as admin.ServiceAccount;
  admin.initializeApp({
    credential: admin.credential.cert(creds),
  });
}

export async function GET() {
  try {
    initFirebaseAdmin();
    const db = admin.firestore();

    const nowMs = Date.now();
    const leapDayKey = nyDateKeyFromMs(nowMs);
    const { hour } = nyHourMinuteFromMs(nowMs);
    const isLive = Number.isFinite(hour) && hour >= 12;

    if (!isLive) {
      return NextResponse.json(
        {
          leapDayKey,
          isLive: false,
          leapTitle: "Loading today's leap…",
          postersCount: 0,
          updatedAtMs: nowMs,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const challengeSnap = await db.collection("challenges").doc(leapDayKey).get();
    const challengeTitle = String(challengeSnap.data()?.title ?? "").trim();

    const users = db.collection("users");

    let postersCount = 0;
    try {
      const agg = await users
        .where("leaperDayKey", "==", leapDayKey)
        .where("leaperDayPoints", ">", 0)
        .count()
        .get();
      postersCount = agg.data().count;
    } catch {
      try {
        const agg = await users.where("leaperDayKey", "==", leapDayKey).count().get();
        postersCount = agg.data().count;
      } catch {
        postersCount = 0;
      }
    }

    return NextResponse.json(
      {
        leapDayKey,
        isLive: true,
        leapTitle: challengeTitle || "Today’s leap",
        postersCount,
        updatedAtMs: nowMs,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (e) {
    console.error("Marketing API error", e);
    return NextResponse.json({ error: "Could not load marketing data." }, { status: 500 });
  }
}

