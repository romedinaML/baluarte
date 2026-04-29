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
| `layouts` | Layouts with `type ∈ {Mobile, Desktop, All}` |
| `molecules` | Molecules with `type ∈ {static, interactive, form}` |
| `atoms` | Atoms with `type ∈ {static, interactive, form}` |
| `states` | Pre-seeded: hover, active, stale, disabled, focus, clicked |
| `figma_nodes` | One row per `(reference_type, reference_id)` — links a layout/molecule/atom to its Figma node + URL |
| `properties` | Tailwind+CSS visual properties; `type` includes Color, Spacing, Font, Typography, Positioning, Grid, Flex, Border, Shadow, Opacity; `origin ∈ {Custom, Figma Variable}` |

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
- Insert: `queries/insert_layout.sql`, `insert_molecule.sql`, `insert_atom.sql`.
- Lookup: `queries/select_layout_by_uuid.sql`, `select_molecule_by_uuid.sql`, `select_atom_by_uuid.sql`.
- **Naming rule:** if the caller did not pass `:name`, surface a confirm-on-terminal prompt suggesting either the Figma node's name or a descriptive default — do not silently insert with a placeholder.

### Properties
- Insert/upsert: `queries/insert_property.sql` (idempotent on `(name, type)`).
- Lookup: `queries/select_property_by_uuid.sql`.

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
- One `properties` row per `(name, type)`.
- One `pages` row per `file_key`.
- `layout_registry.child_property`, when set, must be Positioning or Spacing (trigger-enforced).
- `states` is read-only after schema load — pre-seeded with the six allowed values.
- All FKs cascade on delete (or set null where the parent is optional, e.g. `storybook_id`).

## What NOT to do

- ❌ Run SQL via Python or `node:sqlite`. Bash `sqlite3` only.
- ❌ Inline a multi-line query in a script when the same op already exists in `/queries/`. Reuse.
- ❌ Insert into `states`. Look up the seeded row instead.
- ❌ Write SQL with string interpolation of caller-supplied values. Use `.parameter set` + `:bound_params`.
- ❌ Touch `.data/baluarte.db` from any skill other than `baluarte-remember`. Other skills must call this one.
