/** Hashtag tokens in Best Part captions (`#bpotd`, `#Sunday`). */
const HASHTAG_TOKEN = /#([a-zA-Z0-9_]{1,40})/gu;

export const BEST_PART_MAX_HASHTAGS = 12;

export type CaptionTextPart =
  | { kind: 'text'; value: string }
  | { kind: 'hashtag'; tag: string };

/** Normalized unique tags (lowercase, no `#`), display order. */
export function parseCaptionHashtags(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of String(text ?? '').matchAll(HASHTAG_TOKEN)) {
    const raw = match[1];
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= BEST_PART_MAX_HASHTAGS) break;
  }
  return out;
}

export function splitCaptionWithHashtags(text: string): CaptionTextPart[] {
  const source = String(text ?? '');
  const parts: CaptionTextPart[] = [];
  let lastIndex = 0;
  for (const match of source.matchAll(HASHTAG_TOKEN)) {
    const index = match.index ?? 0;
    const tag = match[1];
    if (!tag) continue;
    if (index > lastIndex) {
      parts.push({ kind: 'text', value: source.slice(lastIndex, index) });
    }
    parts.push({ kind: 'hashtag', tag });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < source.length) {
    parts.push({ kind: 'text', value: source.slice(lastIndex) });
  }
  return parts.length ? parts : [{ kind: 'text', value: source }];
}
