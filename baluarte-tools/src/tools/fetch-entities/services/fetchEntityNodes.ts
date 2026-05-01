import { fetchNodes } from "../utils/fetchNodes.js";
import { flattenVariantIds } from "../utils/save/flattenVariantIds.js";
import type { Buckets, FigmaNodesResponse } from "../utils/types.js";

export interface FreshEntities {
  layouts: FigmaNodesResponse;
  molecules: FigmaNodesResponse;
  atoms: FigmaNodesResponse;
}

export async function fetchEntityNodes(
  fileId: string,
  entitiesToUpdate: Buckets,
): Promise<FreshEntities> {
  const [layouts, molecules, atoms] = await Promise.all([
    fetchNodes(fileId, flattenVariantIds(entitiesToUpdate.layouts)),
    fetchNodes(fileId, flattenVariantIds(entitiesToUpdate.molecules)),
    fetchNodes(fileId, flattenVariantIds(entitiesToUpdate.atoms)),
  ]);
  return { layouts, molecules, atoms };
}
