import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchComments } from "./utils/fetchComments.js";
import { filterComments } from "./utils/filterComments.js";
import { applyLatestReply } from "./utils/applyLatestReply.js";
import { bucketComments } from "./utils/bucketComments.js";
import { fetchNodes } from "./utils/fetchNodes.js";
import { buildResponse } from "./utils/buildResponse.js";
import { groupVariants } from "./utils/groupVariants.js";

export function registerFetchEntities(server: McpServer): void {
  server.registerTool(
    "baluarte-fetch-entities",
    {
      title: "Baluarte fetch entities from Figma",
      description:
        "Reads comments from a Figma file, keeps the ones tagged /baluarte-layout, /baluarte-molecule, or /baluarte-atom, then resolves each tagged node to its first child and returns three buckets.",
      inputSchema: { FIGMA_FILE: z.string().min(1) },
    },
    async ({ FIGMA_FILE }) => {
      const all = await fetchComments(FIGMA_FILE);
      const tagged = filterComments(all);
      const withLatest = applyLatestReply(tagged, all);
      const buckets = bucketComments(withLatest);
      const allIds = [
        ...buckets.layouts,
        ...buckets.molecules,
        ...buckets.atoms,
      ].map((e) => e.node_id);
      const nodesResp = await fetchNodes(FIGMA_FILE, allIds);
      const result = groupVariants(buildResponse(buckets, nodesResp));
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
