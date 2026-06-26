import { collection, limit, orderBy, query, where, type Query } from 'firebase/firestore';

import { firestore } from '../firebase/firebase';

/** Recent leaps for a user — server-ordered by `createdAt` (requires composite Firestore indexes). */
export function userVideosQuery(args: {
  uid: string;
  approvedOnly?: boolean;
  limitN?: number;
}): Query {
  const col = collection(firestore(), 'videos');
  const limitN = args.limitN ?? 40;
  if (args.approvedOnly) {
    return query(
      col,
      where('uid', '==', args.uid),
      where('moderationStatus', '==', 'approved'),
      orderBy('createdAt', 'desc'),
      limit(limitN)
    );
  }
  return query(col, where('uid', '==', args.uid), orderBy('createdAt', 'desc'), limit(limitN));
}
