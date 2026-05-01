import { buildFigmaUrl, upsertFigmaNode } from "../../models/figmaNodes.js";
import { insertMolecule, updateMolecule } from "../../models/molecules.js";
import {
  deleteMoleculeVariantsByMolecule,
  upsertMoleculeVariant,
} from "../../models/moleculeVariants.js";
import { upsertProperty } from "../../models/properties.js";
import {
  deleteMoleculesRegistryByMolecule,
  linkMoleculeChild,
  linkMoleculeProperty,
} from "../../models/relationships.js";
import { findStateUuidByType } from "../../models/states.js";
import type { FigmaNodeType, StateType } from "../../models/types.js";
import type { SaveContext } from "../../services/saveContext.js";
import type { Entry, FigmaNodesResponse, FigmaNode } from "../types.js";
import { extractProperties } from "./extractProperties.js";
import { lookupChild } from "./lookupChild.js";
import { resolveState } from "./resolveState.js";

const STATE_KEYS: readonly StateType[] = [
  "hover",
  "active",
  "stale",
  "disabled",
  "focus",
  "clicked",
] as const;

function asStateType(value?: string | null): StateType | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  return (STATE_KEYS as readonly string[]).includes(lower)
    ? (lower as StateType)
    : null;
}

async function variantStateUuid(variant: Entry): Promise<string | null> {
  const key = asStateType(variant.state) ?? asStateType(variant.variant);
  if (!key) return null;
  return findStateUuidByType(key);
}

async function upsertMoleculeEntity(
  fileId: string,
  entry: Entry,
  node: FigmaNode,
  ctx: SaveContext,
): Promise<string> {
  let uuid = ctx.molecules.get(node.id) ?? null;
  if (!uuid) {
    uuid = await insertMolecule({
      name: entry.name ?? node.name ?? "Unnamed molecule",
      type: "static",
      description: null,
      edited_at: entry.updated_at ?? null,
      content_diff_hash: entry.content_diff_hash ?? null,
      storybook_id: null,
    });
    ctx.molecules.set(node.id, uuid);
  } else {
    await updateMolecule(uuid, {
      name: entry.name ?? node.name ?? null,
      edited_at: entry.updated_at ?? null,
      content_diff_hash: entry.content_diff_hash ?? null,
    });
  }
  await upsertFigmaNode({
    figma_node: node.id,
    figma_url: buildFigmaUrl(fileId, node.id),
    reference_id: uuid,
    reference_type: "molecule",
    type: (node.type ?? null) as FigmaNodeType | null,
  });
  return uuid;
}

async function persistVariantProperties(
  moleculeUuid: string,
  node: FigmaNode,
  state: { state?: string; variant?: string },
): Promise<void> {
  const stateUuid = await resolveState(state);
  for (const record of extractProperties(node)) {
    const propertyUuid = await upsertProperty(record);
    await linkMoleculeProperty(moleculeUuid, propertyUuid, stateUuid);
  }
}

function collectAtomDescendants(
  node: FigmaNode,
  ctx: SaveContext,
): string[] {
  const linked = new Set<string>();
  function walk(n: FigmaNode): void {
    for (const child of n.children ?? []) {
      const atomUuid = lookupChild(ctx.atoms, child);
      if (atomUuid && !linked.has(atomUuid)) linked.add(atomUuid);
      walk(child);
    }
  }
  walk(node);
  return [...linked];
}

async function persistVariants(
  fileId: string,
  moleculeUuid: string,
  variants: Entry[],
  fresh: FigmaNodesResponse,
): Promise<void> {
  await deleteMoleculeVariantsByMolecule(moleculeUuid);
  for (const variant of variants) {
    const variantNode = fresh.nodes[variant.node_id]?.document;
    if (!variantNode) continue;
    const stateId = await variantStateUuid(variant);
    await upsertMoleculeVariant({
      molecule_id: moleculeUuid,
      figma_node: variant.node_id,
      figma_url: buildFigmaUrl(fileId, variant.node_id),
      name: variant.name ?? variantNode.name ?? null,
      variant: variant.variant ?? null,
      state_id: stateId,
    });
  }
}

export async function saveMolecule(
  fileId: string,
  entry: Entry,
  fresh: FigmaNodesResponse,
  ctx: SaveContext,
): Promise<void> {
  const node = fresh.nodes[entry.node_id]?.document;
  if (!node) {
    console.error(`[saveMolecule] no fresh node for ${entry.node_id}`);
    return;
  }
  const moleculeUuid = await upsertMoleculeEntity(fileId, entry, node, ctx);
  await persistVariantProperties(moleculeUuid, node, entry);
  await deleteMoleculesRegistryByMolecule(moleculeUuid);
  const childIds = new Set<string>(collectAtomDescendants(node, ctx));
  for (const variant of entry.variants ?? []) {
    const variantNode = fresh.nodes[variant.node_id]?.document;
    if (!variantNode) {
      console.error(
        `[saveMolecule] no fresh variant node for ${variant.node_id}`,
      );
      continue;
    }
    await persistVariantProperties(moleculeUuid, variantNode, variant);
    for (const id of collectAtomDescendants(variantNode, ctx)) childIds.add(id);
  }
  for (const atomUuid of childIds) {
    await linkMoleculeChild(moleculeUuid, atomUuid, null);
  }
  await persistVariants(fileId, moleculeUuid, entry.variants ?? [], fresh);
}
