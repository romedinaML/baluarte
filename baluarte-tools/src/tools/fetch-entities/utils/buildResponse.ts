import type { Buckets, Entry, FigmaNodesResponse } from "./types.js";

function resolveBucket(
  entries: Entry[],
  nodesResp: FigmaNodesResponse,
  label: string,
): Entry[] {
  const out: Entry[] = [];
  for (const entry of entries) {
    const node = nodesResp.nodes[entry.node_id];
    const firstChild = node?.document?.children?.[0];
    if (!firstChild) {
      console.error(
        `[fetch-entities] ${label}: no first child for node ${entry.node_id}`,
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
