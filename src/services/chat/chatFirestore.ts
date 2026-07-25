import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { firestore } from '../../firebase/firebase';
import type {
  ChatMessage,
  ConversationDoc,
  ConversationMemberRow,
  ConversationType,
  DeliveryState,
  MessageAttachment,
  MessageReaction,
  ReplyRef,
  SharePostPayload,
} from '../../chat/types';
import {
  CHAT_MAX_ATTACHMENTS_PER_MESSAGE,
  CHAT_MAX_GROUP_MEMBERS,
  CHAT_MAX_MESSAGE_CHARS,
  CHAT_MESSAGES_PAGE_SIZE,
} from '../../chat/constants';
import * as P from './paths';

export type { ChatMessage, ConversationDoc, ConversationMemberRow, MessageReaction } from '../../chat/types';

export function dmPairKey(a: string, b: string): string {
  return [a, b].sort().join('_');
}

function convRef(id: string) {
  return doc(firestore(), P.CONVERSATIONS, id);
}

function membersCol(convId: string) {
  return collection(firestore(), P.CONVERSATIONS, convId, P.CONVERSATION_MEMBERS);
}

function inboxDoc(ownerUid: string, convId: string) {
  return doc(firestore(), 'users', ownerUid, P.CHAT_CONVERSATIONS_INBOX, convId);
}

/** Fields mirrored to `users/{uid}/chatConversations/{convId}` for a reliable inbox query. */
function inboxMirrorBootstrap(args: {
  conversationId: string;
  memberUid: string;
  convTitle: string;
  convAvatarUrl?: string | null;
  convType: ConversationType;
  role: 'owner' | 'member';
  now: ReturnType<typeof serverTimestamp>;
}): Record<string, unknown> {
  return {
    conversationId: args.conversationId,
    memberUid: args.memberUid,
    convTitle: args.convTitle,
    convAvatarUrl: args.convAvatarUrl ?? null,
    convType: args.convType,
    role: args.role,
    joinedAt: args.now,
    muted: false,
    archived: false,
    pinned: false,
    unreadCount: 0,
    lastActivityAt: args.now,
    lastMessagePreview: '',
    chatNotificationsEnabled: true,
  };
}

function messagesCol(convId: string) {
  return collection(firestore(), P.CONVERSATIONS, convId, P.MESSAGES);
}

function typingCol(convId: string) {
  return collection(firestore(), P.CONVERSATIONS, convId, P.TYPING);
}

export function mapConversationDoc(id: string, d: Record<string, unknown>): ConversationDoc {
  return {
    id,
    type: (d.type as ConversationType) ?? 'group',
    name: String(d.name ?? 'Chat'),
    avatarUrl: d.avatarUrl ? String(d.avatarUrl) : undefined,
    createdBy: String(d.createdBy ?? ''),
    createdAt: (d.createdAt as Timestamp) ?? null,
    updatedAt: (d.updatedAt as Timestamp) ?? null,
    memberIds: Array.isArray(d.memberIds) ? (d.memberIds as string[]) : [],
    dmPairKey: d.dmPairKey ? String(d.dmPairKey) : undefined,
    lastMessage: (() => {
      const lm = d.lastMessage;
      if (!lm || typeof lm !== 'object') return undefined;
      const o = lm as Record<string, unknown>;
      return {
        text: o.text != null ? String(o.text) : undefined,
        senderId: o.senderId != null ? String(o.senderId) : undefined,
        kind: o.kind != null ? String(o.kind) : undefined,
        at: (o.at as Timestamp) ?? null,
      };
    })(),
    memberCount: typeof d.memberCount === 'number' ? d.memberCount : 0,
    lastActivityAt: (d.lastActivityAt as Timestamp) ?? null,
  };
}

