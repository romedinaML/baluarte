#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { registerFetchEntities } from "./tools/fetch-entities/index.js";

const server = new McpServer({
  name: "baluarte-tools",
  version: "0.0.1",
});

server.registerTool(
  "ping",
  {
    title: "Ping",
    description: "Health check that echoes a message back.",
    inputSchema: { message: z.string().optional() },
  },
  async ({ message }) => ({
    content: [{ type: "text", text: `pong: ${message ?? "hello"}` }],
  }),
);

registerFetchEntities(server);

const transport = new StdioServerTransport();
await server.connect(transport);
