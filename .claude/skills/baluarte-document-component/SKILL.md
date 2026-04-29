---
name: baluarte-document-component
description: Document ONE component (node_type='component') with `granularity` (atomic/molecular/unknown). Dedup-first; if the row already exists, no second artboard is created (just links the layout↔component edge if `--from-layout` is supplied). Otherwise creates an artboard inside the Components section of "Baluarte for Devs" with the visual clone + annotation, persists a `components` row, and lists nested INSTANCE children as suggested follow-up commands. NEVER auto-recurses, NEVER calls another baluarte-* skill.
---

# baluarte-document-component

Documents one component. Dedup-first: a component is documented at most once, regardless of how many layouts use it.

## Required arguments

This skill accepts **either** of:

- `registry_uuid` — the component's UUID in the `registry` table (skip registration; go straight to documentation).
- A Figma node URL (e.g. `https://www.figma.com/design/<fileKey>/...?node-id=<NODE_ID>`) — the skill auto-invokes `baluarte-understand-product <URL>` (whitelisted) to ensure the registry row exists, then proceeds with that row's `uuid`. If understand-product reports a dedup hit, the skill uses the existing uuid — it never creates a duplicate.

If neither is provided, fail fast.

## Optional arguments

- `--from-layout <layout_uuid>` — when the user is documenting a layout's child by hand, they may pass the parent layout's `layouts.uuid` to record the layout↔component link. The skill never derives this on its own.
- `--prompt "<free-form context>"` — user-supplied guidance. Use it to:
  - Override the sanitised name (e.g. `--prompt "call this StatusPill"`).
  - Force a granularity classification (e.g. `--prompt "this is molecular even though it has only 1 nested instance"`).
  - Add description copy to the artboard annotation (e.g. `--prompt "used as the primary CTA on every onboarding screen"`).
  Treat the prompt as authoritative when it conflicts with a heuristic.

If `registry_uuid` is missing, fail fast.

## Pre-checks (in this order)

1. **Type check.** `SELECT node_id, node_type FROM registry WHERE uuid='<REG_UUID>';`
   - Missing → fail.
   - `node_type != 'component'` → fail with: "registry uuid is type=<X>, not 'component'."
2. **Dedup — single most important step.**
   ```bash
   sqlite3 -header -box .data/baluarte.db \
     "SELECT uuid, doc_artboard_id FROM components WHERE registry_uuid='<REG_UUID>';"
   ```
   If a row exists:
   - **Do not** create another artboard.
   - If `layout_uuid` was provided, link it: `INSERT OR IGNORE INTO layout_components(layout_uuid, component_uuid) VALUES('<LAYOUT_UUID>','<components.uuid>');`
   - Return the existing `components.uuid` and `doc_artboard_id` to the caller.
2a. **Granularity classification (mandatory).** Decide `granularity ∈ {atomic, molecular, unknown}` per Tier 4 of `baluarte-understand-product`'s classification heuristics:
   - **atomic** — leaf primitive (input, button, icon, label, badge). Children are mostly TEXT/RECTANGLE/ELLIPSE/IMAGE-SVG with at most one nested INSTANCE.
   - **molecular** — composite of 2+ nested INSTANCEs of registered atomic components, arranged in an auto-layout container.
   - **unknown** — confidence below threshold; the user's `--prompt "..."` can override.

   Persist `granularity` on the `components` row.

   **List nested INSTANCE children — do NOT document them.** When the component contains nested INSTANCEs:
   - For each direct nested INSTANCE, capture its `componentId`, the resolved `external-component:<name>` if synthesisable, and the figma name.
   - **Do not** recurse via this skill, do not write `registry_children` edges for unregistered children. Just list them.
   - Emit suggested commands at the end of the run:
     ```
     Suggested next steps for nested children of this component:
       baluarte-understand-product https://figma.com/...?node-id=<child_node_id>   # for unregistered nested instances
       baluarte-document-component <child_registry_uuid>                            # for already-registered nested components not yet documented
     ```

   The user runs these manually if they want the children captured. The current row is complete on its own.
3. **Resolve `components_section_id` from cache.** This skill never auto-calls `baluarte-create-developers-docs`. Read the cache via `baluarte-remember`:
   ```bash
   sqlite3 .data/baluarte.db \
     "SELECT components_section_id FROM dev_docs_pages WHERE components_section_id IS NOT NULL;"
   ```
   If empty → fail with: `"No dev-docs page cached. Run baluarte-create-developers-docs <figma URL> first, then retry."`

## Build the artboard

