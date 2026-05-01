import { runQuery } from "./db.js";
import type { EntityKind, FigmaNodeType } from "./types.js";

export interface UpsertFigmaNodeInput {
  figma_node: string;
  figma_url: string;
  reference_id: string;
  reference_type: EntityKind;
  type: FigmaNodeType | null;
}

export async function upsertFigmaNode(
  input: UpsertFigmaNodeInput,
): Promise<string> {
  const rows = await runQuery<{ uuid: string }>("insert_figma_node.sql", {
    figma_node: input.figma_node,
    figma_url: input.figma_url,
    reference_id: input.reference_id,
    reference_type: input.reference_type,
    type: input.type,
  });
  if (!rows[0]?.uuid) throw new Error("insert_figma_node returned no uuid");
  return rows[0].uuid;
}

export function buildFigmaUrl(fileId: string, nodeId: string): string {
  return `https://www.figma.com/file/${fileId}?node-id=${encodeURIComponent(
    nodeId,
  )}`;
}
