import { saveAtom } from "../utils/save/saveAtom.js";
import { saveLayout } from "../utils/save/saveLayout.js";
import { saveMolecule } from "../utils/save/saveMolecule.js";
import type { Buckets } from "../utils/types.js";
import type { FreshEntities } from "./fetchEntityNodes.js";
import { loadSaveContext } from "./saveContext.js";

export async function saveInMemory(
  fileId: string,
  fresh: FreshEntities,
  entitiesToUpdate: Buckets,
): Promise<void> {
  const ctx = await loadSaveContext();
  for (const entry of entitiesToUpdate.atoms) {
    await saveAtom(fileId, entry, fresh.atoms, ctx);
  }
  for (const entry of entitiesToUpdate.molecules) {
    await saveMolecule(fileId, entry, fresh.molecules, ctx);
  }
  for (const entry of entitiesToUpdate.layouts) {
    await saveLayout(fileId, entry, fresh.layouts, ctx);
  }
}
