import { buildFigmaUrl, upsertFigmaNode } from "../../models/figmaNodes.js";
import { insertLayout, updateLayout } from "../../models/layouts.js";
import { upsertProperty } from "../../models/properties.js";
import {
  deleteLayoutRegistryByLayout,
  linkLayoutChild,
  linkLayoutProperty,
} from "../../models/relationships.js";
import type { FigmaNodeType, LayoutType } from "../../models/types.js";
import type { SaveContext } from "../../services/saveContext.js";
import type { Entry, FigmaNodesResponse, FigmaNode } from "../types.js";
import { extractProperties } from "./extractProperties.js";
import { lookupChild } from "./lookupChild.js";

function deriveLayoutType(_node: FigmaNode | null): LayoutType {
  return "All";
}

async function upsertLayoutEntity(
  fileId: string,
  entry: Entry,
  node: FigmaNode,
  ctx: SaveContext,
): Promise<string> {
  let uuid = ctx.layouts.get(node.id) ?? null;
  if (!uuid) {
    uuid = await insertLayout({
      name: entry.name ?? node.name ?? "Unnamed layout",
      type: deriveLayoutType(node),
      description: null,
      edited_at: entry.updated_at ?? null,
      content_diff_hash: entry.content_diff_hash ?? null,
      storybook_id: null,
    });
    ctx.layouts.set(node.id, uuid);
  } else {
    await updateLayout(uuid, {
      name: entry.name ?? node.name ?? null,
      edited_at: entry.updated_at ?? null,
      content_diff_hash: entry.content_diff_hash ?? null,
    });
  }
  await upsertFigmaNode({
    figma_node: node.id,
    figma_url: buildFigmaUrl(fileId, node.id),
    reference_id: uuid,
    reference_type: "layout",
    type: (node.type ?? null) as FigmaNodeType | null,
  });
  return uuid;
}

async function persistLayoutProperties(
  layoutUuid: string,
  node: FigmaNode,
): Promise<void> {
  for (const record of extractProperties(node)) {
    const propertyUuid = await upsertProperty(record);
    await linkLayoutProperty(layoutUuid, propertyUuid);
  }
}

interface DescendantHits {
  molecules: Set<string>;
  atoms: Set<string>;
}

function collectDescendants(node: FigmaNode, ctx: SaveContext): DescendantHits {
  const hits: DescendantHits = {
    molecules: new Set<string>(),
    atoms: new Set<string>(),
  };
  function walk(n: FigmaNode): void {
    for (const child of n.children ?? []) {
      const moleculeUuid = lookupChild(ctx.molecules, child);
      if (moleculeUuid) {
        hits.molecules.add(moleculeUuid);
        continue;
      }
      const atomUuid = lookupChild(ctx.atoms, child);
      if (atomUuid) {
        hits.atoms.add(atomUuid);
        continue;
      }
      walk(child);
    }
  }
  walk(node);
  return hits;
}

export async function saveLayout(
  fileId: string,
  entry: Entry,
  fresh: FigmaNodesResponse,
  ctx: SaveContext,
): Promise<void> {
  const node = fresh.nodes[entry.node_id]?.document;
  if (!node) {
    console.error(`[saveLayout] no fresh node for ${entry.node_id}`);
    return;
  }
  const layoutUuid = await upsertLayoutEntity(fileId, entry, node, ctx);
  await persistLayoutProperties(layoutUuid, node);
  await deleteLayoutRegistryByLayout(layoutUuid);
  const merged: DescendantHits = {
    molecules: new Set<string>(),
    atoms: new Set<string>(),
  };
  const primary = collectDescendants(node, ctx);
  primary.molecules.forEach((id) => merged.molecules.add(id));
  primary.atoms.forEach((id) => merged.atoms.add(id));
  for (const variant of entry.variants ?? []) {
    const variantNode = fresh.nodes[variant.node_id]?.document;
    if (!variantNode) {
      console.error(
        `[saveLayout] no fresh variant node for ${variant.node_id}`,
      );
      continue;
    }
    await persistLayoutProperties(layoutUuid, variantNode);
    const hits = collectDescendants(variantNode, ctx);
    hits.molecules.forEach((id) => merged.molecules.add(id));
    hits.atoms.forEach((id) => merged.atoms.add(id));
  }
  for (const moleculeUuid of merged.molecules) {
    await linkLayoutChild(layoutUuid, moleculeUuid, "molecule", null);
  }
  for (const atomUuid of merged.atoms) {
    await linkLayoutChild(layoutUuid, atomUuid, "atom", null);
  }
}