The artboard must contain **a visual copy of the source component** (all known variants if it's a component-set) plus a text annotation block. No copy of internal node trees is described in text — the visual is the visual.

### Frame skeleton

```
Artboard frame  (auto-layout, vertical, gap 24, padding 32)   ← parented to components_section_id
├── Visual frame  (auto-layout, horizontal, gap 24, hug)
│   ├── <CLONE of variant 1>
│   ├── <CLONE of variant 2>
│   └── …                                                     (one per variant; one clone if no variants)
└── Annotation frame  (auto-layout, vertical, gap 12, fill width)
    ├── Title text          (e.g. "Component — Button")
    ├── Description text
    ├── "Variants" sub-block   (auto-layout, vertical, gap 4)
    │     └── one line per variant: "<name>: <key=value, key=value>"
    ├── "Props" sub-block      (auto-layout, vertical, gap 4)
    │     └── one line per prop: "<name>: <type> = <default>"
    ├── "Slots" sub-block      (auto-layout, vertical, gap 4)
    ├── "Tokens" sub-block     (auto-layout, vertical, gap 4)
    └── "Custom values" sub-block
```

### MCP calls (in order)

1. Pull node + variant info: `mcp__metalab__figma__get_figma_node` (the component / component-set), and `mcp__metalab__figma__search_nodes` if you need to find sibling variants by name pattern.
2. `mcp__metalab__figma_write_create_frame` → parent: `components_section_id`, name: `Component — <readable name>`. Capture `<artboard_id>`.
3. `mcp__metalab__figma_write_set_auto_layout` on `<artboard_id>` (vertical, gap 24, padding 32).
4. **Visual section.**
   - Create the visual sub-frame with auto-layout (horizontal, gap 24, hug).
   - For each variant, `mcp__metalab__figma_write_clone_node` → source: variant node id, parent: visual sub-frame. If the component has no variants, clone the component itself.
   - Never modify the source — only the clones live in the artboard.
5. **Annotation section.** Create with auto-layout (vertical, gap 12, fill width). Each sub-block ("Variants", "Props", "Slots", "Tokens", "Custom values") is its own auto-layout sub-frame containing one text node per item.

## Identify tokens used

Same pattern as `baluarte-document-layout`:

```bash
sqlite3 -header -box .data/baluarte.db \
  "SELECT t.name, t.type, t.value
   FROM registry_tokens rt
   JOIN tokens t ON t.uuid = rt.token_uuid
   WHERE rt.registry_uuid='<REG_UUID>'
   ORDER BY t.type, t.name;"
```

If extra tokens are discovered while reading the component, upsert them in `tokens` and `registry_tokens` first.

## Persist

```bash
sqlite3 .data/baluarte.db <<SQL
INSERT INTO components(uuid, registry_uuid, doc_artboard_id, description, properties_json)
VALUES(
  '<UUID>', '<REG_UUID>', '<ARTBOARD_ID>',
  '<one-line description>',
  json('{ ... see properties_json shape below ... }')
)
ON CONFLICT(registry_uuid) DO UPDATE SET
  doc_artboard_id = excluded.doc_artboard_id,
  description     = excluded.description,
  properties_json = excluded.properties_json,
  updated_at      = datetime('now');
SQL
```

If `layout_uuid` was provided:

```bash
sqlite3 .data/baluarte.db \
  "INSERT OR IGNORE INTO layout_components(layout_uuid, component_uuid)
   VALUES('<LAYOUT_UUID>','<UUID>');"
```

### Self-check (mandatory)

After commit, verify that every token observed in this component is reflected in `registry_tokens`:

- Compute `expected_token_links` = number of distinct `(name, type)` token references discovered while reading the component (from `properties_json.tokens`, plus any inline `globalVars.styles` references).
- `ACTUAL=$(sqlite3 .data/baluarte.db "SELECT COUNT(*) FROM registry_tokens WHERE registry_uuid='<REG_UUID>';")`

If `ACTUAL < expected_token_links`, the component's tokens are missing from `tokens` (so the link couldn't be made). Roll back the components row write:

```bash
sqlite3 .data/baluarte.db \
  "DELETE FROM components WHERE registry_uuid='<REG_UUID>';"
```

…and abort with a clear error: `"baluarte-document-component rolled back the components row for <node_id> — observed N tokens but registry_tokens has M edges. Missing tokens: <list>. Run baluarte-understand-product (or its token-fallback step) so the tokens exist before retrying."`

Same transactional contract as `baluarte-document-layout`: a row + its edges land together, or neither lands.

Return `components.uuid` and `doc_artboard_id` to the caller.

## `properties_json` shape

```json
{
  "kind": "component",
  "variants": [
    { "name": "default",    "node_id": "...", "props": { "size": "md" } },
    { "name": "large-icon", "node_id": "...", "props": { "size": "lg", "icon": true } }
  ],
  "props": [
    { "name": "label",   "type": "string",  "default": "Click me" },
    { "name": "size",    "type": "enum",    "values": ["sm","md","lg"], "default": "md" },
    { "name": "disabled","type": "boolean", "default": false }
  ],
  "slots": ["leading-icon", "trailing-icon"],
  "tokens": [{ "name": "color/brand/primary", "type": "color" }],
  "custom_values": [{ "label": "border-width", "value": "1px" }],
  "used_by_layouts": []
}
```

`used_by_layouts` is informational; the source of truth is `layout_components`. Optionally hydrate it on read.

## Hard rules

- **Dedup before drawing.** A second artboard for an already-documented component is a bug.
- Never mutate the source component. Only clones live in the artboard.
- Never create an artboard outside the `components_section_id` returned by `baluarte-create-developers-docs`.
- Every text-bearing frame uses auto-layout.
- All persistence goes through `baluarte-remember`.
- All Figma writes are `mcp__metalab__figma_write_*`; reads are `mcp__metalab__figma_live_*` / `mcp__metalab__figma__get_figma_node` / `mcp__metalab__figma__search_nodes`.
- **Auto-call whitelist is two skills only.** This skill may invoke `baluarte-remember` (SQLite) and `baluarte-understand-product` (registry registration when given a URL instead of a uuid). Every other prerequisite (dev-docs page cached, parent layout row, registry rows for nested children) surfaces as a fail-fast suggested command for the user to run manually. Never auto-recurse, never auto-cascade.
