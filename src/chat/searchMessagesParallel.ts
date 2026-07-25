import { searchMessagesInConversation } from '../services/chat/chatFirestore';
import type { ChatMessage } from './types';

export type MessageSearchHitGroup = {
  convId: string;
  title: string;
  avatarUrl?: string | null;
  messages: ChatMessage[];
};

type ConvSeed = {
  conversationId: string;
  title: string;
  avatarUrl?: string | null;
};

/** Prefix-search recent conversations with a small concurrency pool; cancels via generation token. */
export async function searchMessagesParallel(args: {
  query: string;
  conversations: ConvSeed[];
  concurrency?: number;
  perConvLimit?: number;
  maxConversations?: number;
  isCancelled?: () => boolean;
}): Promise<MessageSearchHitGroup[]> {
  const prefix = args.query.trim().toLowerCase();
  if (!prefix) return [];

  const list = args.conversations.slice(0, args.maxConversations ?? 24);
  const concurrency = Math.max(1, args.concurrency ?? 4);
  const perConv = args.perConvLimit ?? 6;
  const out: MessageSearchHitGroup[] = [];
  let i = 0;

  async function worker() {
    while (i < list.length) {
      if (args.isCancelled?.()) return;
      const idx = i++;
      const conv = list[idx]!;
      try {
        const msgs = await searchMessagesInConversation(conv.conversationId, prefix, perConv);
        if (args.isCancelled?.()) return;
        if (msgs.length) {
          out.push({
            convId: conv.conversationId,
            title: conv.title,
            avatarUrl: conv.avatarUrl,
            messages: msgs,
          });
        }
      } catch {
        // Skip failed conversation searches.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, () => worker()));
  return out;
}
