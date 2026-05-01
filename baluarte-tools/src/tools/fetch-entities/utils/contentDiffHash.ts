import { createHash } from "node:crypto";
import type { FigmaNode } from "./types.js";

/**
 * SHA-256 fingerprint of a Figma document node. Used as `content_diff_hash` on
 * the entity tables so we can detect design changes — Figma's REST API does
 * not expose a per-node lastModified, so hashing the fetched JSON is the
 * substitute. See .claude/skills/baluarte-remember/SKILL.md → "content_diff_hash".
 */
export function contentDiffHash(node: FigmaNode | undefined | null): string | null {
  if (!node) return null;
  return createHash("sha256").update(JSON.stringify(node)).digest("hex");
}
