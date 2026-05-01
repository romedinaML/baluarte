---
name: baluarte-remember
description: Read/update/delete structured records in the project SQLite DB (.data/baluarte.db). Use for queryable cross-session data — pages, layouts, molecules, atoms, properties, states, Figma nodes, Storybook entries, and the relationships between them. NOT for prose, preferences, or status notes (those go in MEMORY.md).
---

# baluarte-remember

The only skill in this repo that touches `.data/baluarte.db`. Every other skill that needs SQL must call this one. **All SQL runs via bash `sqlite3` — Python is forbidden, and the previous `node:sqlite` escape hatch is removed.**

## When to use this skill

Use `baluarte-remember` for **structured, queryable, cross-session** data:

- Pages parsed from Figma files (one row per `file_key`).
- Layouts, molecules, and atoms — the design hierarchy.
- Visual properties (Tailwind class + raw CSS) and their origin (custom vs. Figma variable).
- States (hover/active/stale/disabled/focus/clicked) — pre-seeded by the schema.
- Figma node references attached to a layout/molecule/atom.
- Storybook entries linking generated code back to layouts/molecules/atoms.
- Relationship rows: `pages_registry`, `layout_registry`, `layout_properties`, `molecules_registry`, `molecules_properties`, `atoms_properties`.

**Do NOT use** for prose-shaped state — preferences, decisions, status notes. Those go in `MEMORY.md`. If you can't express the thing as a row with a stable shape, it doesn't belong here.

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
| `layouts` | Layouts with `type ∈ {Mobile, Desktop, All}`. Carries `edited_at` (comment timestamp) and `content_diff_hash` (see below) |
| `molecules` | Molecules with `type ∈ {static, interactive, form}`. Same `edited_at` + `content_diff_hash` semantics |
| `atoms` | Atoms with `type ∈ {static, interactive, form}`. Same `edited_at` + `content_diff_hash` semantics |
| `atom_variants` | Variants of an atom: `(atom_id, figma_node)` unique, plus `name`, `variant`, optional `state_id` |
| `molecule_variants` | Variants of a molecule: same shape as `atom_variants`, FK to `molecules` |
| `states` | Pre-seeded: hover, active, stale, disabled, focus, clicked |
| `figma_nodes` | One row per `(reference_type, reference_id)` — links a layout/molecule/atom to its Figma node + URL |
| `properties` | Tailwind+CSS visual properties; `type` includes Color, Spacing, Font, Typography, Positioning, Grid, Flex, Border, Shadow, Opacity; `origin ∈ {Custom, Figma Variable}`. When `origin='Figma Variable'`, `figma_variable_id` holds the originating Figma variable id (e.g. `VariableID:abc/123`) — unique when set, NULL for `Custom` |

Relationship tables (all with `uuid` PK and `ON DELETE CASCADE`):

