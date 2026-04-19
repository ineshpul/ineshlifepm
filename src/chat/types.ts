import type { Timestamp } from 'firebase/firestore';

export type ConversationType = 'dm' | 'group';

export type DeliveryState = 'optimistic' | 'sent' | 'failed';

export type AttachmentKind = 'image' | 'video' | 'document' | 'audio';

/** Stored on the message document (embedded attachments). */
export type MessageAttachment = {
  id: string;
  kind: AttachmentKind;
  storagePath: string;
  downloadUrl: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  durationSec?: number;
  thumbnailUrl?: string;
  fileName?: string;
};

export type SharePostPayload = {
  videoId: string;
  videoUrl?: string;
  title?: string;
  ownerUid?: string;
  ownerUsername?: string;
};

export type ReplyRef = {
  messageId: string;
  textSnippet: string;
  senderId: string;
  senderUsername?: string;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  text?: string;
  kind?: 'text' | 'system' | 'share_post';
  sharePost?: SharePostPayload;
  createdAt: Timestamp | null;
  editedAt?: Timestamp | null;
  deletedForEveryone?: boolean;
  /** UIDs that hid this message locally (soft delete for self). */
  deletedForSelfUids?: string[];
  replyTo?: ReplyRef;
  deliveryState?: DeliveryState;
  clientTempId?: string;
  attachments?: MessageAttachment[];
  /** Lightweight read map; keys are member UIDs. */
  readReceipts?: Record<string, Timestamp>;
  /** Optional moderation / client flags. */
  moderationNote?: string;
};

export type MessageReaction = {
  id: string;
  userId: string;
  emoji: string;
  createdAt: Timestamp | null;
};

export type ConversationMemberRow = {
  id: string;
  memberUid: string;
  /** Denormalized from conversation for inbox rows. */
  convTitle?: string;
  convAvatarUrl?: string | null;
  convType?: ConversationType;
  displayNameSnap?: string;
  role: 'owner' | 'member';
  joinedAt: Timestamp | null;
  muted: boolean;
  archived: boolean;
  pinned: boolean;
  unreadCount: number;
  lastReadMessageId?: string;
  lastReadAt?: Timestamp | null;
  /** Denormalized for inbox ordering (collection-group query). */
  lastActivityAt: Timestamp | null;
  lastMessagePreview?: string;
  chatNotificationsEnabled?: boolean;
};

export type ConversationDoc = {
  id: string;
  type: ConversationType;
  name: string;
  avatarUrl?: string;
  createdBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  memberIds: string[];
  dmPairKey?: string;
  lastMessage?: {
    text?: string;
    senderId?: string;
    kind?: string;
    at?: Timestamp | null;
  };
  memberCount: number;
  lastActivityAt: Timestamp | null;
};

export type UserPresenceDoc = {
  uid: string;
  state: 'online' | 'offline';
  lastSeenAt: Timestamp | null;
};

export type MessageReportPayload = {
  conversationId: string;
  messageId: string;
  reason: string;
};

export type TypingDoc = {
  updatedAt: Timestamp | null;
};
