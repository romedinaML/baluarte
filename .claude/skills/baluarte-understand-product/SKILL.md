---
name: baluarte-understand-product
description: Walk a Figma file with Metalab MCP tools to build a structured understanding of the product (concept, components, tokens, spacing, sizes, layouts, instances) and persist it to the project SQLite registry by calling the baluarte-remember skill. REQUIRES one argument — a Figma project URL.
---

# baluarte-understand-product

Use this skill when the user asks to "understand", "ingest", "audit", "scan", or "register" a Figma file in this project. It is the entry point that builds the canonical registry that downstream skills (Storybook generation, audit, handoff) will read from.

## Hard rules

- **Use Metalab MCP Figma tools exclusively.** Do not curl the Figma REST API, do not paste screenshots, do not infer from filenames. Every fact about the file must come from `mcp__metalab__figma__*` or `mcp__metalab__figma_live_*` tool calls.
- **Persist via `baluarte-remember`.** Do not run SQL in this skill. Hand off every write to the `baluarte-remember` skill (or its documented `sqlite3` invocations).
- **Idempotent.** Running this skill twice on the same file must not duplicate rows — use the `ON CONFLICT` upserts documented in `baluarte-remember`.

## Required argument

This skill takes **exactly one mandatory argument**: the Figma project URL.

Accepted shapes:
- `https://www.figma.com/file/<fileKey>/<slug>` (legacy)
- `https://www.figma.com/design/<fileKey>/<slug>` (current)
- Either of the above with a `?node-id=…` suffix — that node id scopes the walk; without it, scope to the whole file.

### Validation (do this before any tool call)

1. If no argument was provided → **stop immediately** and reply with:
   > `baluarte-understand-product` requires a Figma project URL as its only argument. Re-invoke with the URL, e.g. `https://www.figma.com/design/<fileKey>/<slug>`.
   Do not prompt the user for it interactively, do not guess from context, do not fall back to the "currently open file". Hard fail.
2. If the argument is present but does not match the URL shapes above (missing `figma.com`, missing `/file/` or `/design/`, missing fileKey segment) → **stop immediately** with:
   > Argument is not a valid Figma project URL: `<value>`. Expected `https://www.figma.com/{file|design}/<fileKey>/<slug>`.
3. Extract `fileKey` (the path segment after `/file/` or `/design/`) and the optional `node-id` query param. Use `fileKey` with `mcp__metalab__figma_write_set_file_key` in step 1 below. If `node-id` was present, scope step 3's walk to that node.

## Steps

### 1. Verify connection and target the file

The argument has already been validated above; `fileKey` is extracted.

```
mcp__metalab__figma__test_figma_connection
```
If the connection is not authenticated, stop and ask the user to run the auth flow.

```
mcp__metalab__figma_write_set_file_key  →  { fileKey }
```

### 2. Get the lay of the land

Call these to understand what's in the file before drilling in:

- `mcp__metalab__figma_live_get_current_file` — file name, top-level pages.
- `mcp__metalab__figma_live_get_page_structure` — page → frame hierarchy.
- `mcp__metalab__figma_live_get_local_components` — published / local component set.
- `mcp__metalab__figma_live_get_styles` — color, text, effect, grid styles (token candidates).

### 3. Walk components and instances

For each component (and notable frame) of interest:

- `mcp__metalab__figma__get_figma_node` — read the full node (children, auto-layout, sizing, fills, strokes, effects, text style refs).
- `mcp__metalab__figma__search_nodes` — find variants, instances, or nodes by name pattern when the structure is large.
- `mcp__metalab__figma__download_node_images` — only when an image is needed for context (don't bulk-download).

### 4. Build the mental model (checklist to fill out before persisting)

Work through this list and write the answers down in the conversation before any DB writes:

- **Concept / product summary** — one paragraph: what is this product, who is it for, what are the dominant flows shown in the file.
- **Token inventory** — for each style discovered:
  - `type` ∈ `color | spacing | typography | radius | shadow | grid | other`
  - `name` — Figma style name (kept verbatim where possible, e.g. `color/brand/primary`)
  - `value` — canonical string. For typography, a stable JSON blob with family/weight/size/lineHeight is fine.
- **Component inventory** — for each component:
  - Stable Figma `node_id`.
  - One-sentence `description` (purpose, not appearance).
  - List of child component `node_id`s (only direct children that are themselves components/instances — not every leaf node).
  - List of `(token_name, token_type)` pairs the component consumes (fills, strokes, text styles, effect styles, auto-layout spacing tokens).
- **Layout / sizing notes** — auto-layout patterns, breakpoints, grid usage, instance overrides worth noting. These go into the component `description`, not as separate columns.

If the file is large, scope to one page or one component set per run and state that scope back to the user.

### 5. Persist via `baluarte-remember`

Initialise the DB if needed (the `baluarte-remember` SKILL has the exact commands), then for each item:

1. **Upsert every token first** (children before parents — tokens are referenced by registry rows).
2. **Upsert every component** into `registry`.
3. **Link parents → children** in `registry_children` (only after both rows exist).
4. **Link components → tokens** in `registry_tokens`.

All write commands and their conflict-handling are documented in `.claude/skills/baluarte-remember/SKILL.md`. Do not invent new SQL here.

### 6. Report back

End with a concise summary:

- File name and (if scoped) the page/component-set you covered.
- Counts: components registered, tokens registered, parent/child links, component/token links.
- Any nodes you skipped and why (detached instances, deprecated frames, scope cap).
- Open questions for the user (ambiguous component purpose, missing token names, etc.).

## What this skill does NOT do

- It does not generate Storybook code.
- It does not modify the Figma file (no `figma_write_*` calls).
- It does not delete existing registry rows. Removal is a separate, explicit action.
- It does not store prose context — that belongs in `MEMORY.md`, not the registry.
