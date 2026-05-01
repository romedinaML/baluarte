import { FIGMA_API_URL, getFigmaToken } from "./env.js";
import type { FigmaNodesResponse } from "./types.js";

export async function fetchNodes(
  fileId: string,
  ids: string[],
): Promise<FigmaNodesResponse> {
  if (ids.length === 0) return { nodes: {} };
  const joined = ids.join(",");
  const url = `${FIGMA_API_URL}/v1/files/${fileId}/nodes?ids=${encodeURIComponent(joined)}&depth=1`;
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