export function mapMemberDoc(id: string, d: Record<string, unknown>): ConversationMemberRow {
  return {
    id,
    memberUid: String(d.memberUid ?? id),
    convTitle: d.convTitle != null ? String(d.convTitle) : undefined,
    convAvatarUrl: d.convAvatarUrl === undefined ? undefined : (d.convAvatarUrl as string | null),
    convType: d.convType as ConversationMemberRow['convType'],
    displayNameSnap: d.displayNameSnap != null ? String(d.displayNameSnap) : undefined,
    role: d.role === 'owner' ? 'owner' : 'member',
    joinedAt: (d.joinedAt as Timestamp) ?? null,
    muted: Boolean(d.muted),
    archived: Boolean(d.archived),
    pinned: Boolean(d.pinned),
    unreadCount: typeof d.unreadCount === 'number' ? d.unreadCount : 0,
    lastReadMessageId: d.lastReadMessageId != null ? String(d.lastReadMessageId) : undefined,
    lastReadAt: (d.lastReadAt as Timestamp) ?? null,
    lastActivityAt: (d.lastActivityAt as Timestamp) ?? null,
    lastMessagePreview: d.lastMessagePreview != null ? String(d.lastMessagePreview) : undefined,
    chatNotificationsEnabled: d.chatNotificationsEnabled !== false,
  };
}

export function mapMessageDoc(id: string, d: Record<string, unknown>): ChatMessage {
  return {
    id,
    senderId: String(d.senderId ?? ''),
    text: d.text != null ? String(d.text) : undefined,
    kind: d.kind as ChatMessage['kind'],
    sharePost: d.sharePost as SharePostPayload | undefined,
    createdAt: (d.createdAt as Timestamp) ?? null,
    editedAt: (d.editedAt as Timestamp) ?? undefined,
    deletedForEveryone: Boolean(d.deletedForEveryone),
    deletedForSelfUids: Array.isArray(d.deletedForSelfUids) ? (d.deletedForSelfUids as string[]) : undefined,
    replyTo: d.replyTo as ReplyRef | undefined,
    deliveryState: d.deliveryState as DeliveryState | undefined,
    clientTempId: d.clientTempId != null ? String(d.clientTempId) : undefined,
    attachments: Array.isArray(d.attachments) ? (d.attachments as MessageAttachment[]) : undefined,
    readReceipts: d.readReceipts as Record<string, Timestamp> | undefined,
    moderationNote: d.moderationNote != null ? String(d.moderationNote) : undefined,
  };
}

export async function findDmConversation(pairKey: string): Promise<string | null> {
  const q = query(
    collection(firestore(), P.CONVERSATIONS),
    where('type', '==', 'dm'),
    where('dmPairKey', '==', pairKey),
    limit(1)
  );
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0].id;
}

export async function userBlocks(uid: string, targetUid: string): Promise<boolean> {
  try {
    const b = await getDoc(doc(firestore(), 'users', uid, P.USER_BLOCKS, targetUid));
    return b.exists();
  } catch {
    // Most callers are not allowed to read other users' `userBlocks` docs (rules: owner-only).
    // The authoritative check still happens in Firestore rules via `isBlockedPair()` during conversation create.
    return false;
  }
}

