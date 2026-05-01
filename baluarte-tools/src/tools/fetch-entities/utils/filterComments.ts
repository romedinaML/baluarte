import type { FigmaComment, Kind, TaggedComment } from "./types.js";

export const TAG_RE = /\/baluarte-(layout|molecule|atom)\b/i;

export function filterComments(all: FigmaComment[]): TaggedComment[] {
  const out: TaggedComment[] = [];
  for (const comment of all) {
    const match = TAG_RE.exec(comment?.message ?? "");
    if (!match) continue;
    out.push({ comment, kind: match[1].toLowerCase() as Kind });
  }
  return out;
}
