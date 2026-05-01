import type { FigmaComment, TaggedComment } from "./types.js";

/**
 * For each tagged root comment, replaces message and created_at with the
 * latest comment in its thread (root id + replies whose parent_id === root.id).
 * Single O(n) pass to build the latest-per-thread index, then O(t) to apply.
 */
export function applyLatestReply(
  tagged: TaggedComment[],
  all: FigmaComment[],
): TaggedComment[] {
  const latest = new Map<string, FigmaComment>();
  for (const c of all) {
    const rootId = c.parent_id ? c.parent_id : c.id;
    const prev = latest.get(rootId);
    if (!prev || (c.created_at ?? "") > (prev.created_at ?? "")) {
      latest.set(rootId, c);
    }
  }

  return tagged.map(({ comment, kind }) => {
    const tip = latest.get(comment.id) ?? comment;
    return {
      kind,
      comment: {
        ...comment,
        message: tip.message,
        created_at: tip.created_at,
      },
    };
  });
}
