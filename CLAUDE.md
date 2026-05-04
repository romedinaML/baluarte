# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`baluarte` reads Figma files via the Metalab MCP Figma tools, builds a structured understanding of the product (components, tokens, layouts, instances), and persists it to a local SQLite registry. Downstream, that registry will drive Storybook generation for design audits and dev/client handoff.

## Stack

- **Runtime:** Node.js (latest LTS). Pinned via `.nvmrc` (`lts/*`). Run `nvm use` before working.
- **Languages:** TypeScript and bash. Avoid one-off `.ts` scripts unless the bash form is genuinely unwieldy — prefer `npx tsx -e "..."` inline.
- **Storage:** SQLite via the bash `sqlite3` CLI **only** — Python and `node:sqlite` are forbidden. DB lives at `.data/baluarte.db` (gitignored). All reusable SQL lives in `/queries/*.sql` and is registered in `/queries/INDEX.md`.

## Skills (in `.claude/skills/`)

The `.claude/` directory is **checked into git** so skills are versioned with the repo. Only `.claude/settings.local.json` is gitignored.

**User-driven contract.** Every baluarte-* skill is invoked manually by the user, operates on exactly ONE node/row, and does NOT auto-recurse. The whitelist of skills another skill may auto-invoke is exactly two: `baluarte-remember` (SQLite read/write) and `baluarte-understand-product` (registry registration — idempotent, surfaces dedup feedback when the node already exists). For every other missing prerequisite, skills surface a copy-pasteable suggested command and let the user run it. Every skill accepts an optional `--prompt "<text>"` flag for free-form guidance (naming overrides, classification hints, copy notes, etc.).

Doc skills (`baluarte-document-{layout,component,property}`) accept either a Figma URL or a `registry_uuid`. When given a URL, they auto-call `baluarte-understand-product` to ensure the registry row exists, then proceed. The unified `baluarte-build` skill takes scope/name/uuid filters and fails fast for missing prerequisites.

- **`baluarte-orchestrate`** — **status + advisor only** (no execution). Reads SQLite + filesystem and prints a state table plus suggested next-step commands the user can copy-paste. Optional arg is a Figma URL or `registry_uuid` to scope the advice.
- **`baluarte-remember`** — the only skill that touches `.data/baluarte.db`. Reads/writes pages, layouts, molecules, atoms, properties, states, figma_nodes, storybook entries, and their relationship tables. Runs SQL exclusively via bash `sqlite3` and the `/queries/*.sql` cache (see `/queries/INDEX.md`). Use this for *structured, queryable, cross-session* data.
- **`baluarte-understand-product`** — registers ONE Figma node into the registry. Drills the node at default depth only, classifies it per the tier heuristics, persists the row, and lists direct children as suggested follow-up commands. Required arg: a Figma node URL (with `?node-id=…`).
- **`baluarte-create-developers-docs`** — ensures the "Baluarte for Devs" page + three section frames exist. Cached in `dev_docs_pages`. **The user runs this manually exactly once per file** before invoking any doc skill — doc skills no longer auto-call it; they read the cache and fail fast if empty.
- **`baluarte-document-layout`** — documents ONE `node_type='layout'` row: clones the source layout into a Layouts-section artboard + annotation block, persists a `layouts` row. Lists children in the annotation and emits suggested commands for each — never auto-recurses.
- **`baluarte-document-component`** — documents ONE `node_type='component'` row, dedup-first (every component documented at most once). Clones all variants side-by-side. Lists nested INSTANCE children as suggested commands. Optional `--from-layout <layout_uuid>` records the layout↔component link.
- **`baluarte-document-property`** — documents ONE Tailwind-theme-shaped property. Dedup-first on `(name, type)`. Real visual specimen + uniform metadata block. Auto-links to the source `tokens` row when one exists.

Doc-skill rule: each of `baluarte-document-{layout,component,property}` reads the `dev_docs_pages` cache and fails fast if missing — pointing the user at `baluarte-create-developers-docs`. Source nodes are read-only — only **clones** of layouts/components ever live in the dev-docs page.

### Build skill (Storybook playground at `baluarte-app/`)

