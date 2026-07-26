import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';

export type VideoReportArgs = {
  reporterUid: string;
  videoId: string;
  videoOwnerUid: string;
  videoOwnerUsername: string;
  reason: string;
};

export async function reportVideo(args: VideoReportArgs) {
  if (!isFirebaseConfigured()) return;
  await addDoc(collection(firestore(), 'videoReports'), {
    reporterUid: args.reporterUid,
    videoId: args.videoId,
    videoOwnerUid: args.videoOwnerUid,
    videoOwnerUsername: args.videoOwnerUsername,
    reason: String(args.reason ?? '').slice(0, 500) || 'unspecified',
    createdAt: serverTimestamp(),
  });
}

export type BestPartReportArgs = {
  reporterUid: string;
  bestPartId: string;
  bestPartOwnerUid: string;
  bestPartOwnerUsername: string;
  reason: string;
};

export async function reportBestPart(args: BestPartReportArgs) {
  if (!isFirebaseConfigured()) return;
  await addDoc(collection(firestore(), 'bestPartReports'), {
    reporterUid: args.reporterUid,
    bestPartId: args.bestPartId,
    bestPartOwnerUid: args.bestPartOwnerUid,
    bestPartOwnerUsername: args.bestPartOwnerUsername,
    reason: String(args.reason ?? '').slice(0, 500) || 'unspecified',
    createdAt: serverTimestamp(),
  });
}

