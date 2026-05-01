import { runQuery } from "./db.js";
import type { PropertyRecord } from "./types.js";

const cache = new Map<string, string>();

export async function upsertProperty(record: PropertyRecord): Promise<string> {
  const key = `${record.type}|${record.name}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const rows = await runQuery<{ uuid: string }>("insert_property.sql", {
    name: record.name,
    tailwind_class: record.tailwind_class,
    css_style: record.css_style,
    type: record.type,
    origin: record.origin,
    figma_variable_id: record.figma_variable_id ?? null,
  });
  if (!rows[0]?.uuid) throw new Error("insert_property returned no uuid");
  cache.set(key, rows[0].uuid);
  return rows[0].uuid;
}
