# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`baluarte` reads Figma files via the Metalab MCP Figma tools, builds a structured understanding of the product (components, tokens, layouts, instances), and persists it to a local SQLite registry. Downstream, that registry will drive Storybook generation for design audits and dev/client handoff.

## Stack

- **Runtime:** Node.js (latest LTS). Pinned via `.nvmrc` (`lts/*`). Run `nvm use` before working.
- **Languages:** TypeScript and bash. Avoid one-off `.ts` scripts unless the bash form is genuinely unwieldy — prefer `npx tsx -e "..."` inline.
- **Storage:** SQLite via the `sqlite3` CLI (or `node:sqlite` from Node 22+ when scripting). DB lives at `.data/baluarte.db` (gitignored).

## Skills (in `.claude/skills/`)

The `.claude/` directory is **checked into git** so skills are versioned with the repo. Only `.claude/settings.local.json` is gitignored.

- **`baluarte-remember`** — the only skill that touches `.data/baluarte.db`. Upserts/reads/deletes registry components and tokens. Use this for *structured, queryable, cross-session* data.
- **`baluarte-understand-product`** — walks a Figma file with Metalab MCP tools and persists the result via `baluarte-remember`.

## Persistence rules

- Anything queryable / row-shaped → `baluarte-remember` (SQLite).
- Anything prose-shaped (preferences, status, decisions) → `MEMORY.md`.
- **Never write SQL outside the `baluarte-remember` skill.** If you need a new operation, add it to `.claude/skills/baluarte-remember/SKILL.md` and (if needed) update `.claude/skills/baluarte-remember/schema.sql`.

## Database

Schema source of truth: `.claude/skills/baluarte-remember/schema.sql`. The `.db` file is rebuildable any time:

```bash
mkdir -p .data
sqlite3 .data/baluarte.db < .claude/skills/baluarte-remember/schema.sql
```

Tables: `registry`, `tokens`, `registry_children`, `registry_tokens`. WAL mode, foreign keys on, cascading deletes. See the skill's SKILL.md for query patterns.

## Figma access

Use the Metalab MCP Figma tools (`mcp__metalab__figma__*` and `mcp__metalab__figma_live_*`). Do not call the Figma REST API directly. Writes to Figma (`figma_write_*`) should only happen when the user explicitly asks to modify the file — the default flow is read-only.
