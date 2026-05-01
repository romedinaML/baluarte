import { runQuery } from "./db.js";
import type { StateType } from "./types.js";

const cache = new Map<StateType, string>();

export async function findStateUuidByType(type: StateType): Promise<string> {
  const cached = cache.get(type);
  if (cached) return cached;
  const rows = await runQuery<{ uuid: string; type: StateType }>(
    "select_state_by_type.sql",
    { type },
  );
  if (!rows[0]?.uuid) throw new Error(`state '${type}' not found in DB`);
  cache.set(type, rows[0].uuid);
  return rows[0].uuid;
}
