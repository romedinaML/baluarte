---
name: baluarte-orchestrate
description: Status reporter and next-step advisor for the baluarte pipeline. Reads SQLite + filesystem and surfaces the current state of the project plus a list of suggested skill commands the user can run next. Never executes other skills — the user invokes them manually for full control. Optional argument is a Figma URL or registry_uuid to focus the suggestions on one row.
---

# baluarte-orchestrate

Status + advisor only. Replaces the previous "auto-driver" role.

The pipeline is now **user-driven**: every other baluarte skill is invoked by hand, exactly once per node, with optional `--prompt "<context>"` for guidance. This skill does not execute anything — it reads the database, prints the state, and proposes specific next-skill invocations the user can copy-paste.

## Tool access

- Filesystem (`Read`, `Glob`).
- `Bash` for `sqlite3` reads.
- `baluarte-remember` (read only).
- **No** Figma MCP. **No** other baluarte-* skill calls. This is reporting only.

## Optional arguments

| Argument | Effect |
|---|---|
| (none) | Print full project state + suggested commands across all rows. |
| `<figma URL>` | Extract `node_id`, look it up in the registry, scope suggestions to that one row. |
| `<registry_uuid>` | Same as above but skips URL parsing. |
| `--prompt "<text>"` | Free-form note that gets included in the printed suggestions (e.g. "focus on mobile") so the user remembers their intent. The advisor itself doesn't reason on it; the suggested commands include it as `--prompt "..."` so the user can pass it through. |

## What it prints

### 1. State table

Read SQLite + filesystem and render this:

```bash
sqlite3 -header -box .data/baluarte.db <<'SQL'
SELECT 'registry total'           AS metric, COUNT(*) AS n FROM registry
UNION ALL SELECT 'registry layouts',          COUNT(*) FROM registry WHERE node_type='layout'
UNION ALL SELECT 'registry components',       COUNT(*) FROM registry WHERE node_type='component'
UNION ALL SELECT 'registry pages/other',      COUNT(*) FROM registry WHERE node_type IN ('page','other')
UNION ALL SELECT 'tokens',                    COUNT(*) FROM tokens
UNION ALL SELECT 'visual_properties',         COUNT(*) FROM visual_properties
UNION ALL SELECT 'layouts documented',        COUNT(*) FROM layouts
UNION ALL SELECT 'layouts built (with file)', COUNT(*) FROM layouts WHERE generated_at IS NOT NULL
UNION ALL SELECT 'components documented',     COUNT(*) FROM components
UNION ALL SELECT 'components built',          COUNT(*) FROM components WHERE generated_at IS NOT NULL
UNION ALL SELECT 'dev_docs_pages cached',     COUNT(*) FROM dev_docs_pages;
SQL
test -f baluarte-app/package.json     && echo "build-setup:        ok"     || echo "build-setup:        missing"
test -f baluarte-app/baluarte.tailwind.ts && echo "tailwind sidecar:   ok" || echo "tailwind sidecar:   missing"
```

### 2. Suggested next steps

Walk these checks in order and emit a copy-pasteable command for each gap:

| Condition | Suggestion |
|---|---|
| `baluarte-app/package.json` missing | `baluarte-build-setup` |
| `dev_docs_pages` is empty | `baluarte-create-developers-docs <figma file URL>` |
| `registry` is empty | `baluarte-understand-product <node URL>` (one URL at a time, starting with the layout/component the user cares about) |
| Registry rows exist but no `layouts`/`components` row for some | `baluarte-document-layout <reg_uuid>` or `baluarte-document-component <reg_uuid>` (per row) |
| `tokens` rows exist with no matching `visual_properties` row | `baluarte-document-property <name> <type> <tailwind_name> <css_property> <value>` (per row) |
| `visual_properties` rows exist but `applied_to_tailwind_at` is NULL or stale | `baluarte-build-properties` |
| `components` rows exist with no `artifact_path` | `baluarte-build-component <reg_uuid>` (per row) |
| `layouts` rows exist with no `artifact_path` | `baluarte-build-layout <reg_uuid>` (per row, after its components are built) |

The advisor lists rows by `registry.node_id` + `registry.description` so the user knows which to act on. If `--prompt "<text>"` was passed, append it to each suggested command verbatim.

### 3. Scoped mode (when a URL/uuid was passed)

Resolve to a single registry row and print only that row's status + the next suggested command for it. Useful when the user is iterating on one component and doesn't want the whole project listing.

## Hard rules

- **Never invoke any other baluarte-* skill.** Read state, print suggestions. The user runs commands manually.
- **Never call Figma MCP.** This skill is SQLite-only.
- The only skill it may invoke is `baluarte-remember` (read-only queries).
- Suggested commands must be exact, copy-pasteable strings — including the `<reg_uuid>` value pulled from SQLite.
- If the user passed `--prompt "<text>"`, propagate it into every suggested command's `--prompt` flag so they can paste it forward without retyping.
