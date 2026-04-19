import * as React from 'react';

import { isFirebaseConfigured } from '../../firebase/firebase';
import {
  subscribeConversation,
  subscribeMembers,
  type ConversationDoc,
  type ConversationMemberRow,
} from '../../services/chat/chatFirestore';

export function useConversation(conversationId: string | undefined, myUid: string | undefined) {
  const [conversation, setConversation] = React.useState<ConversationDoc | null>(null);
  const [members, setMembers] = React.useState<ConversationMemberRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !conversationId) {
      setConversation(null);
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const u1 = subscribeConversation(
      conversationId,
      (c) => {
        setConversation(c);
        setLoading(false);
      },
      () => setLoading(false)
    );
    const u2 = subscribeMembers(conversationId, setMembers);
    return () => {
      u1();
      u2();
    };
  }, [conversationId]);

  const myMember = React.useMemo(() => {
    if (!myUid) return null;
    return members.find((m) => m.memberUid === myUid) ?? null;
  }, [members, myUid]);

  return { conversation, members, myMember, loading };
}
