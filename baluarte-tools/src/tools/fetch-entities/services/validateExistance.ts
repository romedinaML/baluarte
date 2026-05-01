import { listAtomsByFigmaNode } from "../models/atoms.js";
import { listLayoutsByFigmaNode } from "../models/layouts.js";
import { listMoleculesByFigmaNode } from "../models/molecules.js";
import type { Buckets, Entry } from "../utils/types.js";

interface DiffRow {
  edited_at: string | null;
  content_diff_hash: string | null;
}

function diffBucket(entries: Entry[], existing: Map<string, DiffRow>): Entry[] {
  const out: Entry[] = [];
  for (const entry of entries) {
    const known = existing.get(entry.node_id);
    if (!known) {
      out.push(entry);
      continue;
    }
    const commentChanged = known.edited_at !== (entry.updated_at ?? null);
    // entry.content_diff_hash is computed later (post deep-fetch). At this
    // step we only know the comment timestamp, so we keep entries whose
    // comment changed. Design-only changes are picked up on the next
    // comment touch — acceptable per the user-driven workflow.
    if (commentChanged) out.push(entry);
  }
  return out;
}

export async function validateExistance(entities: Buckets): Promise<Buckets> {
  const [layouts, molecules, atoms] = await Promise.all([
    listLayoutsByFigmaNode(),
    listMoleculesByFigmaNode(),
    listAtomsByFigmaNode(),
  ]);
  return {
    layouts: diffBucket(entities.layouts, layouts),
    molecules: diffBucket(entities.molecules, molecules),
    atoms: diffBucket(entities.atoms, atoms),
  };
}
