---
name: baluarte-document-layout
description: Document ONE layout row (node_type='layout') by creating one artboard inside the Layouts section of "Baluarte for Devs" with a visual clone + an auto-layout text annotation block, and persisting a `layouts` row with code-gen-shaped properties_json. Lists direct children in the annotation and the report — DOES NOT call baluarte-document-component for them; the user runs those commands manually. Never modifies the source layout, never auto-recurses.
---

# baluarte-document-layout

Documents one layout. Idempotent: re-running on the same `registry_uuid` is a no-op (or refreshes `properties_json` if the user explicitly asks).

## Required argument

This skill accepts **either** of:

- `registry_uuid` — the layout's UUID in the `registry` table (skip registration).
- A Figma node URL — the skill auto-invokes `baluarte-understand-product <URL>` (whitelisted) to ensure the registry row exists, then proceeds.

If neither is provided, fail fast with:
> `baluarte-document-layout` requires either a `registry_uuid` or a Figma node URL. Look up existing layouts with `sqlite3 .data/baluarte.db "SELECT uuid, node_id FROM registry WHERE node_type='layout';"`.

## Pre-checks

1. **Type check.** `SELECT node_id, node_type FROM registry WHERE uuid='<REG_UUID>';`
   - If no row → fail: "registry uuid not found".
   - If `node_type != 'layout'` → fail with: "registry uuid is type=<X>, not 'layout'. Use baluarte-document-component for components or baluarte-document-property for properties."
1a. **Wrapper-rejection check.** Read the Figma source via `mcp__metalab__figma__get_figma_node` for the layout's `node_id`. If the node looks like a presentation-slide wrapper (per Tier 1 of `baluarte-understand-product`'s classification heuristics — name = `Slide`, presentation-aspect dimensions, child shape is `Eyebrow + single-screen-frame + decoration`), **refuse** with: `"<node_id> looks like a presentation-slide wrapper, not a layout. Re-run baluarte-understand-product so the inner screen frame is registered as the layout, then retry."` This is a defence-in-depth check — understand-product's heuristics should already have classified the wrapper as `page`/`other`, but if a stale row slipped through, this catches it.
2. **Already documented?** `SELECT uuid, doc_artboard_id FROM layouts WHERE registry_uuid='<REG_UUID>';`
   - If a row exists → log "already documented at <doc_artboard_id>" and return early. Do not create a second artboard.
3. **Resolve `layouts_section_id` from cache.** This skill never auto-calls `baluarte-create-developers-docs`. Read the cache via `baluarte-remember`:
   ```bash
   sqlite3 .data/baluarte.db \
     "SELECT layouts_section_id FROM dev_docs_pages WHERE layouts_section_id IS NOT NULL;"
   ```
   If empty → fail with: `"No dev-docs page cached. Run baluarte-create-developers-docs <figma URL> first, then retry."` The user runs it manually exactly once per file.

## Build the artboard

The artboard must contain **a visual copy of the source layout** plus a text annotation block. Both live inside the artboard's auto-layout frame.

### Frame skeleton

```
Artboard frame  (auto-layout, vertical, gap 24, padding 32)   ← parented to layouts_section_id
├── Visual frame  (auto-layout, hug)                           ← contains the clone
│   └── <CLONE of the source layout's Figma node>
└── Annotation frame  (auto-layout, vertical, gap 12, fill width)
    ├── Title text       (e.g. "Layout — DashboardShell")
    ├── Description text
    ├── "Components" sub-block  (auto-layout, vertical, gap 4)
    │     └── one text line per child component
    ├── "Tokens" sub-block       (auto-layout, vertical, gap 4)
    │     └── one text line per token used (name + value preview)
    └── "Custom values" sub-block (auto-layout, vertical, gap 4)
          └── one text line per non-token literal value found
```

### MCP calls (in order)

1. `mcp__metalab__figma_write_create_frame` → parent: `layouts_section_id`, name: `Layout — <readable name>`. Capture `<artboard_id>`.
2. `mcp__metalab__figma_write_set_auto_layout` on `<artboard_id>` (vertical, itemSpacing 24, padding 32).
3. **Visual section.**
   - Create the visual sub-frame with `figma_write_create_frame` parented to `<artboard_id>`; apply `figma_write_set_auto_layout` (hug content).
   - Read the source via `mcp__metalab__figma__get_figma_node` to capture metrics (auto-layout direction, gap, padding, sizing).
   - `mcp__metalab__figma_write_clone_node` → source: `<source_node_id>`, parent: visual sub-frame id. **The clone must never be modified to match the doc**; it's a faithful reference. Never call any write tool that targets the original source node.
4. **Annotation section.**
   - Create the annotation sub-frame with `figma_write_create_frame` + auto-layout (vertical, gap 12, fill width).
   - Add text nodes with `figma_write_create_text` and `figma_write_set_text_content` for: title, description, then one text node per child component, per token, per custom value. Each "sub-block" can be its own auto-layout frame so resizing is predictable.