| Table | Links |
|---|---|
| `pages_registry` | page → (layout \| molecule \| atom) |
| `layout_registry` | layout → (molecule \| atom), with optional `child_property` (Positioning/Spacing only — enforced by trigger) |
| `layout_properties` | layout → property (the layout's own CSS) |
| `molecules_registry` | molecule → child + optional property |
| `molecules_properties` | molecule × property × state |
| `atoms_properties` | atom × property × state |

`states` is pre-seeded by `schema.sql` — never insert state rows; look them up via `select_state_by_type`.

### `content_diff_hash` (atoms / molecules / layouts)

Per-entity SHA-256 over the deep document tree returned by `/v1/files/{key}/nodes`. The Figma REST API does **not** expose a per-node `lastModified` — `lastModified` at the response root is the file-wide timestamp and identical for every node. We therefore hash the fetched JSON instead and treat any change in the hash as "the design changed."

Lifecycle:
- **Compute:** the consumer (currently the `baluarte-tools` MCP, tool `baluarte-fetch-entities`) hashes `node.document` after the deep `/nodes` fetch and writes the result to this column on every save.
- **Diff rule:** an entity is dirty when **either** `edited_at` (comment timestamp) **or** `content_diff_hash` differs from the freshly computed values. Both signals must be checked — comment-only changes still rewrite metadata (name, variant, state) and design-only changes still rewrite properties and relationships.
- **No native SQL writes here.** Callers compute the hash externally and pass it as a bound `:content_diff_hash` parameter on insert/update.

Naming: `content_diff_hash` (NOT `content_hash`) — the underscore before `diff` is intentional. It distinguishes "this is the diff key for re-sync" from a plain content fingerprint.

### Variants (`atom_variants`, `molecule_variants`)

Atoms and molecules are stored as a single "default" row (in `atoms` / `molecules`) plus zero or more **variant** rows (in `atom_variants` / `molecule_variants`). Each variant row remembers the variant's Figma node id, optional name/variant label, and optional state — the visual properties of the variant land in `atoms_properties` / `molecules_properties` keyed by `state_id` against the **same parent uuid**, not a new entity uuid.

**Layouts intentionally have no `layout_variants` table** — the `layouts.type` column already encodes Mobile/Desktop/All variants, and each device variant lives as its own row in `layouts` (own uuid). Don't add `layout_variants`.

Save lifecycle (per `baluarte-fetch-entities`): after upserting the parent atom/molecule, wipe its variant rows by parent id and re-insert from the latest comment buckets. The unique `(atom_id, figma_node)` / `(molecule_id, figma_node)` constraint also makes the inserts safely idempotent if the wipe step is skipped.

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
   .parameter set :type 'static'
   .parameter set :storybook_id NULL
   .parameter set :description NULL
   .parameter set :edited_at NULL
   .read queries/insert_atom.sql
   EOF
   ```
3. **No match? Create a new query file** at `/queries/<verb>_<table>[_<qualifier>].sql` using **only `:bound_params`** (no string interpolation). Then append a row to `/queries/INDEX.md` and run the new file.
4. **Inline ad-hoc SQL is allowed only for one-off introspection** (`.tables`, `.schema`, a one-time `SELECT count(*)`). Anything that will recur must be a file.

Naming convention for new query files: `<verb>_<table>[_<qualifier>].sql` where `verb ∈ {insert, select, update, delete, link, unlink, count}`.

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
.parameter set :type 'static'
.read queries/insert_molecule.sql
EOF
```

**Transactional bulk insert:** wrap multiple `.read` calls in `BEGIN; … COMMIT;` inside the heredoc.

## Operations cookbook

Each operation maps to one canonical query file. Add a new file (and INDEX row) when an operation isn't listed.

### Pages
- Insert/upsert: `queries/insert_page.sql` (idempotent on `file_key`, returns uuid).
- Lookup: `queries/select_page_by_file_key.sql`.

### Storybook
- Insert: `queries/insert_storybook.sql`.

### Layouts / Molecules / Atoms
- Insert: `queries/insert_layout.sql`, `insert_molecule.sql`, `insert_atom.sql` (each accepts `:content_diff_hash`).
- Lookup: `queries/select_layout_by_uuid.sql`, `select_molecule_by_uuid.sql`, `select_atom_by_uuid.sql` (return `content_diff_hash`).
- Lookup by Figma node id: `select_layout_uuid_by_figma_node.sql`, `select_molecule_uuid_by_figma_node.sql`, `select_atom_uuid_by_figma_node.sql`.
- Bulk diff list: `list_layouts_with_figma_node.sql`, `list_molecules_with_figma_node.sql`, `list_atoms_with_figma_node.sql` — each row carries `(figma_node, uuid, edited_at, content_diff_hash)` for cheap diffing.
- **Naming rule:** if the caller did not pass `:name`, surface a confirm-on-terminal prompt suggesting either the Figma node's name or a descriptive default — do not silently insert with a placeholder.

### Atom / Molecule variants
- Insert/upsert: `queries/insert_atom_variant.sql`, `insert_molecule_variant.sql` (idempotent on `(parent_id, figma_node)`).
- List by parent: `queries/list_atom_variants_by_atom.sql`, `list_molecule_variants_by_molecule.sql`.
- Wipe before re-sync: `queries/delete_atom_variants_by_atom.sql`, `delete_molecule_variants_by_molecule.sql`.
- Variant rows do **not** have their own `figma_nodes` row — the parent atom/molecule already owns the canonical figma_node mapping. The variant table stores `figma_node` directly so we can list children without an extra join.

### Properties
- Insert/upsert: `queries/insert_property.sql` (idempotent on `(name, type)`; `figma_variable_id` is preserved across re-upserts via COALESCE so a later Custom write never blanks an earlier Figma-Variable seed).
- Lookup: `queries/select_property_by_uuid.sql`.
- Lookup by Figma variable id: `queries/select_property_by_figma_variable_id.sql` — used when resolving `boundVariables.<field>.id` references on a node back to a registered property.

### Pages
- Upsert: `queries/insert_page.sql` (idempotent on `file_key`).
- Lookup: `queries/select_page_by_file_key.sql`.
- Link entity → page: `queries/link_page_child.sql` (idempotent on `(page_id, child_type, child_id)`).
- **Semantics:** `pages.edited_at` mirrors the file's `lastModified` from `/v1/files/{key}/nodes` (file-wide timestamp). One `pages` row per file (UNIQUE on `file_key`). The `baluarte-fetch-entities` MCP tool populates this automatically as the final pipeline step.

### States
- Lookup only: `queries/select_state_by_type.sql`. **Never insert.**

### Figma nodes
- Insert/upsert: `queries/insert_figma_node.sql` (idempotent on `(reference_type, reference_id)`).
- Lookup: `queries/select_figma_node_for_reference.sql`.

### Relationships
- `link_page_child.sql` — pages_registry (idempotent).
- `link_layout_child.sql` — layout_registry. `child_property` is optional and **must** point to a Positioning/Spacing property; the trigger `trg_layout_registry_property_type_*` will RAISE(ABORT) otherwise.
- `link_layout_property.sql` — layout_properties (idempotent).
- `link_molecule_child.sql` — molecules_registry.
- `link_molecule_property.sql` — molecules_properties (idempotent on `(molecule_id, property_id, state_id)`).
- `link_atom_property.sql` — atoms_properties (idempotent on `(atom_id, property_id, state_id)`).

## Invariants

- One `figma_nodes` row per `(reference_type, reference_id)`.
- One `properties` row per `(name, type)`. `figma_variable_id` is unique when set (partial unique index).
- One `pages` row per `file_key`. `pages.edited_at` carries the file-wide `lastModified`.
- One `atom_variants` / `molecule_variants` row per `(parent_id, figma_node)`.
- `layout_registry.child_property`, when set, must be Positioning or Spacing (trigger-enforced).
- `states` is read-only after schema load — pre-seeded with the six allowed values.
- `content_diff_hash` is the per-entity sync key on atoms/molecules/layouts. Diff dirty when **either** `edited_at` or `content_diff_hash` differs from the freshly observed values.
- Layouts intentionally have **no** variants table — `layouts.type` (`Mobile`/`Desktop`/`All`) plus a row-per-variant in `layouts` covers the device axis.
- All FKs cascade on delete (or set null where the parent is optional, e.g. `storybook_id`).

## What NOT to do

- ❌ Run SQL via Python or `node:sqlite`. Bash `sqlite3` only.
- ❌ Inline a multi-line query in a script when the same op already exists in `/queries/`. Reuse.
- ❌ Insert into `states`. Look up the seeded row instead.
- ❌ Write SQL with string interpolation of caller-supplied values. Use `.parameter set` + `:bound_params`.
- ❌ Touch `.data/baluarte.db` from any skill other than `baluarte-remember`. Other skills must call this one.
