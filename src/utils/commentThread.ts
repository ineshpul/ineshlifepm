import type { VideoComment } from '../types/videoComment';

/** Horizontal indent per nesting level (keep in sync with comment row UI). */
export const THREAD_INDENT = 16;

/** One row in the flattened thread (roots + nested replies in display order). */
export type ThreadedComment = {
  comment: VideoComment;
  /** 0 = top-level; 1+ = nested under ancestor(s). */
  depth: number;
};

/** Flat list for rendering: real rows plus optional “View replies” affordance. */
export type ThreadDisplayRow =
  | { kind: 'comment'; entry: ThreadedComment }
  | {
      kind: 'collapsed';
      threadRootId: string;
      hiddenEntries: ThreadedComment[];
      /** Left indent (matches first hidden reply depth). */
      indentDepth: number;
    };

/** Collapse when a root has more than this many total nested replies (not counting the root). */
const COLLAPSE_REPLY_COUNT_THRESHOLD = 3;

/** When collapsed, how many leading replies to show before the “View replies” row. */
const COLLAPSED_LEADING_REPLY_COUNT = 2;

function splitThreadBlocks(threaded: ThreadedComment[]): ThreadedComment[][] {
  const blocks: ThreadedComment[][] = [];
  let current: ThreadedComment[] = [];
  for (const row of threaded) {
    if (row.depth === 0) {
      if (current.length) blocks.push(current);
      current = [row];
    } else {
      current.push(row);
    }
  }
  if (current.length) blocks.push(current);
  return blocks;
}

/**
 * Inserts a “View N replies” row when a thread has more than 3 nested comments,
 * unless that root is marked expanded in `expandedThreads`.
 */
export function buildThreadDisplayList(
  threaded: ThreadedComment[],
  expandedThreads: Record<string, boolean>
): ThreadDisplayRow[] {
  const blocks = splitThreadBlocks(threaded);
  const out: ThreadDisplayRow[] = [];
  for (const block of blocks) {
    if (block.length === 0) continue;
    const [root, ...replies] = block;
    out.push({ kind: 'comment', entry: root });
    if (replies.length === 0) continue;
    const rootId = root.comment.id;
    const expanded = Boolean(expandedThreads[rootId]);
    const shouldCollapse =
      replies.length > COLLAPSE_REPLY_COUNT_THRESHOLD && !expanded;
    if (shouldCollapse) {
      const leading = replies.slice(0, COLLAPSED_LEADING_REPLY_COUNT);
      const hidden = replies.slice(COLLAPSED_LEADING_REPLY_COUNT);
      for (const e of leading) out.push({ kind: 'comment', entry: e });
      const indentDepth = hidden.length ? Math.min(...hidden.map((h) => h.depth)) : 1;
      out.push({
        kind: 'collapsed',
        threadRootId: rootId,
        hiddenEntries: hidden,
        indentDepth,
      });
    } else {
      for (const e of replies) out.push({ kind: 'comment', entry: e });
    }
  }
  return out;
}

/** Walk `replyToCommentId` until no parent exists in `byId` (ultimate thread root). */
function ultimateRoot(c: VideoComment, byId: Map<string, VideoComment>): VideoComment {
  let cur: VideoComment = c;
  const seen = new Set<string>();
  while (cur.replyToCommentId) {
    const p = byId.get(cur.replyToCommentId);
    if (!p) break;
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    cur = p;
  }
  return cur;
}

/**
 * Groups every comment under its **ultimate** top-level root (so reply-to-reply
 * stays in the same thread for collapse counts), then DFS in time order.
 */
export function flattenCommentsForThread(comments: VideoComment[]): ThreadedComment[] {
  if (comments.length === 0) return [];
  const byId = new Map(comments.map((c) => [c.id, c]));

  const groups = new Map<string, VideoComment[]>();
  for (const c of comments) {
    const root = ultimateRoot(c, byId);
    const arr = groups.get(root.id) ?? [];
    arr.push(c);
    groups.set(root.id, arr);
  }

  const rootIds = [...groups.keys()].sort((a, b) => {
    const ra = byId.get(a)!;
    const rb = byId.get(b)!;
    return ra.at - rb.at;
  });

  const children = new Map<string, VideoComment[]>();
  const out: ThreadedComment[] = [];

  for (const rootId of rootIds) {
    const group = groups.get(rootId)!;
    const groupIds = new Set(group.map((x) => x.id));

    children.clear();
    for (const c of group) {
      if (c.id === rootId) continue;
      const pid = c.replyToCommentId;
      const parentId = pid && groupIds.has(pid) ? pid : rootId;
      const arr = children.get(parentId) ?? [];
      arr.push(c);
      children.set(parentId, arr);
    }
    for (const arr of children.values()) {
      arr.sort((a, b) => a.at - b.at);
    }

    const root = byId.get(rootId)!;
    out.push({ comment: root, depth: 0 });

    function walkReplies(parentId: string, depth: number) {
      const kids = children.get(parentId) ?? [];
      for (const k of kids) {
        out.push({ comment: k, depth });
        walkReplies(k.id, depth + 1);
      }
    }
    walkReplies(rootId, 1);
  }

  return out;
}
