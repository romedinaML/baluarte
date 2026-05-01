import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { enrichWithHashes } from "./services/enrichWithHashes.js";
import { fetchEntityNodes } from "./services/fetchEntityNodes.js";
import { getEntitiesFromFigma } from "./services/getEntitiesFromFigma.js";
import { saveInMemory } from "./services/saveInMemory.js";
import { validateExistance } from "./services/validateExistance.js";

export function registerFetchEntities(server: McpServer): void {
  server.registerTool(
    "baluarte-fetch-entities",
    {
      title: "Baluarte fetch entities from Figma",
      description:
        "Reads tagged Figma comments, diffs them against .data/baluarte.db, deep-fetches the changed nodes, hashes their content, and persists layouts/molecules/atoms (with variants, properties, and relationships). Returns the diff that was applied.",
      inputSchema: { FIGMA_FILE: z.string().min(1) },
    },
    async ({ FIGMA_FILE }) => {
      const entities = await getEntitiesFromFigma(FIGMA_FILE);
      const entitiesToUpdate = await validateExistance(entities);
      const fresh = await fetchEntityNodes(FIGMA_FILE, entitiesToUpdate);
      enrichWithHashes(entitiesToUpdate, fresh);
      await saveInMemory(FIGMA_FILE, fresh, entitiesToUpdate);
      return {
        content: [
          { type: "text", text: JSON.stringify(entitiesToUpdate, null, 2) },
        ],
      };
    },
  );
}
