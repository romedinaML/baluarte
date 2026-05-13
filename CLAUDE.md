# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`baluarte` reads Figma files via the Metalab MCP Figma tools, builds a structured understanding of the product (components, tokens, layouts) and persists it to a local SQLite registry. Downstream, that registry drives Storybook generation for design audits and dev/client handoff.

## Stack

- **Runtime:** Node.js (latest LTS). Pinned via `.nvmrc` (`lts/*`). Run `nvm use` before working.
- **Languages:** TypeScript and bash. Avoid one-off `.ts` scripts unless the bash form is genuinely unwieldy — prefer `npx tsx -e "..."` inline.
- **Storage:** SQLite via the bash `sqlite3` CLI **only** — Python and `node:sqlite` are forbidden. DB lives at `.data/baluarte.db` (gitignored). All reusable SQL lives in `/queries/*.sql` and is registered in `/queries/INDEX.md`.

## Skills (in `.claude/skills/`)

The `.claude/` directory is **checked into git** so skills are versioned with the repo. Only `.claude/settings.local.json` is gitignored.

Three skills, sharp boundaries:

- **`baluarte-analyze`** — walks a Figma file's top-level artboards via the Metalab Figma MCP, classifies each as **layout** (name contains the token `screen`, kebab-segment match, case-insensitive — e.g. `home-screen`, `Onboarding Screen`) or **component**, hashes each artboard's deep tree, diffs against the registry, and persists the delta through `baluarte-remember`. Optional `--with-build` chains into `baluarte-build`. No comments, no annotations, no `/baluarte-*` tags — names come from the Figma artboard `name` field directly.
- **`baluarte-build`** — generates and **incrementally patches** the Storybook artifacts inside `baluarte-app/` from the registry. Fetches everything exclusively through `baluarte-remember`. Builds a property/parent dependency graph, computes the dirty set, parses existing `<Name>.tsx` / `<Name>.stories.tsx`, computes field-level diffs (className tokens, prop signature, story exports, header hash), and applies the *minimum delta* via `Edit`. Variants live as additional named exports inside the same `.stories.tsx`. **One story per state**, all rendered from the same component. Records each `storybook` row + entity `storybook_id` linkage back through `baluarte-remember`.
- **`baluarte-remember`** — the only skill that touches `.data/baluarte.db`. Reads/writes pages, layouts, components, properties, states, figma_nodes, storybook entries, and their relationship tables. Runs SQL exclusively via bash `sqlite3` and the `/queries/*.sql` cache.

**Skill auto-call whitelist is one:** `baluarte-remember`. Every other skill that needs DB access calls `baluarte-remember` via the `Skill` tool. `baluarte-analyze --with-build` is an explicit user opt-in, not auto-cascade.

### Component composition

The registry models component-in-component nesting via `components_registry` (self-referential parent/child). `baluarte-build` honors React composition best practices: a parent's `.tsx` imports the child by name (`import { Card } from "@/components/Card/Card"`) and renders it as a JSX element — it never inlines the child's markup. Layouts compose components the same way via `layout_registry`. Each component is self-contained and reusable.

### States in code vs. stories

A component renders ALL its states (`hover`, `active`, `stale`, `disabled`, `focus`, `clicked`) from one `.tsx` file driven by a `state` prop. The `components_properties` rows give per-state Tailwind tokens. In Storybook every state with a registry row becomes its own named export — one story per state, all rendered from the same component file.

## Persistence rules

- Anything queryable / row-shaped → `baluarte-remember` (SQLite).
- Anything prose-shaped (preferences, status, decisions) → `MEMORY.md`.
- **Never write SQL outside the `baluarte-remember` skill.** Reusable operations live in `/queries/*.sql` (registered in `/queries/INDEX.md`). New operation → new `.sql` file with `:bound_params` + an index row. Never inline SQL for anything that recurs. Update `.claude/skills/baluarte-remember/schema.sql` only when the table itself needs to change.
- **All SQL runs via bash `sqlite3`.** No Python; no `node:sqlite`.

## Database

Schema source of truth: `.claude/skills/baluarte-remember/schema.sql`. The `.db` file is rebuildable any time:

```bash
mkdir -p .data
sqlite3 .data/baluarte.db < .claude/skills/baluarte-remember/schema.sql
```

Tables — 7 single: `pages`, `storybook`, `layouts`, `components`, `states`, `figma_nodes`, `properties`. 1 variant: `component_variants`. 5 relationship: `pages_registry`, `layout_registry`, `layout_properties`, `components_registry`, `components_properties`. WAL mode, foreign keys on, cascading deletes. `states` is pre-seeded with the six allowed values; never insert into it. `layout_registry.child_property` is constrained by trigger to Positioning/Spacing properties. `components_registry` enforces `parent_id <> child_id`. See `baluarte-remember`'s `SKILL.md` and `/queries/INDEX.md` for the canonical query catalogue.

Schema is rebuildable; there are no migrations. To pick up schema changes: `rm -f .data/baluarte.db* && mkdir -p .data && sqlite3 .data/baluarte.db < .claude/skills/baluarte-remember/schema.sql`.

## Figma access

Use the Metalab MCP Figma tools (`mcp__metalab__figma__*` and `mcp__metalab__figma_live_*`) exclusively. The Figma REST API is not called directly anywhere in this repo — the previous `baluarte-tools` MCP that wrapped the REST API is gone. Writes to Figma (`figma_write_*`) should only happen when the user explicitly asks to modify the file — the default flow is read-only.

**Figma write tool policy:** prefer the dedicated `figma_write_*` tools over `figma_write_evaluate_script`. Only fall back to `evaluate_script` when no dedicated tool covers the operation (e.g. creating a Figma page, which has no MCP equivalent and requires `figma.createPage()`). Surface the reason in the user-facing log.
