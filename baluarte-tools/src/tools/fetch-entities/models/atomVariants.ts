import { runQuery } from "./db.js";

export interface AtomVariantInput {
  atom_id: string;
  figma_node: string;
  figma_url?: string | null;
  name?: string | null;
  variant?: string | null;
  state_id?: string | null;
}

export async function upsertAtomVariant(
  input: AtomVariantInput,
): Promise<string> {
  const rows = await runQuery<{ uuid: string }>("insert_atom_variant.sql", {
    atom_id: input.atom_id,
    figma_node: input.figma_node,
    figma_url: input.figma_url ?? null,
    name: input.name ?? null,
    variant: input.variant ?? null,
    state_id: input.state_id ?? null,
  });
  if (!rows[0]?.uuid) throw new Error("insert_atom_variant returned no uuid");
  return rows[0].uuid;
}

export async function deleteAtomVariantsByAtom(atomId: string): Promise<void> {
  await runQuery("delete_atom_variants_by_atom.sql", { atom_id: atomId });
}
