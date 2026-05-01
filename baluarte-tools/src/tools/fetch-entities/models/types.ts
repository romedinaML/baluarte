export type EntityKind = "layout" | "molecule" | "atom";

export type LayoutType = "Mobile" | "Desktop" | "All";
export type MoleculeType = "static" | "interactive" | "form";
export type AtomType = "static" | "interactive" | "form";

export type StateType =
  | "hover"
  | "active"
  | "stale"
  | "disabled"
  | "focus"
  | "clicked";

export type PropertyType =
  | "Color"
  | "Spacing"
  | "Font"
  | "Typography"
  | "Positioning"
  | "Grid"
  | "Flex"
  | "Border"
  | "Shadow"
  | "Opacity";

export type PropertyOrigin = "Custom" | "Figma Variable";

export type FigmaNodeType =
  | "DOCUMENT"
  | "CANVAS"
  | "FRAME"
  | "SECTION"
  | "GROUP"
  | "SLICE"
  | "STICKY"
  | "COMPONENT"
  | "COMPONENT_SET"
  | "INSTANCE"
  | "RECTANGLE"
  | "ELLIPSE"
  | "LINE"
  | "VECTOR"
  | "STAR"
  | "POLYGON"
  | "BOOLEAN_OPERATION"
  | "TEXT";

export interface PropertyRecord {
  name: string;
  type: PropertyType;
  css_style: string;
  tailwind_class: string | null;
  origin: PropertyOrigin;
  figma_variable_id?: string | null;
}
