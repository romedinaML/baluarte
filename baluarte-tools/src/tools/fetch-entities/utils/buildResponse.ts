import type { Buckets, Entry, FigmaNodesResponse } from "./types.js";

function resolveBucket(
  entries: Entry[],
  nodesResp: FigmaNodesResponse,
  label: string,
): Entry[] {
  const out: Entry[] = [];
  for (const entry of entries) {
    const node = nodesResp.nodes[entry.node_id];
    if (!node?.document) {
      console.error(
        `[fetch-entities] ${label}: no node fetched for ${entry.node_id}`,
      );
      continue;
    }
    // Annotations sit directly on the entity node — keep node_id as-is.
    // Comments sit on a wrapper, so we strip to the first child to reach
    // the actual component frame. `source` is undefined for legacy callers
    // and defaults to comment-style behavior.
    if (entry.source === "annotation") {
      out.push({ ...entry });
      continue;
    }
    const firstChild = node.document.children?.[0];
    if (!firstChild) {
      console.error(
        `[fetch-entities] ${label}: no first child for comment-host node ${entry.node_id}`,
      );
      continue;
    }
    out.push({ ...entry, node_id: firstChild.id });
  }
  return out;
}

export function buildResponse(
  buckets: Buckets,
  nodesResp: FigmaNodesResponse,
): Buckets {
  return {
    layouts: resolveBucket(buckets.layouts, nodesResp, "layouts"),
    molecules: resolveBucket(buckets.molecules, nodesResp, "molecules"),
    atoms: resolveBucket(buckets.atoms, nodesResp, "atoms"),
  };
}
