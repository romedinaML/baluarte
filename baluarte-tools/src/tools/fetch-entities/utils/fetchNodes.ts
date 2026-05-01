import { FIGMA_API_URL, getFigmaToken } from "./env.js";
import type { FigmaNodesResponse } from "./types.js";

export interface FetchNodesOptions {
  depth?: number;
}

export async function fetchNodes(
  fileId: string,
  ids: string[],
  opts: FetchNodesOptions = {},
): Promise<FigmaNodesResponse> {
  if (ids.length === 0) return { nodes: {} };
  const joined = ids.join(",");
  const params = new URLSearchParams({ ids: joined });
  if (opts.depth !== undefined) params.set("depth", String(opts.depth));
  const url = `${FIGMA_API_URL}/v1/files/${fileId}/nodes?${params.toString()}`;
  const res = await fetch(url, {
    headers: { "X-Figma-Token": getFigmaToken() },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Figma nodes request failed: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as FigmaNodesResponse;
}
