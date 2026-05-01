import { runQuery } from "./db.js";

export interface MoleculeVariantInput {
  molecule_id: string;
  figma_node: string;
  figma_url?: string | null;
  name?: string | null;
  variant?: string | null;
  state_id?: string | null;
}

export async function upsertMoleculeVariant(
  input: MoleculeVariantInput,
): Promise<string> {
  const rows = await runQuery<{ uuid: string }>("insert_molecule_variant.sql", {
    molecule_id: input.molecule_id,
    figma_node: input.figma_node,
    figma_url: input.figma_url ?? null,
    name: input.name ?? null,
    variant: input.variant ?? null,
    state_id: input.state_id ?? null,
  });
  if (!rows[0]?.uuid)
    throw new Error("insert_molecule_variant returned no uuid");
  return rows[0].uuid;
}

export async function deleteMoleculeVariantsByMolecule(
  moleculeId: string,
): Promise<void> {
  await runQuery("delete_molecule_variants_by_molecule.sql", {
    molecule_id: moleculeId,
  });
}
