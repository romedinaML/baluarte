import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { enrichWithHashes } from "./services/enrichWithHashes.js";
import { fetchEntityNodes } from "./services/fetchEntityNodes.js";
import { getEntitiesFromFigma } from "./services/getEntitiesFromFigma.js";
import { loadSaveContext } from "./services/saveContext.js";
import { saveInMemory } from "./services/saveInMemory.js";
import { savePage } from "./services/savePage.js";
import { seedVariables } from "./services/seedVariables.js";
import { validateExistance } from "./services/validateExistance.js";

export function registerFetchEntities(server: McpServer): void {
  server.registerTool(
    "baluarte-fetch-entities",
    {
      title: "Baluarte fetch entities from Figma",
      description:
        "Seeds Figma local variables, reads tagged Figma comments, diffs them against .data/baluarte.db, deep-fetches the changed nodes, hashes their content, persists layouts/molecules/atoms with variants/properties/relationships, and links them into pages_registry. Returns the diff that was applied.",
      inputSchema: { FIGMA_FILE: z.string().min(1) },
    },
    async ({ FIGMA_FILE }) => {
      await seedVariables(FIGMA_FILE);
      const entities = await getEntitiesFromFigma(FIGMA_FILE);
      const entitiesToUpdate = await validateExistance(entities);
      const fresh = await fetchEntityNodes(FIGMA_FILE, entitiesToUpdate);
      enrichWithHashes(entitiesToUpdate, fresh);
      const ctx = await loadSaveContext();
      await saveInMemory(FIGMA_FILE, fresh, entitiesToUpdate, ctx);
      const lastModified =
        fresh.layouts.lastModified ??
        fresh.molecules.lastModified ??
        fresh.atoms.lastModified ??
        null;
      await savePage(FIGMA_FILE, lastModified, entitiesToUpdate, ctx);
      return {
        content: [
          { type: "text", text: JSON.stringify(entitiesToUpdate, null, 2) },
        ],
      };
    },
  );
}
