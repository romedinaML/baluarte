export type Kind = "layout" | "molecule" | "atom";

export interface FigmaComment {
  id: string;
  parent_id?: string;
  message: string;
  created_at?: string;
  client_meta?: {
    node_id?: string;
    node_offset?: { x: number; y: number };
  } | null;
}

export interface TaggedComment {
  comment: FigmaComment;
  kind: Kind;
}

/**
 * Mirrors Figma's plugin Annotation interface
 * (https://developers.figma.com/docs/plugins/api/Annotation/). Annotations
 * are a per-node property exposed in the file tree response — there is NO
 * standalone /annotations REST endpoint. The MCP fetches the full file
 * document and walks each node's `annotations` array.
 *
 * `node_id` is attached by the walker (the host node's id) — Figma itself
 * doesn't include it on the inline annotation object since it's implicit
 * from the parent.
 *
 * `label` is the plain-text annotation body; `labelMarkdown` is the
 * Markdown-formatted equivalent. Either may be empty depending on how the
 * annotation was authored in Figma.
 */
export interface FigmaAnnotation {
  node_id?: string;
  label?: string;
  labelMarkdown?: string;
  categoryId?: string;
  properties?: Array<{ type?: string; value?: string }>;
}

export interface TaggedAnnotation {
  annotation: FigmaAnnotation;
  kind: Kind;
  /** Resolved free-form text (labelMarkdown ?? label), already non-null. */
  text: string;
  /** Host node id, attached by the file-tree walker. */
  node_id: string;
  /**
   * Annotations don't carry their own modified timestamp on the Figma side,
   * so the walker substitutes the file-level `lastModified`. This gives the
   * dirty-set diff in `validateExistance` file-grained granularity for
   * annotation-sourced entries (still better than no timestamp at all).
   */
  modified_at?: string;
}

export type EntrySource = "comment" | "annotation";

export interface Entry {
  node_id: string;
  name?: string;
  updated_at?: string;
  content_diff_hash?: string | null;
  variant?: string;
  state?: string;
  description?: string;
  variants?: Entry[];
  /**
   * Provenance of this entry. Comments are attached to a wrapper node, so
   * `buildResponse` strips to `children[0]` to reach the actual entity.
   * Annotations are attached directly to the entity node, so the strip is
   * skipped. Default treatment when `source` is undefined is "comment" for
   * backward compatibility.
   */
  source?: EntrySource;
}

export interface Buckets {
  layouts: Entry[];
  molecules: Entry[];
  atoms: Entry[];
}

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface FigmaPaint {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
}

export interface FigmaEffect {
  type: string;
  visible?: boolean;
  radius?: number;
  spread?: number;
  offset?: { x: number; y: number };
  color?: FigmaColor;
}

export interface FigmaTypeStyle {
  fontFamily?: string;
  fontPostScriptName?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeightPx?: number;
  letterSpacing?: number;
  textCase?: string;
  textDecoration?: string;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
}

export interface FigmaNode {
  id: string;
  name?: string;
  type?: string;
  lastModified?: string;
  visible?: boolean;
  opacity?: number;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number];
  effects?: FigmaEffect[];
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  style?: FigmaTypeStyle;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  componentId?: string;
  children?: FigmaNode[];
  annotations?: FigmaAnnotation[];
}

export interface FigmaNodeEntry {
  document: FigmaNode;
  lastModified?: string;
}

export interface FigmaNodesResponse {
  nodes: Record<string, FigmaNodeEntry | null>;
  lastModified?: string;
}
