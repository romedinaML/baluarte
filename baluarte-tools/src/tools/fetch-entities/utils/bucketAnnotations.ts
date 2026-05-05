import { TAG_RE } from "./filterComments.js";
import { parseFlags } from "./parseFlags.js";
import type { Buckets, Entry, TaggedAnnotation } from "./types.js";

/**
 * Annotations are flat (no thread/reply concept). We strip the `/baluarte-*`
 * tag, parse flags, and route into the matching kind bucket. The annotation's
 * modified_at becomes the entry's updated_at so the existing diff-by-timestamp
 * rule in validateExistance still works.
 */
export function bucketAnnotations(tagged: TaggedAnnotation[]): Buckets {
  const buckets: Buckets = { layouts: [], molecules: [], atoms: [] };
  for (const { kind, text, node_id, modified_at } of tagged) {
    const stripped = text.replace(TAG_RE, "");
    const { name, variant, state, description } = parseFlags(stripped);
    const entry: Entry = { node_id, source: "annotation" };
    if (modified_at) entry.updated_at = modified_at;
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
