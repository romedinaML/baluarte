import { runQuery } from "./db.js";
import type { MoleculeType } from "./types.js";

interface MoleculeRow {
  figma_node: string;
  uuid: string;
  edited_at: string | null;
  content_diff_hash: string | null;
}

export interface MoleculeDiffRow {
  uuid: string;
  edited_at: string | null;
  content_diff_hash: string | null;
}

export async function listMoleculesByFigmaNode(): Promise<
  Map<string, MoleculeDiffRow>
> {
  const rows = await runQuery<MoleculeRow>(
    "list_molecules_with_figma_node.sql",
  );
  const out = new Map<string, MoleculeDiffRow>();
  for (const r of rows) {
    out.set(r.figma_node, {
      uuid: r.uuid,
      edited_at: r.edited_at,
      content_diff_hash: r.content_diff_hash,
    });
  }
  return out;
}

export async function findMoleculeUuidByFigmaNode(
  figmaNode: string,
): Promise<string | null> {
  const rows = await runQuery<{ uuid: string }>(
    "select_molecule_uuid_by_figma_node.sql",
    { figma_node: figmaNode },
  );
  return rows[0]?.uuid ?? null;
}

export interface InsertMoleculeInput {
  name: string;
  type: MoleculeType;
  description?: string | null;
  edited_at?: string | null;
  content_diff_hash?: string | null;
  storybook_id?: string | null;
}

export async function insertMolecule(
  input: InsertMoleculeInput,
): Promise<string> {
  const rows = await runQuery<{ uuid: string }>("insert_molecule.sql", {
    name: input.name,
    storybook_id: input.storybook_id ?? null,
    description: input.description ?? null,
    edited_at: input.edited_at ?? null,
    content_diff_hash: input.content_diff_hash ?? null,
    type: input.type,
  });
  if (!rows[0]?.uuid) throw new Error("insert_molecule returned no uuid");
  return rows[0].uuid;
}

export interface UpdateMoleculePatch {
  name?: string | null;
  storybook_id?: string | null;
  description?: string | null;
  edited_at?: string | null;
  content_diff_hash?: string | null;
  type?: MoleculeType | null;
}

export async function updateMolecule(
  uuid: string,
  patch: UpdateMoleculePatch,
): Promise<void> {
  await runQuery("update_molecule.sql", {
    uuid,
    name: patch.name ?? null,
    storybook_id: patch.storybook_id ?? null,
    description: patch.description ?? null,
    edited_at: patch.edited_at ?? null,
    content_diff_hash: patch.content_diff_hash ?? null,
    type: patch.type ?? null,
  });
}
