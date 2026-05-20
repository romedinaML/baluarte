---
name: baluarte-remember
description: Read/update/delete structured records in the project SQLite DB (.data/baluarte.db). Use for queryable cross-session data — pages, layouts, components, properties, states, Figma nodes, Storybook entries, and the relationships between them. NOT for prose, preferences, or status notes (those go in MEMORY.md).
---

# baluarte-remember

The only skill in this repo that touches `.data/baluarte.db`. Every other skill that needs SQL must call this one. **All SQL runs via bash `sqlite3` — Python and `node:sqlite` are forbidden.**

## Known callers

- **`baluarte-analyze`** — walks the Figma file's artboards via the Metalab Figma MCP, classifies each as layout (name contains `screen`) or component, hashes each artboard's deep tree, and persists the diff.
- **`baluarte-build`** — generates and incrementally patches the Storybook artifacts in `baluarte-app/`. Reads layouts/components/properties + every `*_properties` and `*_registry` row to build its dependency graph; writes back `storybook` rows and the entity `storybook_id` linkage.
- Future build/doc skills as they're added.

Every other skill must surface a copy-pasteable `baluarte-remember` command instead of touching `.data/baluarte.db` itself.

## When to use this skill

Use `baluarte-remember` for **structured, queryable, cross-session** data:

- Pages parsed from Figma files (one row per `file_key`).
- Layouts and components — the design hierarchy. A single component tier (no atom/molecule split).
- Visual properties (Tailwind class + raw CSS) and their origin (custom vs. Figma variable).
- States (hover/active/stale/disabled/focus/clicked) — pre-seeded by the schema.
- Figma node references attached to a layout/component.
- Storybook entries linking generated code back to layouts/components.
- Relationship rows: `pages_registry`, `layout_registry`, `layout_properties`, `components_registry`, `components_properties`.

**Do NOT use** for prose-shaped state — preferences, decisions, status notes. Those go in `MEMORY.md`.

## Canonical paths

- DB: `.data/baluarte.db` (gitignored, rebuildable).
- Schema: `.claude/skills/baluarte-remember/schema.sql`.
- Reusable queries: `/queries/*.sql`.
- Query index: `/queries/INDEX.md`.

## Schema overview

Single tables:

| Table | Purpose |
|---|---|
| `pages` | Figma files (`file_key` unique) |
| `storybook` | Generated Storybook entries (name, urls, src ref) |
| `layouts` | Layouts (artboards whose name contains the token `screen`). Carries `description`, `intent_json`, `edited_at`, `content_diff_hash` |
| `components` | Components — single tier replacing the prior atom + molecule split. Same `description` + `intent_json` + `edited_at` + `content_diff_hash` semantics as `layouts` |
| `component_variants` | Variants of a component: `(component_id, figma_node)` unique, plus `name`, `variant`, optional `state_id` |
| `states` | Pre-seeded: hover, active, stale, disabled, focus, clicked |
| `figma_nodes` | One row per `(reference_type, reference_id)` — links a layout/component to its Figma node + URL. `reference_type ∈ {layout, component}` |
| `properties` | Tailwind+CSS visual properties; `type` ∈ Color/Spacing/Font/Typography/Positioning/Grid/Flex/Border/Shadow/Opacity; `origin ∈ {Custom, Figma Variable}`. When `origin='Figma Variable'`, `figma_variable_id` holds the originating Figma variable id (unique when set) |

Relationship tables (all with `uuid` PK and `ON DELETE CASCADE`):

