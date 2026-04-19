import * as React from 'react';

import { isFirebaseConfigured } from '../../firebase/firebase';
import {
  subscribeMyInboxRows,
  type ConversationMemberRow,
  type InboxMemberSnapshot,
} from '../../services/chat/chatFirestore';

export type InboxRow = InboxMemberSnapshot;

export function useConversations(myUid: string | undefined) {
  const [rows, setRows] = React.useState<InboxRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !myUid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeMyInboxRows(
      myUid,
      (mapped) => {
        setRows(mapped);
        setLoading(false);
        setError(null);
      },
      (e) => {
        setError(e);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [myUid]);

  const totalUnread = React.useMemo(
    () => rows.reduce((n, r) => n + (r.member.archived ? 0 : r.member.unreadCount), 0),
    [rows]
  );

  return { rows, loading, error, totalUnread };
}