export async function createConversation(args: {
  type: ConversationType;
  name: string;
  avatarUrl?: string;
  createdBy: string;
  memberIds: string[];
  dmPairKey?: string;
}): Promise<string> {
  const uniq = Array.from(new Set(args.memberIds));
  if (uniq.length < 2) throw new Error('Need at least two members.');
  if (uniq.length > CHAT_MAX_GROUP_MEMBERS) throw new Error('Group is too large.');
  const id = doc(collection(firestore(), P.CONVERSATIONS)).id;
  const cref = convRef(id);
  const now = serverTimestamp();

  /** Resolve usernames so group threads / Group Info can show who is who. */
  const profileByUid = new Map<string, { username: string; photoUrl: string | null }>();
  await Promise.all(
    uniq.map(async (uid) => {
      try {
        const snap = await getDoc(doc(firestore(), 'users', uid));
        const data = snap.data() as Record<string, unknown> | undefined;
        const username = String(data?.username ?? 'Member').trim() || 'Member';
        const photoUrl = data?.photoUrl ? String(data.photoUrl).trim() || null : null;
        profileByUid.set(uid, { username, photoUrl });
      } catch {
        profileByUid.set(uid, { username: 'Member', photoUrl: null });
      }
    })
  );

  // IMPORTANT: Firestore rules for `conversationMembers` require the parent conversation doc to exist.
  // Batched writes do not make `exists(/conversations/{id})` true for other writes in the same batch,
  // so we create the conversation first, then write member rows.
  await setDoc(cref, {
    type: args.type,
    name: args.name,
    avatarUrl: args.avatarUrl ?? null,
    createdBy: args.createdBy,
    createdAt: now,
    updatedAt: now,
    memberIds: uniq,
    dmPairKey: args.dmPairKey ?? null,
    memberCount: uniq.length,
    lastActivityAt: now,
    lastMessage: null,
  });
  const batch = writeBatch(firestore());
  for (const uid of uniq) {
    const role = uid === args.createdBy ? 'owner' : 'member';
    const profile = profileByUid.get(uid);
    const displayNameSnap = profile?.username ?? 'Member';
    batch.set(doc(membersCol(id), uid), {
      memberUid: uid,
      convTitle: args.name,
      convAvatarUrl: args.avatarUrl ?? null,
      convType: args.type,
      displayNameSnap,
      role,
      joinedAt: now,
      muted: false,
      archived: false,
      pinned: false,
      unreadCount: 0,
      lastActivityAt: now,
      lastMessagePreview: '',
      chatNotificationsEnabled: true,
    });
    batch.set(
      inboxDoc(uid, id),
      {
        ...inboxMirrorBootstrap({
          conversationId: id,
          memberUid: uid,
          convTitle: args.name,
          convAvatarUrl: args.avatarUrl ?? null,
          convType: args.type,
          role,
          now,
        }),
        displayNameSnap,
      },
      { merge: true }
    );
  }
  await batch.commit();
  return id;
}

export async function createGroupConversation(args: {
  name: string;
  createdBy: string;
  memberUids: string[];
}): Promise<string> {
  const ids = Array.from(new Set([args.createdBy, ...args.memberUids]));
  return createConversation({
    type: 'group',
    name: args.name.trim() || 'Group chat',
    createdBy: args.createdBy,
    memberIds: ids,
  });
}

export async function getOrCreateDm(args: {
  currentUid: string;
  otherUid: string;
  otherDisplayName: string;
}): Promise<string> {
  if (args.currentUid === args.otherUid) throw new Error('Cannot DM yourself.');
  const pair = dmPairKey(args.currentUid, args.otherUid);
  // We cannot query `conversations` by `dmPairKey` because rules only allow reading conversations
  // you are already a member of (Firestore rejects the whole query).
  // Use a deterministic doc id so we can get-or-create without any query.
  const id = `dm_${pair}`;

  const cref = convRef(id);
  const snap = await getDoc(cref);
  if (snap.exists()) return id;
  // Only check blocks we can read (our own). If they blocked us, rules will reject the conversation create.
  if (await userBlocks(args.currentUid, args.otherUid)) throw new Error('You cannot message this user.');
  const [meDoc, themDoc] = await Promise.all([
    getDoc(doc(firestore(), 'users', args.currentUid)),
    getDoc(doc(firestore(), 'users', args.otherUid)),
  ]);
  const currentName = String(meDoc.data()?.username ?? 'Member').trim() || 'Member';
  const currentPhoto = meDoc.data()?.photoUrl ? String(meDoc.data()!.photoUrl) : null;
  const otherName = String(themDoc.data()?.username ?? args.otherDisplayName ?? 'Chat').trim() || 'Chat';
  const otherPhoto = themDoc.data()?.photoUrl ? String(themDoc.data()!.photoUrl) : null;
  // Create the conversation with deterministic id.
  const uniq = Array.from(new Set([args.currentUid, args.otherUid]));
  const now = serverTimestamp();
  await setDoc(cref, {
    type: 'dm',
    name: otherName,
    avatarUrl: otherPhoto,
    createdBy: args.currentUid,
    createdAt: now,
    updatedAt: now,
    memberIds: uniq,
    dmPairKey: pair,
    memberCount: uniq.length,
    lastActivityAt: now,
    lastMessage: null,
  });
  // Best-effort bootstrap member rows (rules allow creator; each member can also create their own now).
  const batch = writeBatch(firestore());
  for (const uid of uniq) {
    const role = uid === args.currentUid ? 'owner' : 'member';
    const peerTitle = uid === args.currentUid ? otherName : currentName;
    const peerPhoto = uid === args.currentUid ? otherPhoto : currentPhoto;
    batch.set(
      doc(membersCol(id), uid),
      {
        memberUid: uid,
        convTitle: peerTitle,
        convAvatarUrl: peerPhoto,
        convType: 'dm',
        displayNameSnap: peerTitle,
        role,
        joinedAt: now,
        muted: false,
        archived: false,
        pinned: false,
        unreadCount: 0,
        lastActivityAt: now,
        lastMessagePreview: '',
        chatNotificationsEnabled: true,
      },
      { merge: true }
    );
    /**
     * Intentionally skip inbox mirrors here. Opening Message / New chat must not spam
     * Recent chats — the inbox row is created on the first real send.
     */
  }
  await batch.commit();
  return id;
}

