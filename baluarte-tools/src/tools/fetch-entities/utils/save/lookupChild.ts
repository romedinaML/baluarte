import type { FigmaNode } from "../types.js";

/**
 * Resolve a registered entity for a Figma child. INSTANCE nodes carry their
 * own per-instance id under `child.id`, but the registry is keyed by the
 * MASTER component id which lives at `child.componentId`. Try componentId
 * first — that's the master — then fall back to the node's own id (handles
 * the case where the child IS a COMPONENT/COMPONENT_SET directly).
 */
export function lookupChild<T>(
  map: Map<string, T>,
  child: FigmaNode,
): T | undefined {
  if (child.componentId) {
    const byComponent = map.get(child.componentId);
    if (byComponent) return byComponent;
  }
  return map.get(child.id);
}
