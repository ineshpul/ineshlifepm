import * as React from 'react';
import type { DocumentSnapshot } from 'firebase/firestore';

import { isFirebaseConfigured } from '../../firebase/firebase';
import type { ChatMessage, ReplyRef, SharePostPayload } from '../types';
import type { MessageAttachment } from '../types';
import {
  CHAT_MESSAGES_PAGE_SIZE,
  loadOlderMessages,
  markConversationRead,
  sendChatMessage,
  subscribeMessagesPage,
} from '../../services/chat/chatFirestore';
import { CHAT_MIN_MESSAGE_INTERVAL_MS } from '../constants';

export function useMessages(conversationId: string | undefined, myUid: string | undefined) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(true);
  const oldestSnapRef = React.useRef<DocumentSnapshot | null>(null);
  const lastSendAt = React.useRef(0);
  const lastMessageIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeMessagesPage(
      conversationId,
      CHAT_MESSAGES_PAGE_SIZE,
      (page, docs) => {
        setMessages(page);
        oldestSnapRef.current = docs.length ? docs[docs.length - 1] : null;
        lastMessageIdRef.current = page.length ? page[page.length - 1]!.id : null;
        setHasMore(docs.length >= CHAT_MESSAGES_PAGE_SIZE);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [conversationId]);

  const markRead = React.useCallback(async () => {
    if (!conversationId || !myUid || !lastMessageIdRef.current) return;
    await markConversationRead(conversationId, myUid, lastMessageIdRef.current);
  }, [conversationId, myUid]);

  const loadOlder = React.useCallback(async () => {
    if (!conversationId || !oldestSnapRef.current || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    try {
      const { messages: older, lastDoc } = await loadOlderMessages(
        conversationId,
        oldestSnapRef.current,
        CHAT_MESSAGES_PAGE_SIZE
      );
      if (!older.length) {
        setHasMore(false);
        return;
      }
      oldestSnapRef.current = lastDoc;
      setMessages((prev) => [...older, ...prev]);
      if (older.length < CHAT_MESSAGES_PAGE_SIZE) setHasMore(false);
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore, loadingOlder]);

  const send = React.useCallback(
    async (args: {
      text?: string;
      replyTo?: ReplyRef;
      attachments?: MessageAttachment[];
      sharePost?: SharePostPayload;
    }) => {
      if (!conversationId || !myUid) return;
      const now = Date.now();
      if (now - lastSendAt.current < CHAT_MIN_MESSAGE_INTERVAL_MS) return;
      lastSendAt.current = now;
      await sendChatMessage({
        conversationId,
        senderId: myUid,
        text: args.text,
        replyTo: args.replyTo,
        attachments: args.attachments,
        sharePost: args.sharePost,
      });
    },
    [conversationId, myUid]
  );

  return { messages, loading, loadingOlder, hasMore, loadOlder, send, markRead };
}
