import { listAtomsByFigmaNode } from "../models/atoms.js";
import { listLayoutsByFigmaNode } from "../models/layouts.js";
import { listMoleculesByFigmaNode } from "../models/molecules.js";

export interface SaveContext {
  layouts: Map<string, string>;
  molecules: Map<string, string>;
  atoms: Map<string, string>;
}

function toUuidMap(
  raw: Map<string, { uuid: string; edited_at: string | null }>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of raw) out.set(k, v.uuid);
  return out;
}

export async function loadSaveContext(): Promise<SaveContext> {
  const [layouts, molecules, atoms] = await Promise.all([
    listLayoutsByFigmaNode(),
    listMoleculesByFigmaNode(),
    listAtomsByFigmaNode(),
  ]);
  return {
    layouts: toUuidMap(layouts),
    molecules: toUuidMap(molecules),
    atoms: toUuidMap(atoms),
  };
}