## List direct children — but don't document them

Read direct INSTANCE/FRAME children of the source layout from the `get_figma_node` payload. For each:

- Look it up in `registry`: `SELECT uuid, node_type FROM registry WHERE node_id='<child_id>';`
- If a row exists, capture `(node_id, node_type, description, registry_uuid)` for the annotation + report.
- If no row exists, capture `(node_id, '<unregistered>', figma_name)`.

**Do not** invoke `baluarte-document-component` or `baluarte-document-layout` for any child. List them in the annotation block (so the artboard text shows what's inside) and emit suggested follow-up commands at the end of the run:

```
Suggested next steps for children of this layout:
  baluarte-understand-product https://figma.com/...?node-id=<child_node_id>   # for unregistered children
  baluarte-document-component <child_registry_uuid>                            # for registered components not yet documented
  baluarte-document-layout    <child_registry_uuid>                            # for any nested layout children
```

The user runs these manually. The layout row this skill writes is complete on its own; the link tables (`layout_components`, `registry_children`) are populated only as far as children that ALREADY have their own rows in `components` / `registry`. If a child isn't documented yet, the link is missing — that's fine; it'll fill in when the user runs the suggested command.

## Identify tokens used

Pull from the joins already populated by `baluarte-understand-product`:

```bash
sqlite3 -header -box .data/baluarte.db \
  "SELECT t.name, t.type, t.value
   FROM registry_tokens rt
   JOIN tokens t ON t.uuid = rt.token_uuid
   WHERE rt.registry_uuid='<REG_UUID>'
   ORDER BY t.type, t.name;"
```

If the layout obviously uses tokens that aren't in the join (e.g. discovered while reading the node here), upsert them in `tokens` and link them in `registry_tokens` via `baluarte-remember` first. Document what the *layout* uses, not what its child components individually use — those are documented in their own component artboards.

## Persist

Write the `layouts` row, then (best-effort) link any children that ARE already registered as components.

```bash
sqlite3 .data/baluarte.db <<SQL
INSERT INTO layouts(uuid, registry_uuid, doc_artboard_id, description, properties_json)
VALUES(
  lower(hex(randomblob(16))),
  '<REG_UUID>',
  '<ARTBOARD_ID>',
  '<one-line description>',
  json('{ ... see properties_json shape below ... }')
)
ON CONFLICT(registry_uuid) DO UPDATE SET
  doc_artboard_id = excluded.doc_artboard_id,
  description     = excluded.description,
  properties_json = excluded.properties_json,
  updated_at      = datetime('now');

-- For each direct child whose registry row already has a `components` row, link it.
-- Children that are not yet registered components are simply not linked — the user
-- will run baluarte-understand-product / baluarte-document-component for them and
-- the link will fill in on the next run of this skill (idempotent).
INSERT OR IGNORE INTO layout_components(layout_uuid, component_uuid) VALUES (...);
SQL
```

No rollback, no transactional self-check. Missing edges are expected in the user-driven model — the user controls what gets documented and when. Re-running this skill after registering more children is idempotent and fills in any newly-available links.

## `properties_json` shape

Initial shape consumed by the future code-gen skill. Extend as code-gen grows; keeping it as one JSON column (rather than dedicated columns) is intentional.

```json
{
  "auto_layout": {
    "direction": "vertical | horizontal | wrap",
    "gap": 16,
    "padding": [24, 16, 24, 16]
  },
  "sizing": { "width": "fill | hug | <px>", "height": "fill | hug | <px>" },
  "breakpoints": [],
  "children": [
    { "kind": "component", "registry_uuid": "...", "component_uuid": "..." },
    { "kind": "layout",    "registry_uuid": "...", "layout_uuid": "..." }
  ],
  "tokens":  [{ "name": "color/brand/primary", "type": "color" }],
  "custom_values": [{ "label": "...", "value": "..." }]
}
```

## Hard rules

- Never mutate the source layout. Only the **clone** is allowed to live inside the artboard, untouched after cloning.
- Never create an artboard outside the `layouts_section_id` returned by `baluarte-create-developers-docs`.
- Always use auto-layout for every text-bearing frame so docs reflow predictably.
- All persistence goes through `baluarte-remember`.
- All Figma writes are `mcp__metalab__figma_write_*` calls; all Figma reads are `mcp__metalab__figma_live_*` / `mcp__metalab__figma__get_figma_node` / `mcp__metalab__figma__search_nodes`.
- **Auto-call whitelist is two skills only.** This skill may invoke `baluarte-remember` and `baluarte-understand-product` (the latter when given a URL instead of a uuid). Every other prerequisite is fail-fast with a suggested command.
