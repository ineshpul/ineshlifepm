/** Conversation thread currently focused in the UI (Chat stack). Used to suppress duplicate banners. */
let foregroundChatConversationId: string | null = null;

export function setForegroundChatConversationId(id: string | null) {
  foregroundChatConversationId = id;
}

export function getForegroundChatConversationId(): string | null {
  return foregroundChatConversationId;
}
