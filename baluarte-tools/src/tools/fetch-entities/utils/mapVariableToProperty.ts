import type { PropertyRecord, PropertyType } from "../models/types.js";
import type {
  FigmaColor,
  FigmaVariable,
  FigmaVariableCollection,
  VariableValue,
} from "./fetchLocalVariables.js";

const FLOAT_TYPE_BY_SCOPE: Record<string, PropertyType> = {
  CORNER_RADIUS: "Border",
  STROKE_FLOAT: "Border",
  OPACITY: "Opacity",
  FONT_SIZE: "Typography",
  LINE_HEIGHT: "Typography",
  LETTER_SPACING: "Typography",
  PARAGRAPH_SPACING: "Typography",
  PARAGRAPH_INDENT: "Typography",
  FONT_WEIGHT: "Typography",
};

const STRING_FONT_SCOPES = new Set([
  "FONT_FAMILY",
  "FONT_STYLE",
  "FONT_VARIATIONS",
]);

function deriveType(variable: FigmaVariable): PropertyType | null {
  switch (variable.resolvedType) {
    case "COLOR":
      return "Color";
    case "FLOAT": {
      for (const scope of variable.scopes) {
        const mapped = FLOAT_TYPE_BY_SCOPE[scope];
        if (mapped) return mapped;
      }
      return "Spacing";
    }
    case "STRING":
      return variable.scopes.some((s) => STRING_FONT_SCOPES.has(s))
        ? "Font"
        : null;
    case "BOOLEAN":
      return null;
    default:
      return null;
  }
}

function isAlias(value: VariableValue): value is { type: "VARIABLE_ALIAS"; id: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as { type: string }).type === "VARIABLE_ALIAS"
  );
}

function isColor(value: VariableValue): value is FigmaColor {
  return (
    typeof value === "object" &&
    value !== null &&
    "r" in value &&
    "g" in value &&
    "b" in value
  );
}

function toHex(c: number): string {
  const v = Math.max(0, Math.min(255, Math.round(c * 255)));
  return v.toString(16).padStart(2, "0");
}

function renderColor(c: FigmaColor): string {
  const a = c.a ?? 1;
  if (a >= 1) return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

function renderValue(value: VariableValue, resolvedType: string): string {
  if (isAlias(value)) return `value: alias(${value.id})`;
  if (resolvedType === "COLOR" && isColor(value)) {
    return `value: ${renderColor(value)}`;
  }
  if (resolvedType === "FLOAT" && typeof value === "number") {
    return `value: ${value}px`;
  }
  if (resolvedType === "STRING" && typeof value === "string") {
    return `value: "${value}"`;
  }
  return `value: ${JSON.stringify(value)}`;
}

export function mapVariableToProperty(
  variable: FigmaVariable,
  collection: FigmaVariableCollection | undefined,
): PropertyRecord | null {
  const type = deriveType(variable);
  if (!type) return null;
  const modeId = collection?.defaultModeId ?? Object.keys(variable.valuesByMode)[0];
  const value = modeId ? variable.valuesByMode[modeId] : undefined;
  const css_style =
    value === undefined
      ? "value: <unset>"
      : renderValue(value, variable.resolvedType);
  return {
    name: variable.name,
    type,
    css_style,
    tailwind_class: null,
    origin: "Figma Variable",
    figma_variable_id: variable.id,
  };
}
