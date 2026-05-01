import { runQuery } from "./db.js";
import type { LayoutType } from "./types.js";

interface LayoutRow {
  figma_node: string;
  uuid: string;
  edited_at: string | null;
  content_diff_hash: string | null;
}

export interface LayoutDiffRow {
  uuid: string;
  edited_at: string | null;
  content_diff_hash: string | null;
}

export async function listLayoutsByFigmaNode(): Promise<
  Map<string, LayoutDiffRow>
> {
  const rows = await runQuery<LayoutRow>("list_layouts_with_figma_node.sql");
  const out = new Map<string, LayoutDiffRow>();
  for (const r of rows) {
    out.set(r.figma_node, {
      uuid: r.uuid,
      edited_at: r.edited_at,
      content_diff_hash: r.content_diff_hash,
    });
  }
  return out;
}

export async function findLayoutUuidByFigmaNode(
  figmaNode: string,
): Promise<string | null> {
  const rows = await runQuery<{ uuid: string }>(
    "select_layout_uuid_by_figma_node.sql",
    { figma_node: figmaNode },
  );
  return rows[0]?.uuid ?? null;
}

export interface InsertLayoutInput {
  name: string;
  type: LayoutType;
  description?: string | null;
  edited_at?: string | null;
  content_diff_hash?: string | null;
  storybook_id?: string | null;
}

export async function insertLayout(input: InsertLayoutInput): Promise<string> {
  const rows = await runQuery<{ uuid: string }>("insert_layout.sql", {
    name: input.name,
    storybook_id: input.storybook_id ?? null,
    description: input.description ?? null,
    edited_at: input.edited_at ?? null,
    content_diff_hash: input.content_diff_hash ?? null,
    type: input.type,
  });
  if (!rows[0]?.uuid) throw new Error("insert_layout returned no uuid");
  return rows[0].uuid;
}

export interface UpdateLayoutPatch {
  name?: string | null;
  storybook_id?: string | null;
  description?: string | null;
  edited_at?: string | null;
  content_diff_hash?: string | null;
  type?: LayoutType | null;
}

export async function updateLayout(
  uuid: string,
  patch: UpdateLayoutPatch,
): Promise<void> {
  await runQuery("update_layout.sql", {
    uuid,
    name: patch.name ?? null,
    storybook_id: patch.storybook_id ?? null,
    description: patch.description ?? null,
    edited_at: patch.edited_at ?? null,
    content_diff_hash: patch.content_diff_hash ?? null,
    type: patch.type ?? null,
  });
}
