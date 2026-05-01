import { insertAtom, updateAtom } from "../../models/atoms.js";
import {
  deleteAtomVariantsByAtom,
  upsertAtomVariant,
} from "../../models/atomVariants.js";
import { buildFigmaUrl, upsertFigmaNode } from "../../models/figmaNodes.js";
import { upsertProperty } from "../../models/properties.js";
import { linkAtomProperty } from "../../models/relationships.js";
import { findStateUuidByType } from "../../models/states.js";
import type { FigmaNodeType, StateType } from "../../models/types.js";
import type { SaveContext } from "../../services/saveContext.js";
import type { Entry, FigmaNodesResponse, FigmaNode } from "../types.js";
import { extractProperties } from "./extractProperties.js";
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

async function variantStateUuid(
  variant: Entry,
): Promise<string | null> {
  const key = asStateType(variant.state) ?? asStateType(variant.variant);
  if (!key) return null;
  return findStateUuidByType(key);
}

async function upsertAtomEntity(
  fileId: string,
  entry: Entry,
  node: FigmaNode,
  ctx: SaveContext,
): Promise<string> {
  let uuid = ctx.atoms.get(node.id) ?? null;
  if (!uuid) {
    uuid = await insertAtom({
      name: entry.name ?? node.name ?? "Unnamed atom",
      type: "static",
      description: null,
      edited_at: entry.updated_at ?? null,
      content_diff_hash: entry.content_diff_hash ?? null,
      storybook_id: null,
    });
    ctx.atoms.set(node.id, uuid);
  } else {
    await updateAtom(uuid, {
      name: entry.name ?? node.name ?? null,
      edited_at: entry.updated_at ?? null,
      content_diff_hash: entry.content_diff_hash ?? null,
    });
  }
  await upsertFigmaNode({
    figma_node: node.id,
    figma_url: buildFigmaUrl(fileId, node.id),
    reference_id: uuid,
    reference_type: "atom",
    type: (node.type ?? null) as FigmaNodeType | null,
  });
  return uuid;
}

async function persistVariantProperties(
  atomUuid: string,
  node: FigmaNode,
  state: { state?: string; variant?: string },
): Promise<void> {
  const stateUuid = await resolveState(state);
  for (const record of extractProperties(node)) {
    const propertyUuid = await upsertProperty(record);
    await linkAtomProperty(atomUuid, propertyUuid, stateUuid);
  }
}

async function persistVariants(
  fileId: string,
  atomUuid: string,
  variants: Entry[],
  fresh: FigmaNodesResponse,
): Promise<void> {
  await deleteAtomVariantsByAtom(atomUuid);
  for (const variant of variants) {
    const variantNode = fresh.nodes[variant.node_id]?.document;
    if (!variantNode) {
      console.error(`[saveAtom] no fresh variant node for ${variant.node_id}`);
      continue;
    }
    const stateId = await variantStateUuid(variant);
    await upsertAtomVariant({
      atom_id: atomUuid,
      figma_node: variant.node_id,
      figma_url: buildFigmaUrl(fileId, variant.node_id),
      name: variant.name ?? variantNode.name ?? null,
      variant: variant.variant ?? null,
      state_id: stateId,
    });
    await persistVariantProperties(atomUuid, variantNode, variant);
  }
}

export async function saveAtom(
  fileId: string,
  entry: Entry,
  fresh: FigmaNodesResponse,
  ctx: SaveContext,
): Promise<void> {
  const node = fresh.nodes[entry.node_id]?.document;
  if (!node) {
    console.error(`[saveAtom] no fresh node for ${entry.node_id}`);
    return;
  }
  const atomUuid = await upsertAtomEntity(fileId, entry, node, ctx);
  await persistVariantProperties(atomUuid, node, entry);
  await persistVariants(fileId, atomUuid, entry.variants ?? [], fresh);
}
