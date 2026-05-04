import { TAG_RE } from "./filterComments.js";
import { parseFlags } from "./parseFlags.js";
import type { Buckets, Entry, TaggedComment } from "./types.js";

export function bucketComments(tagged: TaggedComment[]): Buckets {
  const buckets: Buckets = { layouts: [], molecules: [], atoms: [] };
  for (const { comment, kind } of tagged) {
    const node_id = comment.client_meta?.node_id;
    if (!node_id) {
      console.error(
        `[fetch-entities] skipping comment ${comment.id}: no client_meta.node_id`,
      );
      continue;
    }
    const stripped = (comment.message ?? "").replace(TAG_RE, "");
    const { name, variant, state, description } = parseFlags(stripped);
    const entry: Entry = { node_id, updated_at: comment.created_at };
    if (name) entry.name = name;
    if (variant) entry.variant = variant;
    if (state) entry.state = state;
    if (description) entry.description = description;
    if (kind === "layout") buckets.layouts.push(entry);
    else if (kind === "molecule") buckets.molecules.push(entry);
    else buckets.atoms.push(entry);
  }
  return buckets;
}
