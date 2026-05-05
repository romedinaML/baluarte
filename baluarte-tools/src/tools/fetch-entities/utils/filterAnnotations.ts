import { TAG_RE } from "./filterComments.js";
import type { FigmaAnnotation, Kind, TaggedAnnotation } from "./types.js";

/**
 * Same matcher as filterComments — keeps any annotation whose label or
 * labelMarkdown contains `/baluarte-(layout|molecule|atom)`. Drops annotations
 * missing a host node_id (the walker should always attach one; if it's missing
 * something is wrong upstream).
 *
 * Per Figma's plugin API the annotation body lives in `label` (plain text) or
 * `labelMarkdown` (Markdown formatted). Either may be empty depending on how
 * the annotation was authored, so we read both and prefer markdown when set.
 */
export function filterAnnotations(all: FigmaAnnotation[]): TaggedAnnotation[] {
  const out: TaggedAnnotation[] = [];
  for (const annotation of all) {
    const text =
      (annotation.labelMarkdown && annotation.labelMarkdown.trim()) ||
      (annotation.label && annotation.label.trim()) ||
      "";
    if (!text) continue;
    const match = TAG_RE.exec(text);
    if (!match) continue;
    const node_id = annotation.node_id;
    if (!node_id) {
      process.stderr.write(
        `[fetch-entities] skipping annotation: walker did not attach node_id\n`,
      );
      continue;
    }
    // The walker also tucks the file-level `lastModified` onto the annotation
    // as `modifiedAt` (Figma itself doesn't include a per-annotation timestamp
    // on the REST response). It's set on a Partial<FigmaAnnotation>, so cast
    // and read defensively.
    const modified_at =
      (annotation as { modifiedAt?: string }).modifiedAt;
    out.push({
      annotation,
      kind: match[1].toLowerCase() as Kind,
      text,
      node_id,
      modified_at,
    });
  }
  return out;
}