- **`baluarte-build`** — generates and **incrementally patches** the Storybook artifacts inside `baluarte-app/` from the registry. Fetches layouts/molecules/atoms/properties (and their relationship rows) exclusively through `baluarte-remember`, then builds a property/parent dependency graph to compute the dirty set. For each dirty entity it parses the existing `<Name>.tsx`/`<Name>.stories.tsx`, computes a field-level diff (className tokens, prop signature, variant exports, header hash), and applies the *minimum delta* via `Edit` — never a wholesale rewrite. Variants live as additional named exports inside the same `.stories.tsx`. After every per-entity write it calls `baluarte-remember` to upsert a `storybook` row and link it back via the entity's `storybook_id`.

Build-skill rules:
- The DB is read and written **only** through `baluarte-remember`. The skill itself never opens `.data/baluarte.db`, runs `sqlite3`, or calls any MCP tool.
- All artifacts live inside `baluarte-app/` under the tier-split layout: `src/layouts/<Name>/`, `src/molecules/<Name>/`, `src/atoms/<Name>/`. Story titles are tier-prefixed (`Layouts/<Name>`, `Molecules/<Name>`, `Atoms/<Name>`).
- Generated files carry the header `// AUTO-GENERATED by baluarte-build` plus `source`, `uuid`, and `content_diff_hash`. The skill **patches** them in place — re-running with no registry changes is a byte-level no-op. The SQLite row is the source of truth.
- `baluarte-app/baluarte.tailwind.ts` is the only file rewritten whole (it is a pure projection of `properties`). When a property name changes there, the dependency graph drives className substitutions in every dependent component artifact in the same run.
- Files that lack the AUTO-GENERATED marker are **never overwritten** — the skill prints the structured diff under `Diffs (manual merge required):` and continues with the rest of the dirty set.
- **Never cascade into another baluarte-* skill** (besides `baluarte-remember`). Missing prerequisites become fail-fast errors with copy-pasteable suggested commands.

## Persistence rules

- Anything queryable / row-shaped → `baluarte-remember` (SQLite).
- Anything prose-shaped (preferences, status, decisions) → `MEMORY.md`.
- **Never write SQL outside the `baluarte-remember` skill.** Reusable operations live in `/queries/*.sql` (registered in `/queries/INDEX.md`). When a new operation is needed, add a `.sql` file with `:bound_params` and append a row to the index — never inline SQL for anything that recurs. Update `.claude/skills/baluarte-remember/schema.sql` only when the table itself needs to change.
- **All SQL runs via bash `sqlite3`.** No Python; no `node:sqlite`.

## Database

Schema source of truth: `.claude/skills/baluarte-remember/schema.sql`. The `.db` file is rebuildable any time:

```bash
mkdir -p .data
sqlite3 .data/baluarte.db < .claude/skills/baluarte-remember/schema.sql
```

Tables — 8 single: `pages`, `storybook`, `layouts`, `molecules`, `atoms`, `states`, `figma_nodes`, `properties`. 6 relationship: `pages_registry`, `layout_registry`, `layout_properties`, `molecules_registry`, `molecules_properties`, `atoms_properties`. WAL mode, foreign keys on, cascading deletes. `states` is pre-seeded with the six allowed values; never insert into it. `layout_registry.child_property` is constrained by trigger to Positioning/Spacing properties. See `baluarte-remember`'s `SKILL.md` and `/queries/INDEX.md` for the canonical query catalogue.

Schema is rebuildable; there are no migrations yet. To pick up schema changes: `rm -f .data/baluarte.db* && mkdir -p .data && sqlite3 .data/baluarte.db < .claude/skills/baluarte-remember/schema.sql`.

## Figma access

Use the Metalab MCP Figma tools (`mcp__metalab__figma__*` and `mcp__metalab__figma_live_*`). Do not call the Figma REST API directly. Writes to Figma (`figma_write_*`) should only happen when the user explicitly asks to modify the file — the default flow is read-only.

**Figma write tool policy:** prefer the dedicated `figma_write_*` tools (`create_frame`, `set_auto_layout`, `clone_node`, `create_text`, `set_text_content`, `modify_node`, `create_rectangle`, `set_fill_color`, etc.) over `figma_write_evaluate_script`. Only fall back to `evaluate_script` when no dedicated tool covers the operation — e.g. creating a Figma page, which has no MCP equivalent and requires `figma.createPage()`. When falling back, surface the reason in the user-facing log.
