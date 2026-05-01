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

export interface Entry {
  node_id: string;
  name?: string;
  updated_at?: string;
  content_diff_hash?: string | null;
  variant?: string;
  state?: string;
  variants?: Entry[];
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
}

export interface FigmaNodeEntry {
  document: FigmaNode;
  lastModified?: string;
}

export interface FigmaNodesResponse {
  nodes: Record<string, FigmaNodeEntry | null>;
  lastModified?: string;
}
