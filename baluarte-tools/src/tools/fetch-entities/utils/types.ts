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
  variant?: string;
  state?: string;
  variants?: Entry[];
}

export interface Buckets {
  layouts: Entry[];
  molecules: Entry[];
  atoms: Entry[];
}

export interface FigmaNode {
  id: string;
  name?: string;
  type?: string;
  lastModified?: string;
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
