import * as React from 'react';
import { startTransition } from 'react';
import type { DocumentSnapshot } from 'firebase/firestore';

import { isFirebaseConfigured } from '../../firebase/firebase';
import type { ChatMessage, MessageAttachment, ReplyRef, SharePostPayload } from '../types';
import { CHAT_MESSAGES_INITIAL_PAGE, CHAT_MESSAGES_PAGE_SIZE } from '../constants';
import {
  loadOlderMessages,
  markConversationRead,
  sendChatMessage,
  subscribeMessagesPage,
} from '../../services/chat/chatFirestore';

type SendJob = {
  payload: {
    text?: string;
    replyTo?: ReplyRef;
    attachments?: MessageAttachment[];
    sharePost?: SharePostPayload;
  };
  resolve: () => void;
  reject: (e: unknown) => void;
};

export function useMessages(conversationId: string | undefined, myUid: string | undefined) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(true);
  const oldestSnapRef = React.useRef<DocumentSnapshot | null>(null);
  const lastMessageIdRef = React.useRef<string | null>(null);
  const sendQueueRef = React.useRef<SendJob[]>([]);
  const pumpRunningRef = React.useRef(false);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeMessagesPage(
      conversationId,
      CHAT_MESSAGES_INITIAL_PAGE,
      (page, docs) => {
        const oldest = docs.length ? docs[docs.length - 1] : null;
        const lastId = page.length ? page[page.length - 1]!.id : null;
        const more = docs.length >= CHAT_MESSAGES_INITIAL_PAGE;
        startTransition(() => {
          setMessages(page);
          oldestSnapRef.current = oldest;
          lastMessageIdRef.current = lastId;
          setHasMore(more);
          setLoading(false);
        });
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
      startTransition(() => {
        setMessages((prev) => [...older, ...prev]);
      });
      if (older.length < CHAT_MESSAGES_PAGE_SIZE) setHasMore(false);
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore, loadingOlder]);

  const pumpSendQueue = React.useCallback(async () => {
    if (!conversationId || !myUid) return;
    if (pumpRunningRef.current) return;
    pumpRunningRef.current = true;
    try {
      while (sendQueueRef.current.length > 0) {
        const job = sendQueueRef.current.shift()!;
        try {
          await sendChatMessage({
            conversationId,
            senderId: myUid,
            text: job.payload.text,
            replyTo: job.payload.replyTo,
            attachments: job.payload.attachments,
            sharePost: job.payload.sharePost,
          });
          job.resolve();
        } catch (e) {
          job.reject(e);
        }
      }
    } finally {
      pumpRunningRef.current = false;
      if (sendQueueRef.current.length > 0) void pumpSendQueue();
    }
  }, [conversationId, myUid]);

  const send = React.useCallback(
    (args: {
      text?: string;
      replyTo?: ReplyRef;
      attachments?: MessageAttachment[];
      sharePost?: SharePostPayload;
    }) =>
      new Promise<void>((resolve, reject) => {
        if (!conversationId || !myUid) {
          resolve();
          return;
        }
        sendQueueRef.current.push({ payload: args, resolve, reject });
        void pumpSendQueue();
      }),
    [conversationId, myUid, pumpSendQueue]
  );

  return { messages, loading, loadingOlder, hasMore, loadOlder, send, markRead };
}
