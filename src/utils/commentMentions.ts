import { usernameClaimDocId } from './usernameSearch';

/** Matches @handle tokens in comment text (handles use a-z, 0-9, _). */
const MENTION_TOKEN = /@([a-zA-Z0-9_]{1,40})/gu;

export type MentionUser = {
  uid: string;
  username: string;
};

export type CommentTextPart =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; username: string };

export type ActiveMentionQuery = {
  /** Index of `@` in the draft string. */
  start: number;
  /** Characters typed after `@` (may be empty). */
  query: string;
};

/** Active @-mention being typed at `cursor` (if any). */
export function getActiveMentionQuery(text: string, cursor: number): ActiveMentionQuery | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const before = text.slice(0, safeCursor);
  const atIndex = before.lastIndexOf('@');
  if (atIndex < 0) return null;
  if (atIndex > 0 && !/\s/u.test(before[atIndex - 1] ?? '')) return null;
  const query = before.slice(atIndex + 1);
  if (!/^[a-zA-Z0-9_]*$/u.test(query)) return null;
  return { start: atIndex, query };
}

/** Replace the in-progress @query with a completed `@username ` token. */
export function insertMentionAtCursor(args: {
  text: string;
  mentionStart: number;
  cursor: number;
  username: string;
}): { text: string; cursor: number } {
  const clean = String(args.username ?? '')
    .replace(/^@+/u, '')
    .trim();
  const before = args.text.slice(0, args.mentionStart);
  const after = args.text.slice(args.cursor);
  const insert = `@${clean} `;
  const text = `${before}${insert}${after}`;
  return { text, cursor: before.length + insert.length };
}

/** Unique @handles in display order (case-insensitive dedupe via usernameLower key). */
export function parseMentionUsernames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(MENTION_TOKEN)) {
    const raw = match[1];
    if (!raw) continue;
    const key = usernameClaimDocId(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

export function buildMentionLookup(mentionedUsers?: MentionUser[]): Map<string, MentionUser> {
  const map = new Map<string, MentionUser>();
  for (const user of mentionedUsers ?? []) {
    const key = usernameClaimDocId(user.username);
    if (!key) continue;
    map.set(key, user);
  }
  return map;
}

export function splitCommentTextWithMentions(text: string): CommentTextPart[] {
  const parts: CommentTextPart[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(MENTION_TOKEN)) {
    const index = match.index ?? 0;
    const username = match[1];
    if (!username) continue;
    if (index > lastIndex) {
      parts.push({ kind: 'text', value: text.slice(lastIndex, index) });
    }
    parts.push({ kind: 'mention', username });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ kind: 'text', value: text.slice(lastIndex) });
  }
  return parts.length ? parts : [{ kind: 'text', value: text }];
}
