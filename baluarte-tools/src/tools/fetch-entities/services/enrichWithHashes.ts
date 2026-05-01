import { contentDiffHash } from "../utils/contentDiffHash.js";
import type { Buckets, Entry, FigmaNodesResponse } from "../utils/types.js";
import type { FreshEntities } from "./fetchEntityNodes.js";

function enrichEntry(entry: Entry, fresh: FigmaNodesResponse): void {
  const node = fresh.nodes[entry.node_id]?.document;
  entry.content_diff_hash = contentDiffHash(node);
  for (const variant of entry.variants ?? []) {
    const vNode = fresh.nodes[variant.node_id]?.document;
    variant.content_diff_hash = contentDiffHash(vNode);
  }
}

/**
 * Adds `content_diff_hash` to every entry (and variant) using the deep node
 * payload returned by fetchEntityNodes. Mutates the buckets in place so the
 * tool response surfaces both timestamps: comment `updated_at` and the
 * design-content hash.
 */
export function enrichWithHashes(
  entitiesToUpdate: Buckets,
  fresh: FreshEntities,
): void {
  for (const e of entitiesToUpdate.layouts) enrichEntry(e, fresh.layouts);
  for (const e of entitiesToUpdate.molecules) enrichEntry(e, fresh.molecules);
  for (const e of entitiesToUpdate.atoms) enrichEntry(e, fresh.atoms);
}
