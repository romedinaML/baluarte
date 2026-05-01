import { FIGMA_API_URL, getFigmaToken } from "./env.js";
import type { FigmaComment } from "./types.js";

export async function fetchComments(fileId: string): Promise<FigmaComment[]> {
  const res = await fetch(`${FIGMA_API_URL}/v1/files/${fileId}/comments`, {
    headers: { "X-Figma-Token": getFigmaToken() },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Figma comments request failed: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as { comments: FigmaComment[] };
  return json.comments ?? [];
}
