const FLAG_RE = /--(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;

export interface ParsedFlags {
  name: string;
  variant?: string;
  state?: string;
  description?: string;
}

/**
 * Strips every --key=value flag (quoted or bare) from the input. Recognized
 * flags (variant, state, description) are returned alongside the cleaned name;
 * unknown flags are dropped entirely. Whitespace is collapsed and trimmed.
 *
 * Multi-word values must be quoted: --description="this component max-width
 * should be of size 300px". Unquoted values stop at the first whitespace.
 */
export function parseFlags(text: string): ParsedFlags {
  let variant: string | undefined;
  let state: string | undefined;
  let description: string | undefined;
  const cleaned = text
    .replace(FLAG_RE, (_, key: string, q?: string, sq?: string, u?: string) => {
      const val = q ?? sq ?? u ?? "";
      if (key === "variant") variant = val;
      else if (key === "state") state = val;
      else if (key === "description") description = val;
      return "";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { name: cleaned, variant, state, description };
}
