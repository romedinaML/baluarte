import type { Buckets, Entry } from "./types.js";

/**
 * Within each bucket, collapses entries that share the same name into one.
 * The parent is the entry with variant="default", or the first if none qualifies;
 * remaining same-name entries are nested under parent.variants[]. Entries with
 * no name are passed through untouched.
 */
function groupBucket(entries: Entry[]): Entry[] {
  const groups = new Map<string, Entry[]>();
  const passthrough: Entry[] = [];
  const order: string[] = [];

  for (const e of entries) {
    if (!e.name) {
      passthrough.push(e);
      continue;
    }
    const existing = groups.get(e.name);
    if (existing) {
      existing.push(e);
    } else {
      groups.set(e.name, [e]);
      order.push(e.name);
    }
  }

  const out: Entry[] = [];
  for (const name of order) {
    const group = groups.get(name)!;
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const defaultIdx = group.findIndex((e) => e.variant === "default");
    const parentIdx = defaultIdx >= 0 ? defaultIdx : 0;
    const parent = group[parentIdx];
    const variants = group.filter((_, i) => i !== parentIdx);
    out.push({ ...parent, variants });
  }
  out.push(...passthrough);
  return out;
}

export function groupVariants(buckets: Buckets): Buckets {
  return {
    layouts: groupBucket(buckets.layouts),
    molecules: groupBucket(buckets.molecules),
    atoms: groupBucket(buckets.atoms),
  };
}
