import * as React from 'react';

import { useAuth } from '../state/auth';
import { useConversations, type InboxRow } from './hooks/useConversations';

type ChatInboxData = {
  rows: InboxRow[];
  loading: boolean;
  totalUnread: number;
  error: Error | null;
};

const ChatInboxDataContext = React.createContext<ChatInboxData | null>(null);

/** Single inbox subscription for tab badge + ChatInbox + ChatSearch. */
export function ChatUnreadProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { rows, loading, totalUnread, error } = useConversations(user?.uid);
  const value = React.useMemo(
    () => ({ rows, loading, totalUnread, error }),
    [rows, loading, totalUnread, error]
  );
  return <ChatInboxDataContext.Provider value={value}>{children}</ChatInboxDataContext.Provider>;
}

export function useChatInboxData(): ChatInboxData {
  const ctx = React.useContext(ChatInboxDataContext);
  if (!ctx) {
    throw new Error('useChatInboxData must be used within ChatUnreadProvider');
  }
  return ctx;
}

export function useChatUnreadCount() {
  return useChatInboxData().totalUnread;
}
