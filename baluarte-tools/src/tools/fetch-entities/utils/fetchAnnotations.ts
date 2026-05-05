import { FIGMA_API_URL, getFigmaToken } from "./env.js";
import type { FigmaAnnotation, FigmaNode } from "./types.js";

/**
 * Annotations are a per-node property in Figma's plugin API
 * (https://developers.figma.com/docs/plugins/api/Annotation/) and they
 * surface in the REST API only inline on the node — there is NO flat
 * `/v1/files/{key}/annotations` endpoint.
 *
 * To collect every annotation we fetch the full file document
 * (`GET /v1/files/{key}`) once and walk every node depth-first, harvesting
 * any non-empty `annotations` array. Each annotation gets the host node's
 * id attached and the file's `lastModified` substituted for `modified_at`
 * (Figma doesn't include a per-annotation timestamp on the REST response).
 *
 * Errors are surfaced to stderr and the function returns an empty array so
 * the rest of the pipeline runs comments-only — same graceful-degradation
 * pattern as the variables endpoint.
 */
export async function fetchAnnotations(
  fileId: string,
): Promise<FigmaAnnotation[]> {
  const url = `${FIGMA_API_URL}/v1/files/${fileId}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "X-Figma-Token": getFigmaToken() },
    });
  } catch (err) {
    process.stderr.write(
      `[fetch-entities] full-file fetch threw for ${fileId}: ${String(err)}\n`,
    );
    return [];
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    process.stderr.write(
      `[fetch-entities] full-file fetch returned ${res.status} for ${fileId}: ${body.slice(0, 200)}\n`,
    );
    return [];
  }
  const json = (await res.json().catch(() => ({}))) as {
    document?: FigmaNode;
    lastModified?: string;
  };
  if (!json.document) return [];
  const fileLastModified = json.lastModified;

  const out: FigmaAnnotation[] = [];
  let nodesVisited = 0;
  let annotationsFound = 0;

  function walk(node: FigmaNode): void {
    nodesVisited++;
    const annotations = node.annotations;
    if (Array.isArray(annotations) && annotations.length > 0) {
      for (const ann of annotations) {
        annotationsFound++;
        out.push({
          ...ann,
          node_id: node.id,
          // Figma doesn't ship a per-annotation timestamp; the walker
          // substitutes the file-level lastModified so downstream diff
          // logic has *some* freshness signal.
          ...(fileLastModified && !("modifiedAt" in ann)
            ? ({ modifiedAt: fileLastModified } as Partial<FigmaAnnotation>)
            : {}),
        });
      }
    }
    for (const child of node.children ?? []) walk(child);
  }
  walk(json.document);

  if (annotationsFound === 0) {
    process.stderr.write(
      `[fetch-entities] no annotations found in ${fileId} (walked ${nodesVisited} nodes)\n`,
    );
  } else {
    process.stderr.write(
      `[fetch-entities] found ${annotationsFound} annotations across ${fileId} (walked ${nodesVisited} nodes)\n`,
    );
  }
  return out;
}
