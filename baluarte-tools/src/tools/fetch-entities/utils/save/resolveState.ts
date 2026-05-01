import { findStateUuidByType } from "../../models/states.js";
import type { StateType } from "../../models/types.js";

const STATES: readonly StateType[] = [
  "hover",
  "active",
  "stale",
  "disabled",
  "focus",
  "clicked",
] as const;

function asStateType(value?: string): StateType | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  return (STATES as readonly string[]).includes(lower)
    ? (lower as StateType)
    : null;
}

export async function resolveState(entry: {
  state?: string;
  variant?: string;
}): Promise<string> {
  const explicit = asStateType(entry.state) ?? asStateType(entry.variant);
  return findStateUuidByType(explicit ?? "stale");
}
