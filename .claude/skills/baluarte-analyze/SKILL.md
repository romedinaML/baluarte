---
name: baluarte-analyze
description: Sync a Figma file's tagged entities into .data/baluarte.db by triggering the baluarte-tools MCP. Takes a Figma URL, extracts the file key, and runs `baluarte-fetch-entities` which seeds variables, reads /baluarte-* comments, and persists the diff.
allowed-tools:
  - mcp__baluarte-tools__baluarte-fetch-entities
---

# baluarte-analyze

Thin wrapper that delegates **all** Figma access and DB writes to the `baluarte-tools` MCP. The skill itself parses the input URL, extracts the file key, and invokes one MCP call.

## When to use

- The user wants to sync a Figma file's documented entities into `.data/baluarte.db`.
- The user wants to refresh the registry after re-commenting or design changes — `baluarte-fetch-entities` is idempotent, so re-running on an unchanged file is a no-op.

## When NOT to use

- Per-node interactive flows → `baluarte-document-*`.
- Direct SQLite reads/writes → `baluarte-remember`.
- Storybook code generation → `baluarte-build-*`.

## Inputs

| Argument | Required | Type | Description |
|---|---|---|---|
| First positional | **yes** | URL | Figma file URL (`https://www.figma.com/file/<key>/…` or `…/design/<key>/…?node-id=…`). Only the **file key** is consumed; any `?node-id=…` is ignored. |

If the first argument isn't a Figma URL, fail fast with the expected pattern and stop. Do not attempt heuristics.

### Example

```
/baluarte-analyze https://www.figma.com/design/abc123XYZ/Playground?node-id=2064-20806
```

## Procedure

1. **Parse the URL.** Match `https://www\.figma\.com/(?:file|design)/(?<key>[A-Za-z0-9]+)`. On no match → error out with the expected URL shape.
2. **Invoke the MCP tool.** Call `mcp__baluarte-tools__baluarte-fetch-entities` with `FIGMA_FILE: "<file-key>"`. Wait for completion. The tool internally:
   - Seeds local Figma variables → `properties` (`origin='Figma Variable'`).
   - Reads `/baluarte-layout`, `/baluarte-molecule`, `/baluarte-atom` comments.
   - Diffs against the registry (comment timestamp + content hash).
   - Deep-fetches the changed nodes, persists `figma_nodes`, `layouts`/`molecules`/`atoms`, variants, properties, and `pages_registry`.
3. **Summarize the response.** The tool returns JSON `{ layouts, molecules, atoms }` of the entities that were written this run. Report counts plus the names/node ids of the changed entities. If all three buckets are empty, report "no changes — file is already in sync."

## Outputs

```
Finished. Synced <FIGMA_FILE> via baluarte-fetch-entities.
- layouts: <N> (<comma-separated names>)
- molecules: <N> (…)
- atoms: <N> (…)
```

If the MCP returned errors on stderr (e.g. "Variables API unavailable for <file> (403)"), surface them verbatim under a `Warnings:` section but treat the run as successful when the JSON response was returned.

## Prerequisites

- `baluarte-tools` MCP server registered in the user's Claude Code config — `claude mcp add baluarte-tools npx baluarte-tools` or equivalent.
- `baluarte-tools/.env` has `FIGMA_API=<personal-token>` (the MCP reads this on startup).
- `.data/baluarte.db` exists. If missing, prompt the user to run `npm run db:reset` from the repo root and stop — do **not** initialize it from this skill.

## Invariants

- **Exactly one MCP call per invocation.** No fan-out, no retries — if the MCP fails, surface the error and stop.
- **No direct Figma access.** This skill must not call any `mcp__metalab__figma_*` tool. Figma I/O is owned by `baluarte-tools`.
- **No direct DB writes.** All persistence happens inside the MCP. This skill never opens `.data/baluarte.db`.
- **No other skill calls.** Do not invoke `baluarte-remember`, `baluarte-document-*`, or `baluarte-build-*` from here.

## What NOT to do

- Don't pre-process the URL beyond extracting the file key. The `?node-id=…` portion is intentionally ignored — `baluarte-fetch-entities` operates on the whole file via `/baluarte-*` comments, not a single node.
- Don't add `--type`, `--name`, `--prompt`, or other flags. Naming and classification come from the comment text (`--variant=`, `--state=`) inside Figma, not from CLI flags.
- Don't retry on 403 from the Variables endpoint. The MCP already handles that gracefully (logs to stderr, continues without variables).
