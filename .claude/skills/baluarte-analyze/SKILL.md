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
- Storybook code generation → `baluarte-build`.

## Inputs

| Argument | Required | Type | Description |
|---|---|---|---|
| First positional | **yes** | URL | Figma file URL (`https://www.figma.com/file/<key>/…` or `…/design/<key>/…?node-id=…`). Only the **file key** is consumed; any `?node-id=…` is ignored. |
| `--with-build` | no | boolean | If present, immediately chain into `baluarte-build` (default `--scope all`) after a successful MCP run. Off by default — analyze is read-into-registry only unless this is set. |

If the first argument isn't a Figma URL, fail fast with the expected pattern and stop. Do not attempt heuristics.

### Examples

```
/baluarte-analyze https://www.figma.com/design/abc123XYZ/Playground?node-id=2064-20806
/baluarte-analyze https://www.figma.com/design/abc123XYZ/Playground --with-build
```

## Procedure

1. **Parse the args.** Required first positional must match `https://www\.figma\.com/(?:file|design)/(?<key>[A-Za-z0-9]+)` — on no match, error out with the expected URL shape and stop. Recognise the optional `--with-build` boolean (presence-only; no value). Any other unrecognised flag is an error.
2. **Invoke the MCP tool.** Call `mcp__baluarte-tools__baluarte-fetch-entities` with `FIGMA_FILE: "<file-key>"`. Wait for completion. The tool internally:
   - Seeds local Figma variables → `properties` (`origin='Figma Variable'`).
   - Reads `/baluarte-layout`, `/baluarte-molecule`, `/baluarte-atom` tags from **two parallel sources**:
     - **Comments** (`/v1/files/{key}/comments`) — threaded; `applyLatestReply` picks the latest reply per thread.
     - **Annotations** (`/v1/files/{key}/annotations`) — flat; `modified_at` is the freshness signal.
     When the same node is tagged in both, the **annotation wins** (full replace, even across kinds). Annotations missing the endpoint (plan-tier limitations) degrade gracefully — the MCP logs the 4xx and continues with comments only.
   - Diffs against the registry (timestamp + content hash).
   - Deep-fetches the changed nodes, persists `figma_nodes`, `layouts`/`molecules`/`atoms`, variants, properties, and `pages_registry`.
3. **Summarize the response.** The tool returns JSON `{ layouts, molecules, atoms }` of the entities that were written this run. Report counts plus the names/node ids of the changed entities. If all three buckets are empty, report "no changes — file is already in sync."
4. **Chain into `baluarte-build` if `--with-build` was set** AND the MCP returned without an error. Invoke the `Skill` tool with `skill=baluarte-build` and no extra args (default `--scope all`). The build's own Plan + per-tier summary is appended to this run's output verbatim. If the MCP errored or `--with-build` was absent, do not call `baluarte-build` — just print the analyze summary and stop.

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

- **Exactly one MCP call per invocation.** No fan-out, no retries — if the MCP fails, surface the error and stop. (Chaining into `baluarte-build` is a separate Skill call, not another MCP call, so the rule still holds.)
- **No direct Figma access.** This skill must not call any `mcp__metalab__figma_*` tool. Figma I/O is owned by `baluarte-tools`.
- **No direct DB writes.** All persistence happens inside the MCP. This skill never opens `.data/baluarte.db`.
- **One permitted skill call.** `baluarte-build` may be invoked as the final step, and only when `--with-build` is set and the MCP run succeeded. `baluarte-remember` and `baluarte-document-*` are still off-limits — those don't belong on the analyze chain.

## What NOT to do

- Don't pre-process the URL beyond extracting the file key. The `?node-id=…` portion is intentionally ignored — `baluarte-fetch-entities` operates on the whole file via `/baluarte-*` comments, not a single node.
- Don't add per-node behavior flags (`--type`, `--name`, `--prompt`, …). Naming and classification come from the comment text (`--variant=`, `--state=`, `--description=`) inside Figma, not from CLI flags. The only CLI flag this skill accepts is `--with-build`, which is a pipeline-control toggle, not a behavior flag.
- Don't chain into `baluarte-build` when `--with-build` was not set, even if the analyze produced new entities. The default flow is read-only into the registry; chaining is opt-in.
- Don't retry on 403 from the Variables endpoint. The MCP already handles that gracefully (logs to stderr, continues without variables).
