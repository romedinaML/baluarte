import { runQuery } from "./db.js";
import type { EntityKind } from "./types.js";

export interface UpsertPageInput {
  file_key: string;
  edited_at?: string | null;
}

/**
 * Upsert a `pages` row keyed by `file_key`. Returns the page uuid. The
 * underlying insert_page.sql is idempotent on `file_key`.
 *
 * Semantics: `pages.edited_at` mirrors the file's `lastModified` from the
 * `/v1/files/{key}/nodes` response (file-wide timestamp). See SKILL.md.
 */
export async function upsertPage(input: UpsertPageInput): Promise<string> {
  const rows = await runQuery<{ uuid: string }>("insert_page.sql", {
    file_key: input.file_key,
    edited_at: input.edited_at ?? null,
  });
  if (!rows[0]?.uuid) throw new Error("insert_page returned no uuid");
  return rows[0].uuid;
}

export async function linkPageChild(
  pageId: string,
  childId: string,
  childType: EntityKind,
): Promise<void> {
  await runQuery("link_page_child.sql", {
    page_id: pageId,
    child_id: childId,
    child_type: childType,
  });
}
