import type { Buckets, Entry, FigmaNode, FigmaNodesResponse } from "./types.js";

/**
 * For a COMPONENT_SET anchor, build the molecule entry whose `variants`
 * array carries one row per child COMPONENT. Returns `null` if the set
 * has no COMPONENT children (degenerate file shape).
 *
 * The parent entry keeps the SET's id as `node_id` so the `figma_nodes`
 * row records the canonical COMPONENT_SET; per-variant rows are written
 * by `saveMolecule.persistVariants` from the `variants` array. The
 * variant `name` is the Figma variant property string verbatim
 * (e.g. `State=Default`); downstream `resolveState` parses it.
 */
function expandComponentSet(entry: Entry, setNode: FigmaNode): Entry | null {
  const variants: Entry[] = (setNode.children ?? [])
    .filter((c) => c.type === "COMPONENT")
    .map((c) => ({
      ...entry,
      node_id: c.id,
      name: c.name ?? entry.name,
      variant: c.name ?? undefined,
    }));
  if (variants.length === 0) return null;
  return { ...entry, variants };
}

function resolveBucket(
  entries: Entry[],
  nodesResp: FigmaNodesResponse,
  label: string,
): Entry[] {
  const out: Entry[] = [];
  for (const entry of entries) {
    const node = nodesResp.nodes[entry.node_id];
    const doc = node?.document;
    if (!doc) {
      console.error(
        `[fetch-entities] ${label}: no node fetched for ${entry.node_id}`,
      );
      continue;
    }

    // Annotations sit directly on the entity node — keep node_id as-is.
    if (entry.source === "annotation") {
      out.push({ ...entry });
      continue;
    }

    // Comment-anchor disambiguation. Three cases:
    //
    //   1. COMPONENT_SET — the anchor IS the entity. Expand its variants
    //      from sibling COMPONENT children. Fixes the set-anchored bug
    //      where the legacy walk-down would have landed on children[0]
    //      and registered a single variant instead of the set.
    //
    //   2. COMPONENT / INSTANCE — the anchor IS a real entity. Use as-is.
    //      Note: walking UP from a child COMPONENT inside a COMPONENT_SET
    //      to its parent set is NOT performed here — that would require
    //      fetching the file's parent map. For multi-variant components,
    //      anchor the comment on the COMPONENT_SET frame.
    //
    //   3. Otherwise (FRAME, GROUP, ...) — assume the anchor is a wrapper
    //      around the real entity and walk down to children[0]. Preserves
    //      the legacy "comment on a wrapper frame" path.
    if (doc.type === "COMPONENT_SET") {
      const expanded = expandComponentSet(entry, doc);
      if (!expanded) {
        console.error(
          `[fetch-entities] ${label}: COMPONENT_SET ${entry.node_id} has no COMPONENT children`,
        );
        continue;
      }
      out.push(expanded);
      continue;
    }

    if (doc.type === "COMPONENT" || doc.type === "INSTANCE") {
      out.push({ ...entry });
      continue;
    }

    const firstChild = doc.children?.[0];
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
