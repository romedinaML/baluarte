# baluarte

`baluarte` reads Figma files via the Metalab MCP Figma tools, builds a structured understanding of your design (components, tokens, layouts, instances) into a local SQLite registry, and generates a React + Storybook playground from it for design audits and dev/client handoff.

This README is for **you**, the human driver. For Claude-facing project rules, see `CLAUDE.md`.

## Getting started

The pipeline is **fully user-driven**: every skill operates on exactly one node or row that you point it at, and skills never auto-recurse or call each other. You stay in control of what gets registered, documented, and built — and the React output stays clean.

### Prerequisites

- **Node.js LTS** — pinned via `.nvmrc`. Run `nvm use` before working.
- **`sqlite3` CLI** — used by the persistence skill.
- **Figma desktop app** with the **Metalab plugin** installed and running (the plugin is the bridge for `figma_write_*` operations).
- **OAuth-authenticated Metalab MCP** (the `mcp__metalab__figma__*` REST-API side).

### Proposed execution order

1. **Once per project** — bootstrap the Storybook playground:
   ```
   /baluarte-build-setup
   ```
   Creates `baluarte-app/` (Storybook 10, React, Vite, TS, Tailwind v4, shadcn) plus an `npm run baluarte` wrapper at the repo root. Idempotent.

2. **Once per Figma file** — create the dev-docs page:
   ```
   /baluarte-create-developers-docs <figma file URL>
   ```
   Creates the "Baluarte for Devs" page + three section frames (Properties, Components, Layouts) inside Figma and caches their ids in SQLite. Required before any `baluarte-document-*` skill will run. Idempotent — safe to re-run.

3. **Per node, repeat as needed (the main loop):**

   a. Register a node:
   ```
   /baluarte-understand-product <node URL>  [--prompt "<context>"]
   ```
   Drills the node, classifies it (`layout` / `component` / `property` / `page` / `other`), persists a `registry` row, and lists direct children as suggested follow-up commands. The skill **never** drills children automatically — you decide which ones to register next.

   b. Document the registered row, depending on its type:
   ```
   /baluarte-document-layout    <registry_uuid>  [--prompt "..."]
   /baluarte-document-component <registry_uuid>  [--prompt "..."]  [--from-layout <layout_uuid>]
   /baluarte-document-property  <name> <type> <tailwind_name> <css_property> <value>  [--prompt "..."]
   ```
   Each creates one artboard inside the corresponding section of "Baluarte for Devs" plus an annotation block, and persists a row in `layouts` / `components` / `visual_properties`. Doc skills list children/nested instances and emit suggested commands — they never recurse.

4. **After enough rows are documented**, build the React + Storybook code:

   a. Project tokens into Tailwind:
   ```
   /baluarte-build-properties  [--prompt "..."]
   ```
   Fully regenerates `baluarte-app/baluarte.tailwind.ts` from `visual_properties`.

   b. Build components, then layouts (build leaves first):
   ```
   /baluarte-build-component <registry_uuid>  [--prompt "..."]
   /baluarte-build-layout    <registry_uuid>  [--prompt "..."]
   ```
   `baluarte-build-layout` will **fail fast** if any of its child components are unbuilt — it prints the exact `baluarte-build-component <reg_uuid>` commands to run first.

5. **Open Storybook**:
   ```
   npm run baluarte
   ```
   Confirms when prompted. Storybook runs on port 6006 by default.

Steps 3 and 4 are **idempotent** — re-run any single skill at any time to refresh that one row. The SQLite row is the source of truth; the build skills detect drift via `source_hash`.

### Lost? Ask the advisor

Any time you want to know where you are and what to run next:

```
/baluarte-orchestrate                    # full project overview
/baluarte-orchestrate <figma URL>        # scoped to one node
/baluarte-orchestrate <registry_uuid>    # scoped to one row
```

It reads SQLite + filesystem, prints a state table, and gives you a list of copy-pasteable suggested commands. It **never** executes another skill — it's purely advisory.

## Skills reference

