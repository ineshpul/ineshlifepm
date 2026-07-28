import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function buildApp(): App {
  if (getApps().length) return getApps()[0]!;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY."
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

let _db: Firestore | null = null;

export function db(): Firestore {
  if (!_db) {
    _db = getFirestore(buildApp());
  }
  return _db;
}

export const COLLECTIONS = {
  areas: "areas",
  visionItems: "visionItems",
  goals: "goals",
  tasks: "tasks",
  assignees: "assignees",
  metrics: "metrics",
  metricReadings: "metricReadings",
  days: "days",
  cadenceRules: "cadenceRules",
  knowledgeEntries: "knowledgeEntries",
  userChats: "userChats",
  initiatives: "initiatives",
  settings: "settings",
} as const;

export const SETTINGS_DOC_ID = "singleton";

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix = ""): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}${prefix ? "-" : ""}${time}${rand}`;
}