| Table | Links |
|---|---|
| `pages_registry` | page → (layout \| component) |
| `layout_registry` | layout → component, with optional `child_property` (Positioning/Spacing only — enforced by trigger). Layouts only contain components, so `child_type` is implicit |
| `layout_properties` | layout → property (the layout's own CSS) |
| `components_registry` | component → component (self-referential parent/child composition, matches React composition), with optional `property_id` |
| `components_properties` | component × property × state |

`states` is pre-seeded by `schema.sql` — never insert state rows; look them up via `select_state_by_type`.

### `intent_json` (layouts / components)

A nullable TEXT column on `layouts` and `components` carrying a JSON blob with **structured design intent** that survives the round-trip from `baluarte-design` (writer) → `baluarte-analyze` (extractor) → `baluarte-build` (consumer). Schema-less by design — JSON-encoded — but the conventional shape is:

```json
{
  "prompt":      "<original /baluarte-design request, verbatim>",
  "scrollable":  "x" | "y" | null,
  "min_width":   <number-of-px> | null,
  "max_width":   <number-of-px> | null,
  "interactivity": [
    { "event": "click" | "hover" | "focus", "target_state": "hover" | "active" | "clicked" | ... }
  ],
  "css_utilities": ["overflow-x-hidden", "snap-x", "snap-mandatory"],
  "notes":       "<free-form additional context>"
}
```

Lifecycle:
- **Written by `baluarte-design`** — the original user prompt is recorded into the Figma node's native `.description` field AND `setSharedPluginData('baluarte','intent_v1', json)` at design time.
- **Drained by `baluarte-analyze`** — at every sync, merges Figma node description + plugin data + structural hints from `globalVars` (overflowScroll → scrollable; fixed sizing → min_width) and writes the result via `update_component` / `update_layout`.
- **Read by `baluarte-build`** — `intent_json` drives Tailwind className additions (`overflow-x-auto`, `min-w-[Npx]`, etc.) and triggers auto-emission of an `Interactive` Storybook story when `intent_json.interactivity` is non-empty.
- **NULL is a valid state** — components without intent (legacy rows, structural-only artboards) render with no intent-derived classes and no `Interactive` story.

The COALESCE pattern in `update_component` / `update_layout` means callers passing `:intent_json=NULL` preserve the existing value; passing a JSON string overwrites. To explicitly clear an intent, pass the literal JSON string `'null'` (TEXT NULL via SQL).

### `content_diff_hash` (layouts / components)

Per-entity SHA-256 over a **composite fingerprint** of the artboard:

```
content_diff_hash = SHA256(
  structural_fingerprint(nodeId | name | type | children | lastModified)
  + "|intent="
  + canonical_intent_string
)
```

where `canonical_intent_string` is the `setSharedPluginData('baluarte','intent_v1')` payload when non-empty, or the `@baluarte intent:` annotation label otherwise, or `""` when neither is set.

This is intentional: the Figma API does not expose a per-node `lastModified`, so we hash the structural shape; folding the intent payload into the same hash means any designer edit to the annotation prose flips it too. **Both `baluarte-analyze` (dirty detection) and `baluarte-build` (regen detection) read the same hash**, so intent changes propagate through the entire pipeline via one signal.

Lifecycle:
- **Compute:** `baluarte-analyze` hashes the node tree after the MCP fetch and writes the result on every save.
- **Diff rule:** an entity is dirty when its freshly observed `content_diff_hash` differs from the stored value, OR when it has no on-disk artifact yet.
- **No native SQL writes here.** Callers compute the hash externally and pass it as a bound `:content_diff_hash` parameter on insert/update.

Naming: `content_diff_hash` (NOT `content_hash`) — the underscore before `diff` is intentional.

### Variants (`component_variants`)

A component is stored as a single "default" row (in `components`) plus zero or more **variant** rows (in `component_variants`). Each variant row remembers the variant's Figma node id, optional name/variant label, and optional state — the visual properties of the variant land in `components_properties` keyed by `state_id` against the **same parent uuid**, not a new entity uuid.

**Layouts intentionally have no variants table.** Different device variants (Mobile/Desktop) live as their own rows in `layouts` (own uuid).

Save lifecycle (per `baluarte-analyze`): after upserting the parent component, wipe its variant rows by parent id and re-insert from the latest Figma fetch. The unique `(component_id, figma_node)` constraint also makes the inserts safely idempotent.

## Initialize / rebuild

```bash
mkdir -p .data
sqlite3 .data/baluarte.db < .claude/skills/baluarte-remember/schema.sql
```

Hard reset (drops all data):

```bash
rm -f .data/baluarte.db .data/baluarte.db-shm .data/baluarte.db-wal
mkdir -p .data
sqlite3 .data/baluarte.db < .claude/skills/baluarte-remember/schema.sql
```

The schema is idempotent (`CREATE … IF NOT EXISTS`, `INSERT OR IGNORE` for seed states), so running it on an existing DB is safe but does **not** apply schema changes — for those, hard-reset.

## Query-cache protocol (REQUIRED)

When another skill (or the user) asks you to run SQL, follow this protocol every time:

1. **Read `/queries/INDEX.md`.**
2. **Match by operation + table + parameter signature.** If a row matches, run that file:
   ```bash
   sqlite3 .data/baluarte.db <<'EOF'
   .parameter set :name 'Button'
   .parameter set :storybook_id NULL
   .parameter set :description NULL
   .parameter set :edited_at NULL
   .parameter set :content_diff_hash NULL
   .read queries/insert_component.sql
   EOF
   ```
3. **No match? Create a new query file** at `/queries/<verb>_<table>[_<qualifier>].sql` using **only `:bound_params`**. Then append a row to `/queries/INDEX.md` and run the new file.
4. **Inline ad-hoc SQL is allowed only for one-off introspection** (`.tables`, `.schema`, a one-time `SELECT count(*)`). Anything that recurs must be a file.

Naming convention for new query files: `<verb>_<table>[_<qualifier>].sql` where `verb ∈ {insert, select, list, update, delete, link, unlink, count}`.

## Bash invocation patterns

**Single bound query (capturing returned uuid):**

```bash
NEW_UUID=$(sqlite3 -batch .data/baluarte.db <<'EOF'
.parameter set :file_key 'abc123'
.parameter set :edited_at '2026-04-29T12:00:00Z'
.read queries/insert_page.sql
EOF
)
```

**Mixing bound params with NULLs:** sqlite3 CLI `.parameter set` interprets a bare `NULL` token as SQL NULL.

```bash
sqlite3 -batch .data/baluarte.db <<'EOF'
.parameter set :name 'Card'
.parameter set :storybook_id NULL
.parameter set :description NULL
.parameter set :edited_at NULL
.parameter set :content_diff_hash NULL
.read queries/insert_component.sql
EOF
```

**Transactional bulk insert:** wrap multiple `.read` calls in `BEGIN; … COMMIT;` inside the heredoc.

## Operations cookbook

Each operation maps to one canonical query file. Add a new file (and INDEX row) when an operation isn't listed.

### Pages
- Insert/upsert: `queries/insert_page.sql` (idempotent on `file_key`, returns uuid).
- Lookup: `queries/select_page_by_file_key.sql`.
- Link entity → page: `queries/link_page_child.sql` (`:child_type ∈ {layout, component}`).
- **Semantics:** `pages.edited_at` mirrors the file's `lastModified` from the Figma file. One `pages` row per file.

### Storybook
- Insert: `queries/insert_storybook.sql`.

### Layouts / Components
- Insert: `queries/insert_layout.sql`, `queries/insert_component.sql` (each accepts `:intent_json` and `:content_diff_hash`).
- Lookup: `queries/select_layout_by_uuid.sql`, `queries/select_component_by_uuid.sql`.
- Lookup by Figma node id: `select_layout_uuid_by_figma_node.sql`, `select_component_uuid_by_figma_node.sql`.
- Bulk diff list: `list_layouts_with_figma_node.sql`, `list_components_with_figma_node.sql` — each row carries `(figma_node, uuid, edited_at, content_diff_hash)` for cheap diffing.
- **Naming rule:** the caller passes the Figma artboard's `name` field as `:name`. There is no `/baluarte-*` tag system anymore — the artboard name is the source of truth.

### Component variants
- Insert/upsert: `queries/insert_component_variant.sql` (idempotent on `(component_id, figma_node)`).
- List by parent: `queries/list_component_variants_by_component.sql`.
- Wipe before re-sync: `queries/delete_component_variants_by_component.sql`.
- Variant rows do **not** have their own `figma_nodes` row — the parent component already owns the canonical figma_node mapping.

### Properties
- Insert/upsert: `queries/insert_property.sql` (idempotent on `(name, type)`; `figma_variable_id` preserved across re-upserts via COALESCE).
- Lookup: `queries/select_property_by_uuid.sql`.
- Lookup by Figma variable id: `queries/select_property_by_figma_variable_id.sql`.

### States
- Lookup only: `queries/select_state_by_type.sql`. **Never insert.**

### Figma nodes
- Insert/upsert: `queries/insert_figma_node.sql` (idempotent on `(reference_type, reference_id)`).
- Lookup: `queries/select_figma_node_for_reference.sql`.

### Relationships
- `link_page_child.sql` — `pages_registry` (idempotent).
- `link_layout_child.sql` — `layout_registry`. `:child_property` is optional and **must** point to a Positioning/Spacing property; the trigger will RAISE(ABORT) otherwise.
- `link_layout_property.sql` — `layout_properties` (idempotent).
- `link_component_child.sql` — `components_registry` (idempotent self-referential parent→child composition).
- `link_component_property.sql` — `components_properties` (idempotent on `(component_id, property_id, state_id)`).

## Invariants

- One `figma_nodes` row per `(reference_type, reference_id)`.
- One `properties` row per `(name, type)`. `figma_variable_id` is unique when set.
- One `pages` row per `file_key`. `pages.edited_at` carries the file-wide `lastModified`.
- One `component_variants` row per `(component_id, figma_node)`.
- `layout_registry.child_property`, when set, must be Positioning or Spacing (trigger-enforced).
- `components_registry` cannot link a component to itself (CHECK on `parent_id <> child_id`).
- `states` is read-only after schema load.
- `content_diff_hash` is the per-entity sync key on layouts/components.
- Layouts intentionally have **no** variants table.
- All FKs cascade on delete (or set null where the parent is optional, e.g. `storybook_id`).

## What NOT to do

- ❌ Run SQL via Python or `node:sqlite`. Bash `sqlite3` only.
- ❌ Inline a multi-line query when the same op already exists in `/queries/`. Reuse.
- ❌ Insert into `states`. Look up the seeded row instead.
- ❌ Write SQL with string interpolation of caller-supplied values. Use `.parameter set` + `:bound_params`.
- ❌ Touch `.data/baluarte.db` from any skill other than `baluarte-remember`.