| Skill | Purpose | Required arg | Optional `--prompt "..."` semantics |
|---|---|---|---|
| `baluarte-orchestrate` | Status + advisor; never executes other skills. | (none, or URL/uuid to scope) | Free-form note included verbatim in suggested commands. |
| `baluarte-remember` | The only skill that touches SQLite. Runs all SQL via bash `sqlite3` against `/queries/*.sql`. | (operation-specific) | n/a — invoked programmatically. |
| `baluarte-understand-product` | Register ONE Figma node into the registry. | Figma node URL with `?node-id=…` | Classification override hints; force a `node_type` or `granularity`; pin a description. |
| `baluarte-create-developers-docs` | Create/find the "Baluarte for Devs" page + 3 sections in Figma. | Figma file URL | Page-name override; skip a section; reorder sections. |
| `baluarte-document-layout` | Document ONE layout row: clone + annotation artboard + `layouts` row. | `registry_uuid` | Override PascalCase name; add description copy; pin auto-layout assumptions. |
| `baluarte-document-component` | Document ONE component row, dedup-first. Lists nested INSTANCEs as suggested commands. | `registry_uuid` (and optional `--from-layout <layout_uuid>`) | Override name; force granularity; add semantic intent (e.g. accessibility hints). |
| `baluarte-document-property` | Document ONE Tailwind-theme property with a real visual specimen. | `name`, `type`, `tailwind_name`, `css_property`, `value` (and optional `token_uuid`) | Override metadata caption; specify non-default specimen size; append notes. |
| `baluarte-build-setup` | Bootstrap `baluarte-app/`. Asks before launching the dev server. | (none) | Pin package versions; skip shadcn; override Storybook port; add a dev dependency. |
| `baluarte-build-component` | Generate `<Name>.tsx` + story for ONE `components` row. Component-only. | `registry_uuid` | Override name; force atomic/molecular template; add semantic intent. |
| `baluarte-build-layout` | Generate `<Name>.tsx` + story for ONE `layouts` row. Fails fast if children unbuilt. | `registry_uuid` | Override name; add a wrapper element; note responsive expectations. |
| `baluarte-build-properties` | Fully regenerate `baluarte-app/baluarte.tailwind.ts` from `visual_properties`. | (none) | Pin grouping/ordering; add a header comment; force-skip rows by pattern. |

### Universal rules

- **Skill auto-call whitelist is two skills only.** A baluarte-* skill may auto-invoke `baluarte-remember` (SQLite) and `baluarte-understand-product` (registry registration — idempotent, surfaces dedup feedback when the node already exists). Every other dependency surfaces as a fail-fast error with a copy-pasteable suggested command.
- **Doc skills accept URL or `registry_uuid`.** Pass a Figma URL and the skill will auto-register the node first via `baluarte-understand-product`; pass a `registry_uuid` to skip registration entirely.
- **Skills never auto-recurse.** A doc skill processes exactly one node and emits suggested commands for the children — you run them.
- **`--prompt "<text>"` is universal.** Every skill accepts it as free-form guidance. The skill treats your prompt as authoritative when it conflicts with a heuristic.
- **Source nodes are read-only.** Only **clones** of layouts/components ever live inside the "Baluarte for Devs" page.

## Common recipes

### Register and build a single component end-to-end

```
/baluarte-understand-product https://www.figma.com/design/…?node-id=2011-2674
# → registers as node_type='component', returns <reg_uuid>

/baluarte-document-component <reg_uuid>
# → creates artboard + components row

/baluarte-build-component <reg_uuid>
# → emits baluarte-app/src/components/Input/Input.{tsx,stories.tsx}
```

### Register a layout (without descending into children)

```
/baluarte-create-developers-docs https://www.figma.com/design/…
# (only the first time for this file)

/baluarte-understand-product https://www.figma.com/design/…?node-id=2011-2618
# → registers the layout, lists children as suggested commands

/baluarte-document-layout <reg_uuid>
# → creates artboard, lists children, suggests next steps
```

