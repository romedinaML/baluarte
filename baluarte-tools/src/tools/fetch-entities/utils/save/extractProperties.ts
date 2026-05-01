import type { PropertyRecord } from "../../models/types.js";
import type { FigmaColor, FigmaNode, FigmaPaint } from "../types.js";

function toHex(c: number): string {
  const v = Math.max(0, Math.min(255, Math.round(c * 255)));
  return v.toString(16).padStart(2, "0");
}

function colorToRgba(color: FigmaColor, paintOpacity = 1): string {
  const a = (color.a ?? 1) * paintOpacity;
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return a >= 1
    ? `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`
    : `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

function colorKey(color: FigmaColor, paintOpacity = 1): string {
  const a = Math.round((color.a ?? 1) * paintOpacity * 1000);
  return `${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}-${a}`;
}

function firstSolidPaint(paints?: FigmaPaint[]): FigmaPaint | null {
  if (!paints) return null;
  for (const p of paints) {
    if (p.visible === false) continue;
    if (p.type === "SOLID" && p.color) return p;
  }
  return null;
}

function extractColor(node: FigmaNode, out: PropertyRecord[]): void {
  const fill = firstSolidPaint(node.fills);
  if (fill?.color) {
    const role = node.type === "TEXT" ? "fg" : "bg";
    const cssProp = role === "fg" ? "color" : "background-color";
    const value = colorToRgba(fill.color, fill.opacity ?? 1);
    out.push({
      name: `Color-${role}-${colorKey(fill.color, fill.opacity ?? 1)}`,
      type: "Color",
      css_style: `${cssProp}: ${value}`,
      tailwind_class: null,
      origin: "Custom",
    });
  }
}

function extractBorder(node: FigmaNode, out: PropertyRecord[]): void {
  const stroke = firstSolidPaint(node.strokes);
  if (stroke?.color && (node.strokeWeight ?? 0) > 0) {
    const value = colorToRgba(stroke.color, stroke.opacity ?? 1);
    const weight = node.strokeWeight ?? 1;
    out.push({
      name: `Border-${weight}-${colorKey(stroke.color, stroke.opacity ?? 1)}`,
      type: "Border",
      css_style: `border: ${weight}px solid ${value}`,
      tailwind_class: null,
      origin: "Custom",
    });
  }
  if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
    out.push({
      name: `Border-radius-${node.cornerRadius}`,
      type: "Border",
      css_style: `border-radius: ${node.cornerRadius}px`,
      tailwind_class: null,
      origin: "Custom",
    });
  } else if (node.rectangleCornerRadii) {
    const [tl, tr, br, bl] = node.rectangleCornerRadii;
    out.push({
      name: `Border-radius-${tl}-${tr}-${br}-${bl}`,
      type: "Border",
      css_style: `border-radius: ${tl}px ${tr}px ${br}px ${bl}px`,
      tailwind_class: null,
      origin: "Custom",
    });
  }
}

function extractSpacing(node: FigmaNode, out: PropertyRecord[]): void {
  const sides: Array<["top" | "right" | "bottom" | "left", number | undefined]> = [
    ["top", node.paddingTop],
    ["right", node.paddingRight],
    ["bottom", node.paddingBottom],
    ["left", node.paddingLeft],
  ];
  for (const [side, value] of sides) {
    if (value !== undefined && value !== 0) {
      out.push({
        name: `Spacing-pad-${side}-${value}`,
        type: "Spacing",
        css_style: `padding-${side}: ${value}px`,
        tailwind_class: null,
        origin: "Custom",
      });
    }
  }
  if (node.itemSpacing !== undefined && node.itemSpacing !== 0) {
    out.push({
      name: `Spacing-gap-${node.itemSpacing}`,
      type: "Spacing",
      css_style: `gap: ${node.itemSpacing}px`,
      tailwind_class: null,
      origin: "Custom",
    });
  }
}

function extractFlex(node: FigmaNode, out: PropertyRecord[]): void {
  if (node.layoutMode && node.layoutMode !== "NONE") {
    const direction = node.layoutMode === "HORIZONTAL" ? "row" : "column";
    out.push({
      name: `Flex-${direction}`,
      type: "Flex",
      css_style: `display: flex; flex-direction: ${direction}`,
      tailwind_class: null,
      origin: "Custom",
    });
  }
}

function extractTypography(node: FigmaNode, out: PropertyRecord[]): void {
  const s = node.style;
  if (!s) return;
  const family = s.fontFamily ?? "inherit";
  const weight = s.fontWeight ?? 400;
  const size = s.fontSize ?? 0;
  const line = s.lineHeightPx;
  const css = [
    `font-family: "${family}"`,
    `font-weight: ${weight}`,
    size ? `font-size: ${size}px` : "",
    line ? `line-height: ${line}px` : "",
    s.letterSpacing
      ? `letter-spacing: ${Number(s.letterSpacing.toFixed(3))}px`
      : "",
  ]
    .filter(Boolean)
    .join("; ");
  out.push({
    name: `Typography-${family}-${weight}-${size}-${line ?? "auto"}`,
    type: "Typography",
    css_style: css,
    tailwind_class: null,
    origin: "Custom",
  });
}

function extractShadows(node: FigmaNode, out: PropertyRecord[]): void {
  for (const eff of node.effects ?? []) {
    if (eff.visible === false) continue;
    if (eff.type !== "DROP_SHADOW" && eff.type !== "INNER_SHADOW") continue;
    if (!eff.color) continue;
    const ox = eff.offset?.x ?? 0;
    const oy = eff.offset?.y ?? 0;
    const blur = eff.radius ?? 0;
    const spread = eff.spread ?? 0;
    const value = colorToRgba(eff.color, 1);
    const inset = eff.type === "INNER_SHADOW" ? "inset " : "";
    out.push({
      name: `Shadow-${eff.type}-${ox}-${oy}-${blur}-${spread}-${colorKey(eff.color, 1)}`,
      type: "Shadow",
      css_style: `box-shadow: ${inset}${ox}px ${oy}px ${blur}px ${spread}px ${value}`,
      tailwind_class: null,
      origin: "Custom",
    });
  }
}

function extractOpacity(node: FigmaNode, out: PropertyRecord[]): void {
  if (node.opacity !== undefined && node.opacity < 1) {
    const pct = Math.round(node.opacity * 100);
    out.push({
      name: `Opacity-${pct}`,
      type: "Opacity",
      css_style: `opacity: ${node.opacity}`,
      tailwind_class: null,
      origin: "Custom",
    });
  }
}

export function extractProperties(node: FigmaNode): PropertyRecord[] {
  const out: PropertyRecord[] = [];
  extractColor(node, out);
  extractBorder(node, out);
  extractSpacing(node, out);
  extractFlex(node, out);
  extractTypography(node, out);
  extractShadows(node, out);
  extractOpacity(node, out);
  const seen = new Set<string>();
  return out.filter((p) => {
    const k = `${p.type}::${p.name}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