export type InboxMemberSnapshot = {
  conversationId: string;
  member: ConversationMemberRow;
};

export function subscribeMyInboxRows(
  myUid: string,
  onRows: (rows: InboxMemberSnapshot[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  // Per-user mirror under `users/{uid}/chatConversations` — avoids collectionGroup + nested
  // `conversationMembers` rules that often yield an empty inbox in client SDKs.
  const q = query(collection(firestore(), 'users', myUid, P.CHAT_CONVERSATIONS_INBOX), limit(80));
  return onSnapshot(
    q,
    (snap) => {
      const rows: InboxMemberSnapshot[] = snap.docs
        .map((d) => {
          const data = d.data() as Record<string, unknown>;
          // Doc id is conversationId; `memberUid` must be the viewer — never fall back to doc id.
          const merged = { ...data, memberUid: data.memberUid != null ? String(data.memberUid) : myUid };
          return {
            conversationId: d.id,
            member: mapMemberDoc(d.id, merged),
          };
        })
        .filter((r) => Boolean(r.conversationId))
        // Hide never-messaged DMs left over from older eager create (empty preview).
        // Groups always stay visible once created.
        .filter((r) => {
          const preview = (r.member.lastMessagePreview ?? '').trim();
          if (preview) return true;
          if (r.member.convType === 'group') return true;
          return false;
        })
        .sort((a, b) => {
          const am = a.member.lastActivityAt?.toMillis?.() ?? 0;
          const bm = b.member.lastActivityAt?.toMillis?.() ?? 0;
          return bm - am;
        })
        .slice(0, 80);
      onRows(rows);
    },
    (e) => onError?.(e as Error)
  );
}

/** Backfills `users/{myUid}/chatConversations/{conversationId}` from the canonical member row (legacy installs). */
export async function ensureMyInboxRow(args: { myUid: string; conversationId: string }): Promise<void> {
  const csnap = await getDoc(convRef(args.conversationId));
  if (!csnap.exists()) return;
  const conv = mapConversationDoc(csnap.id, csnap.data() as Record<string, unknown>);
  const mref = doc(membersCol(args.conversationId), args.myUid);
  const msnap = await getDoc(mref);
  if (!msnap.exists()) return;
  const member = mapMemberDoc(msnap.id, msnap.data() as Record<string, unknown>);

  let resolvedTitle = member.convTitle?.trim() || conv.name || 'Chat';
  let resolvedAvatar: string | null | undefined = member.convAvatarUrl ?? conv.avatarUrl ?? null;

  if (conv.type === 'dm' && conv.memberIds.length === 2) {
    const peerUid = conv.memberIds.find((id) => id !== args.myUid);
    if (peerUid) {
      const peerSnap = await getDoc(doc(firestore(), 'users', peerUid));
      const peerName = String(peerSnap.data()?.username ?? conv.name ?? resolvedTitle).trim();
      if (peerName) resolvedTitle = peerName;
      const p = peerSnap.data()?.photoUrl;
      resolvedAvatar = p ? String(p) : resolvedAvatar ?? null;
    }
  }

  const prevAv = member.convAvatarUrl ?? null;
  const nextAv = resolvedAvatar ?? null;
  if (conv.type === 'dm' && (member.convTitle !== resolvedTitle || prevAv !== nextAv)) {
    await updateDoc(mref, { convTitle: resolvedTitle, convAvatarUrl: nextAv });
  }

  /**
   * Never-messaged DMs stay out of Recent chats. Opening Message / compose refreshes
   * member title/avatar above, but skips the inbox mirror until the first send.
   */
  const hasMessaged =
    Boolean((member.lastMessagePreview ?? '').trim()) || Boolean(conv.lastMessage);
  if (conv.type === 'dm' && !hasMessaged) return;

  await setDoc(
    inboxDoc(args.myUid, args.conversationId),
    {
      conversationId: args.conversationId,
      memberUid: args.myUid,
      convTitle: resolvedTitle,
      convAvatarUrl: resolvedAvatar ?? null,
      convType: member.convType,
      displayNameSnap: member.displayNameSnap,
      role: member.role,
      joinedAt: member.joinedAt,
      muted: member.muted,
      archived: member.archived,
      pinned: member.pinned,
      unreadCount: member.unreadCount,
      lastReadMessageId: member.lastReadMessageId ?? null,
      lastReadAt: member.lastReadAt ?? null,
      lastActivityAt: member.lastActivityAt,
      lastMessagePreview: member.lastMessagePreview ?? '',
      chatNotificationsEnabled: member.chatNotificationsEnabled,
    },
    { merge: true }
  );
}

export function subscribeConversation(
  convId: string,
  onData: (c: ConversationDoc | null) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    convRef(convId),
    (snap) => {
      if (!snap.exists()) onData(null);
      else onData(mapConversationDoc(snap.id, snap.data() as Record<string, unknown>));
    },
    (e) => onError?.(e as Error)
  );
}

export function subscribeMembers(
  convId: string,
  onData: (rows: ConversationMemberRow[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(membersCol(convId), (snap) => {
    onData(snap.docs.map((d) => mapMemberDoc(d.id, d.data() as Record<string, unknown>)));
  }, (e) => onError?.(e as Error));
}

/** DM threads: one doc listener per member instead of the full members subcollection. */
export function subscribeDmMembers(
  convId: string,
  memberUids: readonly string[],
  onData: (rows: ConversationMemberRow[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  const byUid = new Map<string, ConversationMemberRow>();
  const publish = () => onData(Array.from(byUid.values()));
  const unsubs = memberUids.map((uid) => {
    const memberUid = String(uid ?? '').trim();
    if (!memberUid) return () => {};
    return onSnapshot(
      doc(membersCol(convId), memberUid),
      (snap) => {
        if (snap.exists()) {
          byUid.set(memberUid, mapMemberDoc(snap.id, snap.data() as Record<string, unknown>));
        } else {
          byUid.delete(memberUid);
        }
        publish();
      },
      (e) => onError?.(e as Error)
    );
  });
  return () => {
    for (const u of unsubs) u();
  };
}

export function subscribeTyping(
  convId: string,
  myUid: string,
  onTypingUids: (uids: string[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(typingCol(convId), (snap) => {
    const now = Date.now();
    const active: string[] = [];
    snap.forEach((d) => {
      if (d.id === myUid) return;
      const t = d.data()?.updatedAt as Timestamp | undefined;
      const ms = t?.toMillis?.() ?? 0;
      if (now - ms < 5000) active.push(d.id);
    });
    onTypingUids(active);
  }, (e) => onError?.(e as Error));
}

export async function setTyping(convId: string, uid: string, active: boolean): Promise<void> {
  const tref = doc(typingCol(convId), uid);
  if (!active) {
    await setDoc(tref, { updatedAt: Timestamp.fromMillis(0) }, { merge: true });
    return;
  }
  await setDoc(tref, { updatedAt: serverTimestamp() }, { merge: true });
}

export function subscribeMessagesPage(
  convId: string,
  pageSize: number,
  onPage: (items: ChatMessage[], docs: DocumentSnapshot[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  const q = query(messagesCol(convId), orderBy('createdAt', 'desc'), limit(pageSize));
  return onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs;
      const items = docs.map((d) => mapMessageDoc(d.id, d.data() as Record<string, unknown>)).reverse();
      onPage(items, docs);
    },
    (e) => onError?.(e as Error)
  );
}

export async function loadOlderMessages(
  convId: string,
  startAfterDoc: DocumentSnapshot,
  take: number
): Promise<{ messages: ChatMessage[]; lastDoc: DocumentSnapshot | null }> {
  const q = query(
    messagesCol(convId),
    orderBy('createdAt', 'desc'),
    startAfter(startAfterDoc),
    limit(take)
  );
  const snap = await getDocs(q);
  if (snap.empty) return { messages: [], lastDoc: null };
  const docs = snap.docs;
  const messages = docs.map((d) => mapMessageDoc(d.id, d.data() as Record<string, unknown>)).reverse();
  return { messages, lastDoc: docs[docs.length - 1] ?? null };
}

function previewFromPayload(text?: string, attachments?: MessageAttachment[], share?: SharePostPayload) {
  if (share?.title) return `Shared: ${share.title}`;
  if (attachments?.length) {
    const k = attachments[0]?.kind ?? 'file';
    if (k === 'video') return 'Video';
    if (k === 'image') return 'Photo';
    if (k === 'audio') return 'Voice message';
    return 'Attachment';
  }
  const t = (text ?? '').trim();
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}

export async function sendChatMessage(args: {
  conversationId: string;
  senderId: string;
  /** Used to prefix group inbox previews ("alex: hey"). */
  senderUsername?: string;
  text?: string;
  replyTo?: ReplyRef;
  attachments?: MessageAttachment[];
  sharePost?: SharePostPayload;
  clientTempId?: string;
}): Promise<string> {
  const text = (args.text ?? '').trim();
  const atts = (args.attachments ?? []).map((a) => {
    // Firestore rejects `undefined` values anywhere in the payload; only include defined optional fields.
    const clean: any = {
      id: a.id,
      kind: a.kind,
      storagePath: a.storagePath,
      downloadUrl: a.downloadUrl,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
    };
    if (typeof a.width === 'number') clean.width = a.width;
    if (typeof a.height === 'number') clean.height = a.height;
    if (typeof a.durationSec === 'number') clean.durationSec = a.durationSec;
    if (typeof a.thumbnailUrl === 'string' && a.thumbnailUrl) clean.thumbnailUrl = a.thumbnailUrl;
    if (typeof a.fileName === 'string' && a.fileName) clean.fileName = a.fileName;
    return clean as MessageAttachment;
  });
  if (!text && !atts.length && !args.sharePost) throw new Error('Empty message.');
  if (text.length > CHAT_MAX_MESSAGE_CHARS) throw new Error('Message too long.');
  if (atts.length > CHAT_MAX_ATTACHMENTS_PER_MESSAGE) throw new Error('Too many attachments.');

  return runTransaction(firestore(), async (tx) => {
    const cref = convRef(args.conversationId);
    const csnap = await tx.get(cref);
    if (!csnap.exists()) throw new Error('Conversation not found.');
    const cdata = csnap.data() as Record<string, unknown>;
    const memberIds = (cdata.memberIds as string[]) ?? [];
    if (!memberIds.includes(args.senderId)) throw new Error('Not a member.');

    /** Firestore requires every `tx.get` before any `tx.set` / `tx.update`. */
    const convType = (cdata.type as ConversationType) ?? 'group';
    const memberUnread: {
      uid: string;
      curUnread: number;
      convType: ConversationType;
      displayNameSnap?: string;
      convTitle?: string;
      convAvatarUrl?: string | null;
      role: 'owner' | 'member';
    }[] = [];
    for (const uid of memberIds) {
      const mdoc = doc(membersCol(args.conversationId), uid);
      const msnap = await tx.get(mdoc);
      const md = msnap.data() as Record<string, unknown> | undefined;
      const snapName =
        typeof md?.displayNameSnap === 'string' ? String(md.displayNameSnap).trim() : '';
      const title = typeof md?.convTitle === 'string' ? String(md.convTitle).trim() : '';
      const avatar =
        md?.convAvatarUrl != null && String(md.convAvatarUrl).trim()
          ? String(md.convAvatarUrl)
          : null;
      memberUnread.push({
        uid,
        curUnread: Number(md?.unreadCount ?? 0),
        convType: (md?.convType as ConversationType) || convType,
        displayNameSnap: snapName || undefined,
        convTitle: title || undefined,
        convAvatarUrl: avatar,
        role: md?.role === 'owner' ? 'owner' : 'member',
      });
    }

    const mref = doc(messagesCol(args.conversationId));
    const now = serverTimestamp();
    const rawPreview = previewFromPayload(text, atts, args.sharePost);
    const searchBlob = [text, args.sharePost?.title ?? ''].join(' ').trim().toLowerCase();

    /** Groups: prefix inbox preview with sender so it's clear who said what. */
    let senderLabel = (args.senderUsername ?? '').trim().replace(/^@+/u, '');
    if (!senderLabel) {
      const fromMember = memberUnread.find((m) => m.uid === args.senderId)?.displayNameSnap;
      if (fromMember) senderLabel = fromMember.replace(/^@+/u, '');
    }
    const preview =
      convType === 'group' && senderLabel ? `${senderLabel}: ${rawPreview}` : rawPreview;

    tx.set(mref, {
      conversationId: args.conversationId,
      senderId: args.senderId,
      text: text || '',
      searchText: searchBlob,
      kind: args.sharePost ? 'share_post' : 'text',
      sharePost: args.sharePost ?? null,
      createdAt: now,
      replyTo: args.replyTo ?? null,
      deliveryState: 'sent',
      clientTempId: args.clientTempId ?? null,
      attachments: atts.length ? atts : null,
      readReceipts: { [args.senderId]: Timestamp.now() },
      deletedForEveryone: false,
      deletedForSelfUids: [],
    });

    tx.update(cref, {
      updatedAt: now,
      lastActivityAt: now,
      lastMessage: {
        text: rawPreview,
        senderId: args.senderId,
        kind: args.sharePost ? 'share_post' : atts.length ? 'attachment' : 'text',
        at: now,
      },
    });

    for (const row of memberUnread) {
      const { uid, curUnread, convType: rowConvType, convTitle, convAvatarUrl, role } = row;
      const mdoc = doc(membersCol(args.conversationId), uid);
      const nextUnread = uid === args.senderId ? 0 : curUnread + 1;
      tx.set(
        mdoc,
        {
          lastActivityAt: now,
          lastMessagePreview: preview,
          unreadCount: nextUnread,
        },
        { merge: true }
      );
      /**
       * First message is when a DM appears in Recent chats. Include title/avatar so the
       * inbox mirror is complete even if create skipped writing it.
       */
      const inboxPayload: Record<string, unknown> = {
        conversationId: args.conversationId,
        memberUid: uid,
        convType: rowConvType,
        role,
        lastActivityAt: now,
        lastMessagePreview: preview,
        unreadCount: nextUnread,
      };
      if (convTitle) inboxPayload.convTitle = convTitle;
      if (convAvatarUrl !== undefined) inboxPayload.convAvatarUrl = convAvatarUrl;
      if (row.displayNameSnap) inboxPayload.displayNameSnap = row.displayNameSnap;
      tx.set(inboxDoc(uid, args.conversationId), inboxPayload, { merge: true });
    }
    return mref.id;
  });
}

export async function markConversationRead(conversationId: string, uid: string, lastMessageId: string) {
  const mref = doc(membersCol(conversationId), uid);
  const readAt = serverTimestamp();
  await updateDoc(mref, {
    unreadCount: 0,
    lastReadMessageId: lastMessageId,
    lastReadAt: readAt,
  });
  await setDoc(
    inboxDoc(uid, conversationId),
    {
      conversationId,
      memberUid: uid,
      unreadCount: 0,
      lastReadMessageId: lastMessageId,
      lastReadAt: readAt,
    },
    { merge: true }
  );
}

export async function patchMemberRow(
  conversationId: string,
  uid: string,
  patch: Partial<Pick<ConversationMemberRow, 'muted' | 'archived' | 'pinned' | 'chatNotificationsEnabled'>>
) {
  await updateDoc(doc(membersCol(conversationId), uid), patch as Record<string, unknown>);
  await setDoc(
    inboxDoc(uid, conversationId),
    { conversationId, memberUid: uid, ...(patch as Record<string, unknown>) },
    { merge: true }
  );
}

export async function editMessage(conversationId: string, messageId: string, uid: string, nextText: string) {
  const t = nextText.trim();
  if (!t || t.length > CHAT_MAX_MESSAGE_CHARS) throw new Error('Invalid text.');
  await updateDoc(doc(messagesCol(conversationId), messageId), {
    text: t,
    searchText: t.toLowerCase(),
    editedAt: serverTimestamp(),
  });
}

export async function softDeleteForSelf(conversationId: string, messageId: string, uid: string) {
  await updateDoc(doc(messagesCol(conversationId), messageId), {
    deletedForSelfUids: arrayUnion(uid),
  });
}

export async function addReaction(conversationId: string, messageId: string, uid: string, emoji: string) {
  const rid = `${uid}__${emoji.replace(/\//g, '_')}`;
  await setDoc(
    doc(collection(firestore(), P.CONVERSATIONS, conversationId, P.MESSAGES, messageId, P.MESSAGE_REACTIONS), rid),
    { userId: uid, emoji, createdAt: serverTimestamp() }
  );
}

export async function removeReaction(conversationId: string, messageId: string, uid: string, emoji: string) {
  const { deleteDoc } = await import('firebase/firestore');
  const rid = `${uid}__${emoji.replace(/\//g, '_')}`;
  await deleteDoc(
    doc(
      collection(firestore(), P.CONVERSATIONS, conversationId, P.MESSAGES, messageId, P.MESSAGE_REACTIONS),
      rid
    )
  );
}

export function subscribeReactions(
  conversationId: string,
  messageId: string,
  onData: (rows: MessageReaction[]) => void
): Unsubscribe {
  const col = collection(
    firestore(),
    P.CONVERSATIONS,
    conversationId,
    P.MESSAGES,
    messageId,
    P.MESSAGE_REACTIONS
  );
  return onSnapshot(col, (snap) => {
    const rows: MessageReaction[] = [];
    snap.forEach((d) => {
      const x = d.data() as Record<string, unknown>;
      if (x.deleted) return;
      rows.push({
        id: d.id,
        userId: String(x.userId ?? ''),
        emoji: String(x.emoji ?? ''),
        createdAt: (x.createdAt as Timestamp) ?? null,
      });
    });
    onData(rows);
  });
}

export async function reportMessage(args: {
  reporterId: string;
  conversationId: string;
  messageId: string;
  reason: string;
}) {
  await addDoc(collection(firestore(), P.MESSAGE_REPORTS), {
    reporterId: args.reporterId,
    conversationId: args.conversationId,
    messageId: args.messageId,
    reason: String(args.reason ?? '').slice(0, 500),
    createdAt: serverTimestamp(),
  });
}

export async function blockUser(viewerUid: string, blockedUid: string) {
  await setDoc(doc(firestore(), 'users', viewerUid, P.USER_BLOCKS, blockedUid), {
    createdAt: serverTimestamp(),
  });
}

export async function unblockUser(viewerUid: string, blockedUid: string) {
  const { deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(firestore(), 'users', viewerUid, P.USER_BLOCKS, blockedUid));
}

export async function searchMessagesInConversation(conversationId: string, prefix: string, max = 25) {
  const p = prefix.trim().toLowerCase();
  if (!p) return [];
  const q = query(
    collection(firestore(), P.CONVERSATIONS, conversationId, P.MESSAGES),
    orderBy('searchText'),
    where('searchText', '>=', p),
    where('searchText', '<=', `${p}\uf8ff`),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapMessageDoc(d.id, d.data() as Record<string, unknown>));
}

export { CHAT_MESSAGES_PAGE_SIZE };
