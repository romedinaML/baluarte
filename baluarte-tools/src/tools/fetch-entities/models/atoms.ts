import { runQuery } from "./db.js";
import type { AtomType } from "./types.js";

interface AtomRow {
  figma_node: string;
  uuid: string;
  edited_at: string | null;
  content_diff_hash: string | null;
}

export interface AtomDiffRow {
  uuid: string;
  edited_at: string | null;
  content_diff_hash: string | null;
}

export async function listAtomsByFigmaNode(): Promise<Map<string, AtomDiffRow>> {
  const rows = await runQuery<AtomRow>("list_atoms_with_figma_node.sql");
  const out = new Map<string, AtomDiffRow>();
  for (const r of rows) {
    out.set(r.figma_node, {
      uuid: r.uuid,
      edited_at: r.edited_at,
      content_diff_hash: r.content_diff_hash,
    });
  }
  return out;
}

export async function findAtomUuidByFigmaNode(
  figmaNode: string,
): Promise<string | null> {
  const rows = await runQuery<{ uuid: string }>(
    "select_atom_uuid_by_figma_node.sql",
    { figma_node: figmaNode },
  );
  return rows[0]?.uuid ?? null;
}

export interface InsertAtomInput {
  name: string;
  type: AtomType;
  description?: string | null;
  edited_at?: string | null;
  content_diff_hash?: string | null;
  storybook_id?: string | null;
}

export async function insertAtom(input: InsertAtomInput): Promise<string> {
  const rows = await runQuery<{ uuid: string }>("insert_atom.sql", {
    name: input.name,
    storybook_id: input.storybook_id ?? null,
    description: input.description ?? null,
    edited_at: input.edited_at ?? null,
    content_diff_hash: input.content_diff_hash ?? null,
    type: input.type,
  });
  if (!rows[0]?.uuid) throw new Error("insert_atom returned no uuid");
  return rows[0].uuid;
}

export interface UpdateAtomPatch {
  name?: string | null;
  storybook_id?: string | null;
  description?: string | null;
  edited_at?: string | null;
  content_diff_hash?: string | null;
  type?: AtomType | null;
}

export async function updateAtom(
  uuid: string,
  patch: UpdateAtomPatch,
): Promise<void> {
  await runQuery("update_atom.sql", {
    uuid,
    name: patch.name ?? null,
    storybook_id: patch.storybook_id ?? null,
    description: patch.description ?? null,
    edited_at: patch.edited_at ?? null,
    content_diff_hash: patch.content_diff_hash ?? null,
    type: patch.type ?? null,
  });
}