You then decide which children to register (run `baluarte-understand-product` on each child URL surfaced in the previous step's output).

### Refresh a component after Figma changes

```
/baluarte-understand-product <node URL>     # re-classifies / refreshes registry row
/baluarte-document-component <reg_uuid>     # rewrites artboard + properties_json
/baluarte-build-component <reg_uuid>        # source_hash detects drift, rewrites React
```

### Override naming when the Figma label is generic

```
/baluarte-document-component <reg_uuid> --prompt "name this StatusPill, not the generic 'Tag' label"
/baluarte-build-component    <reg_uuid> --prompt "call the React component StatusPill"
```

### Promote a token to Tailwind

```
/baluarte-document-property brand/primary color brand-primary background-color "#0F62FE"
/baluarte-build-properties
```

## Troubleshooting

**"No dev-docs page cached" when running a doc skill.**
You skipped step 2. Run `/baluarte-create-developers-docs <figma URL>` once per file, then retry.

**"Cannot build <Layout>: N child component(s) are not yet built".**
`baluarte-build-layout` will not cascade — that's by design. Copy the suggested `baluarte-build-component <reg_uuid>` commands from the error message, run them, then retry the layout build.

**Metalab plugin bridge not connected (`figma_write_check_connection` fails).**
Open the Figma desktop app, switch to the file you want to process, then launch the Metalab plugin from the Plugins menu. Re-run the skill.

**Figma OAuth not authenticated.**
Run `mcp__metalab__figma__connect_account` (action `connect`), open the returned URL, authorize, and retry.

**Storybook says "no stories found".**
`baluarte-app/.storybook/main.ts` must include the `../src/**/*.stories.@(js|jsx|mjs|ts|tsx)` glob. Re-run `/baluarte-build-setup` — it patches `main.ts` idempotently.

**Generated React component has the wrong name or props.**
Pass guidance via `--prompt "<text>"` on either the document or build skill (or both). The prompt is treated as authoritative.

**A row was misclassified as `layout` but it's really a presentation-slide wrapper.**
Manually update the registry row's `node_type` via `baluarte-remember`, or just leave it as `other` so the build skills skip it. Re-running `baluarte-understand-product` with `--prompt "this is a presentation wrapper, classify as 'page'"` is the cleaner fix.

## Where data lives

- **SQLite registry**: `.data/baluarte.db` (gitignored). Schema source of truth: `.claude/skills/baluarte-remember/schema.sql`. Rebuild any time with:
  ```bash
  rm -f .data/baluarte.db* && mkdir -p .data && sqlite3 .data/baluarte.db < .claude/skills/baluarte-remember/schema.sql
  ```
  Tables: 8 single (`pages`, `storybook`, `layouts`, `molecules`, `atoms`, `states`, `figma_nodes`, `properties`) + 2 variant (`atom_variants`, `molecule_variants`) + 6 relationship (`pages_registry`, `layout_registry`, `layout_properties`, `molecules_registry`, `molecules_properties`, `atoms_properties`). `states` is pre-seeded with the six allowed values.

  Each entity in `layouts`/`molecules`/`atoms` carries two re-sync signals: `edited_at` (the comment timestamp of the `/baluarte-*` annotation) and **`content_diff_hash`** (SHA-256 of the deep node tree returned by `/v1/files/{key}/nodes`). The Figma REST API does **not** expose a per-node `lastModified` — the top-level `lastModified` in the nodes response is file-wide and identical for every entity, so it can't drive per-entity diffing. Hashing the fetched JSON is the substitute. An entity is dirty when **either** signal changes; see `.claude/skills/baluarte-remember/SKILL.md` ("`content_diff_hash`") for the full rule.

  Layouts intentionally have no `layout_variants` table — `layouts.type` already encodes Mobile/Desktop/All variants and each device variant lives as its own row.
- **Reusable SQL**: `/queries/*.sql`, indexed in `/queries/INDEX.md`. Every SQL operation `baluarte-remember` runs comes from a file there. New operations get a new `.sql` file + INDEX row — never inline SQL for anything that recurs.
- **Figma documentation artboards**: in the "Baluarte for Devs" page of your Figma file (one artboard per documented row, parented inside the Properties/Components/Layouts sections).
- **React + Storybook code**: `baluarte-app/src/components/<Name>/` and `baluarte-app/src/layouts/<Name>/`. The shadcn primitives at `baluarte-app/src/components/ui/` are not generated — they're scaffolded by `baluarte-build-setup` and edited by hand.
- **Tailwind theme sidecar**: `baluarte-app/baluarte.tailwind.ts` (regenerated by `baluarte-build-properties`, imported by `baluarte-app/tailwind.config.ts`).
- **Skills source of truth**: `.claude/skills/<skill-name>/SKILL.md`. The `.claude/` directory is checked into git.

## Persistence rules

- Anything queryable / row-shaped → `baluarte-remember` (SQLite).
- Anything prose-shaped (preferences, status, decisions) → `MEMORY.md` (Claude's auto-loaded memory).
- **Never write SQL outside the `baluarte-remember` skill.** If a new operation is needed, add a new `/queries/<verb>_<table>.sql` file (with `:bound_params`), register it in `/queries/INDEX.md`, and update `schema.sql` if the table itself needs to change.
- **All SQL runs via bash `sqlite3`.** Python is forbidden; the previous `node:sqlite` escape hatch is removed.
