import { linkPageChild, upsertPage } from "../models/pages.js";
import type { Buckets, Entry } from "../utils/types.js";
import type { SaveContext } from "./saveContext.js";

/**
 * Final pipeline step: persist the file-level `pages` row (stamped with
 * `file.lastModified`) and link every just-saved entity into `pages_registry`.
 *
 * Granularity: one `pages` row per FILE (per the schema's UNIQUE(file_key)).
 * Per-canvas grouping is intentionally not modeled here — see the design doc
 * for the rationale. Repeated calls are safe: insert_page upserts on file_key
 * and link_page_child is idempotent on (page_id, child_type, child_id).
 */
export async function savePage(
  fileId: string,
  lastModified: string | null,
  entitiesToUpdate: Buckets,
  ctx: SaveContext,
): Promise<void> {
  const pageUuid = await upsertPage({
    file_key: fileId,
    edited_at: lastModified,
  });
  await linkBucket(pageUuid, entitiesToUpdate.atoms, ctx.atoms, "atom");
  await linkBucket(
    pageUuid,
    entitiesToUpdate.molecules,
    ctx.molecules,
    "molecule",
  );
  await linkBucket(pageUuid, entitiesToUpdate.layouts, ctx.layouts, "layout");
}

async function linkBucket(
  pageUuid: string,
  entries: Entry[],
  resolver: Map<string, string>,
  childType: "atom" | "molecule" | "layout",
): Promise<void> {
  for (const entry of entries) {
    const uuid = resolver.get(entry.node_id);
    if (!uuid) {
      console.error(
        `[savePage] no ${childType} uuid for figma_node ${entry.node_id} (skipping registry link)`,
      );
      continue;
    }
    await linkPageChild(pageUuid, uuid, childType);
  }
}
