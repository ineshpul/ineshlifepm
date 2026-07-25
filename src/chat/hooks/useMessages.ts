import * as React from 'react';
import { startTransition } from 'react';
import type { DocumentSnapshot } from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';

import { isFirebaseConfigured } from '../../firebase/firebase';
import type { ChatMessage, MessageAttachment, ReplyRef, SharePostPayload } from '../types';
import { CHAT_MESSAGES_INITIAL_PAGE, CHAT_MESSAGES_PAGE_SIZE } from '../constants';
import {
  loadOlderMessages,
  markConversationRead,
  sendChatMessage,
  subscribeMessagesPage,
} from '../../services/chat/chatFirestore';

type SendPayload = {
  text?: string;
  replyTo?: ReplyRef;
  attachments?: MessageAttachment[];
  sharePost?: SharePostPayload;
  clientTempId: string;
};

type SendJob = {
  payload: SendPayload;
  resolve: () => void;
  reject: (e: unknown) => void;
};

function newTempId() {
  return `tmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Merge live newest-page snapshot with paginated history + optimistic sends. */
function mergeLivePage(prev: ChatMessage[], page: ChatMessage[]): ChatMessage[] {
  const liveIds = new Set(page.map((m) => m.id));
  const serverTempIds = new Set(
    page.map((m) => m.clientTempId).filter((id): id is string => Boolean(id))
  );

  const older: ChatMessage[] = [];
  const pending: ChatMessage[] = [];

  for (const m of prev) {
    if (liveIds.has(m.id)) continue;
    if (m.deliveryState === 'optimistic' || m.deliveryState === 'failed') {
      const temp = m.clientTempId ?? m.id;
      if (serverTempIds.has(temp) || liveIds.has(temp)) continue;
      pending.push(m);
      continue;
    }
    // Keep scrolled-in history (and any message that fell off the live window).
    older.push(m);
  }

  return [...older, ...page, ...pending];
}

export function useMessages(conversationId: string | undefined, myUid: string | undefined) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(true);
  const oldestSnapRef = React.useRef<DocumentSnapshot | null>(null);
  const hasOlderHistoryRef = React.useRef(false);
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
    hasOlderHistoryRef.current = false;
    oldestSnapRef.current = null;
    const unsub = subscribeMessagesPage(
      conversationId,
      CHAT_MESSAGES_INITIAL_PAGE,
      (page, docs) => {
        const lastId = page.length ? page[page.length - 1]!.id : null;
        startTransition(() => {
          setMessages((prev) => {
            const next = mergeLivePage(prev, page);
            if (!hasOlderHistoryRef.current) {
              oldestSnapRef.current = docs.length ? docs[docs.length - 1]! : null;
              setHasMore(docs.length >= CHAT_MESSAGES_INITIAL_PAGE);
            }
            lastMessageIdRef.current = lastId;
            return next;
          });
          setLoading(false);
        });
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [conversationId]);

  const markRead = React.useCallback(async () => {
    if (!conversationId || !myUid || !lastMessageIdRef.current) return;
    // Don't mark-read against an optimistic temp id.
    if (lastMessageIdRef.current.startsWith('tmp_')) return;
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
      hasOlderHistoryRef.current = true;
      startTransition(() => {
        setMessages((prev) => {
          const existing = new Set(prev.map((m) => m.id));
          const uniqueOlder = older.filter((m) => !existing.has(m.id));
          return [...uniqueOlder, ...prev];
        });
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
            clientTempId: job.payload.clientTempId,
          });
          job.resolve();
        } catch (e) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === job.payload.clientTempId || m.clientTempId === job.payload.clientTempId
                ? { ...m, deliveryState: 'failed' as const }
                : m
            )
          );
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
        const clientTempId = newTempId();
        const optimistic: ChatMessage = {
          id: clientTempId,
          senderId: myUid,
          text: args.text,
          kind: args.sharePost ? 'share_post' : 'text',
          sharePost: args.sharePost,
          createdAt: Timestamp.now(),
          replyTo: args.replyTo,
          deliveryState: 'optimistic',
          clientTempId,
          attachments: args.attachments,
        };
        setMessages((prev) => [...prev, optimistic]);
        lastMessageIdRef.current = clientTempId;

        sendQueueRef.current.push({
          payload: { ...args, clientTempId },
          resolve,
          reject,
        });
        void pumpSendQueue();
      }),
    [conversationId, myUid, pumpSendQueue]
  );

  return { messages, loading, loadingOlder, hasMore, loadOlder, send, markRead };
}
