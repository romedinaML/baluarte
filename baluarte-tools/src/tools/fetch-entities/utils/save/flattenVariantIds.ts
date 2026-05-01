import type { Entry } from "../types.js";

export function flattenVariantIds(entries: Entry[]): string[] {
  const out: string[] = [];
  for (const e of entries) {
    out.push(e.node_id);
    for (const v of e.variants ?? []) out.push(v.node_id);
  }
  return out;
}
