import { FIGMA_API_URL, getFigmaToken } from "./env.js";

export interface FigmaVariableAlias {
  type: "VARIABLE_ALIAS";
  id: string;
}

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export type VariableValue =
  | number
  | string
  | boolean
  | FigmaColor
  | FigmaVariableAlias;

export interface FigmaVariable {
  id: string;
  name: string;
  key: string;
  variableCollectionId: string;
  resolvedType: "BOOLEAN" | "FLOAT" | "STRING" | "COLOR";
  valuesByMode: Record<string, VariableValue>;
  scopes: string[];
  remote?: boolean;
  hiddenFromPublishing?: boolean;
  description?: string;
}

export interface FigmaVariableCollection {
  id: string;
  name: string;
  key: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
  variableIds: string[];
  remote?: boolean;
  hiddenFromPublishing?: boolean;
}

export interface LocalVariablesResponse {
  status?: number;
  error?: boolean;
  meta: {
    variables: Record<string, FigmaVariable>;
    variableCollections: Record<string, FigmaVariableCollection>;
  };
}

/** `null` means the file plan does not expose Variables (403). */
export async function fetchLocalVariables(
  fileId: string,
): Promise<LocalVariablesResponse | null> {
  const url = `${FIGMA_API_URL}/v1/files/${fileId}/variables/local`;
  const res = await fetch(url, {
    headers: { "X-Figma-Token": getFigmaToken() },
  });
  if (res.status === 403) {
    console.error(
      `[fetch-entities] Variables API unavailable for ${fileId} (403). ` +
        `Skipping variable seeding — requires Enterprise/Org plan.`,
    );
    return null;
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Figma local variables request failed: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as LocalVariablesResponse;
}
