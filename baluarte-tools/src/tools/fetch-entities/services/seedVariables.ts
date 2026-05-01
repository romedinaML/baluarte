import { upsertProperty } from "../models/properties.js";
import { fetchLocalVariables } from "../utils/fetchLocalVariables.js";
import { mapVariableToProperty } from "../utils/mapVariableToProperty.js";

/**
 * Seeds `properties` rows with origin='Figma Variable' from
 * `/v1/files/{key}/variables/local`. Runs first in the pipeline so that
 * extractProperties (in saveInMemory) can — in a follow-up iteration —
 * resolve `boundVariables` references to existing property rows.
 *
 * Failures to fetch (403 on non-Enterprise plans) are swallowed: we log to
 * stderr and the rest of the pipeline continues with Custom-only properties.
 */
export async function seedVariables(fileId: string): Promise<void> {
  const resp = await fetchLocalVariables(fileId);
  if (!resp) return;
  const { variables, variableCollections } = resp.meta;
  let inserted = 0;
  let skipped = 0;
  for (const variable of Object.values(variables)) {
    const collection = variableCollections[variable.variableCollectionId];
    const record = mapVariableToProperty(variable, collection);
    if (!record) {
      skipped += 1;
      continue;
    }
    await upsertProperty(record);
    inserted += 1;
  }
  console.error(
    `[fetch-entities] seeded ${inserted} Figma variable(s) into properties (${skipped} skipped — unsupported type/scope).`,
  );
}
