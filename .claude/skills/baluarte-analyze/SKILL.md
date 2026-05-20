---
name: baluarte-analyze
description: Walk a Figma file's top-level artboards via the Metalab Figma MCP, classify each as a layout (name contains the token `screen`) or a component, hash each artboard's deep tree, diff against `.data/baluarte.db`, and persist the delta through `baluarte-remember`. Optional `--with-build` chains into `baluarte-build`.
allowed-tools:
  - Skill
  - Bash
  - Read
  - mcp__metalab__figma__get_figma_node
  - mcp__metalab__figma__search_nodes
  - mcp__metalab__figma_live_get_page_structure
  - mcp__metalab__figma_live_get_local_components
  - mcp__metalab__figma_live_get_styles
  - mcp__metalab__figma_write_set_file_key
---

# baluarte-analyze

Single end-to-end syncer: Figma file → `.data/baluarte.db`. All Figma access goes through the Metalab Figma MCP — there is no longer a separate `baluarte-tools` MCP, no REST calls, and no `/baluarte-*` comments or annotations. All DB access goes through `baluarte-remember`.

## When to use

- The user wants to sync a Figma file into `.data/baluarte.db`.
- The user wants to refresh the registry after a Figma change. Re-running on an unchanged file is a no-op (every artboard's `content_diff_hash` already matches).

## When NOT to use

- Code generation → `/baluarte-build`.
- Raw SQLite reads/writes → `baluarte-remember`.

## Inputs

| Argument | Required | Type | Description |
|---|---|---|---|
| First positional | **yes** | URL | Figma file URL (`https://www.figma.com/file/<key>/…` or `…/design/<key>/…`). Only the file key is consumed; any `?node-id=…` is ignored. |
| `--with-build` | no | boolean | If present, chain into `/baluarte-build` (default `--scope all`) after a successful sync. |

If the first argument isn't a Figma URL, fail fast with the expected pattern and stop.

### Examples

```
/baluarte-analyze https://www.figma.com/design/abc123XYZ/Playground
/baluarte-analyze https://www.figma.com/design/abc123XYZ/Playground --with-build
```

## Classification rule

A top-level artboard (immediate child of a `CANVAS` node) is a **layout** when its `name` matches `/(?:^|[-_\s])screen(?:[-_\s]|$)/i` (kebab/word-segment match, case-insensitive). Examples that match: `home-screen`, `screen_checkout`, `Onboarding Screen`. Examples that don't: `Screensaver`, `BigScreenshot`. Everything else is a **component**.

Nested `INSTANCE` nodes inside an artboard map to their `componentId` → the corresponding component row, recorded in `layout_registry` (for instances inside a layout) or `components_registry` (for instances inside a component). This keeps React composition honest: a `<HomeScreen>` renders `<Card>` and `<Card>` renders `<Pill>`.

## Procedure

### 1. Parse the URL

Match `https://www\.figma\.com/(?:file|design)/(?<key>[A-Za-z0-9]+)`. On no match, error out with the expected URL shape and stop. Recognize `--with-build` (presence-only). Any other unrecognized flag is an error.

### 2. Set the active file

Call `mcp__metalab__figma_write_set_file_key` with the extracted key so subsequent live-tools target the right file.

### 3. Seed properties from Figma variables

Use `mcp__metalab__figma_live_get_styles` (and `figma_live_get_local_components` where relevant) to pull the file's local variables/styles. For each variable, call `baluarte-remember` to `insert_property` with `origin='Figma Variable'` and `:figma_variable_id` set. Variables that already exist in the registry (matched on `figma_variable_id`) are upserted in place — the unique partial index on `properties.figma_variable_id` makes this idempotent.

Files on a plan that doesn't expose variables degrade gracefully: log the limitation and continue with properties=[].

### 4. Walk the file's artboards

Use `mcp__metalab__figma_live_get_page_structure` to list every top-level `FRAME`/`COMPONENT`/`COMPONENT_SET` directly under each page's `CANVAS`. For each artboard, capture: `node_id`, `name`, `lastModified` (file-wide, used only on `pages.edited_at`), and whether it is a `COMPONENT_SET` (variant container).

Classify each artboard by the rule above into `layouts[]` or `components[]`.

### 5. Probe intent + diff against the registry

**Probe intent for every artboard first** (not just hash-dirty ones). In a single `figma_write_evaluate_script` call, fetch for each top-level artboard: its full `node.annotations` array (every annotation, not just the canonical one — see Source B for the matching rule) and its `node.getSharedPluginData('baluarte', 'intent_v1')` payload. Bridge offline → skip the probe; structural-only diffing still works.

Then for every artboard, compute a **composite content_diff_hash** that captures both the structural tree and the design intent:

```
content_diff_hash = SHA256(
  structural_fingerprint(nodeId | name | type | children | lastModified)
  + "|intent="
  + canonical_intent_string
)

canonical_intent_string =
   <plugin_data intent_v1 if non-empty>
   else <annotation label if present>
   else ""
```

Through `baluarte-remember`, call `list_layouts_with_figma_node` and `list_components_with_figma_node`. For every artboard the file already knows about, compute the dirty flag as `existing.content_diff_hash !== fresh.content_diff_hash`. Unknown artboards are also dirty (they will be created).

**Why fold intent into the hash:** designer edits to the annotation prose, or fresh `setSharedPluginData` writes from `baluarte-design`, change `canonical_intent_string` and therefore flip the hash — even when the structural tree is byte-identical. Both `baluarte-analyze` and `baluarte-build` use the same hash for dirty detection, so a single composite formula propagates intent changes through both skills with no extra plumbing.

The dirty set has two buckets: `dirtyLayouts[]` and `dirtyComponents[]`. Clean rows are skipped — no DB writes for unchanged artboards.

### 6. Deep-fetch dirty artboards

For each dirty artboard, call `mcp__metalab__figma__get_figma_node` to retrieve the full descendant tree. The `content_diff_hash` was already computed in §5; this step is purely about getting the structural payload needed for variant + INSTANCE extraction in §7. Track the artboard's direct `INSTANCE` descendants (and, for `COMPONENT_SET`s, the variant children).

### 6.5. Extract design intent

For every dirty artboard, build a single `intent_json` object by **merging three sources** with this precedence: **plugin data > description tags > structural hints**.

**Source A — `setSharedPluginData('baluarte','intent_v1')`** (preferred). Requires the live bridge; call via a `figma_write_evaluate_script` snippet:
```js
const node = figma.getNodeById('<node-id>');
return node ? node.getSharedPluginData('baluarte', 'intent_v1') : '';
```
Parse the returned JSON string. If non-empty, this is the canonical intent object.

**Source B — Figma node annotation (`node.annotations`)** (canonical prose channel; works on every node type). The matcher is **deliberately permissive**: any annotation whose label either starts with `@baluarte intent:` OR contains at least one `@<tag>:` line on the known-tag list (below) is treated as intent data. Designers don't have to remember the `@baluarte intent:` header — writing `@max-width: 320` alone on a node is enough.

```js
const node = await figma.getNodeByIdAsync('<node-id>');
const KNOWN_TAGS = ['scrollable','min-width','max-width','interactive','css'];
const tagRe = new RegExp('^@(' + KNOWN_TAGS.join('|') + '):', 'm');
const intentAnnotations = (node.annotations || []).filter(a => {
  const l = a.label || '';
  return l.startsWith('@baluarte intent:') || tagRe.test(l);
});
// Concatenate all matching annotation labels into one canonical block.
const combined = intentAnnotations.map(a => a.label).join('\n\n');
return combined;
```

Parse the combined text for the optional `@baluarte intent:` header and the `@<tag>:` lines:
- `@scrollable: x | y` → `intent.scrollable`
- `@min-width: <N>` → `intent.min_width: Number(N)` (px)
- `@max-width: <N>` → `intent.max_width: Number(N)`
- `@interactive: <event>→<state>, ...` → `intent.interactivity: [{event, target_state}, …]`
- `@css: cls1, cls2, cls3` → `intent.css_utilities: ['cls1','cls2','cls3']` (verbatim Tailwind class strings — built-in utilities; never registered as `properties` rows). The build skill writes this back automatically after inferring utilities from prose; designers may also author it directly.
- The first block of prose (between `@baluarte intent:` and the first `@tag:` line) becomes `intent.prompt`. When the annotation has no `@baluarte intent:` header, `intent.prompt` is empty `""`.

**Unknown / mistyped `@<tag>:` lines.** When the combined annotation text contains a line that looks like an `@<tag>:` directive but the tag isn't on the KNOWN_TAGS list (e.g. `@mix-width: 320px` — a typo for `@max-width`), the parser MUST surface a correction prompt to the user via `AskUserQuestion` rather than silently drop it. Recommended option is the closest fuzzy-matched tag (`@max-width` for `@mix-width`); other options include the next-closest known tag and "Skip — annotation is intentional". The user's resolution is then:
- Apply the corrected tag's value to `intent.<field>` as normal.
- Schedule a **write-back** in §7: rewrite the annotation label so `@mix-width:` becomes `@max-width:` (the canonical form). The next sync sees the corrected tag directly and proceeds without re-asking.

**Legacy `.description` fallback** — On COMPONENT/COMPONENT_SET nodes, if `node.annotations` has no `@baluarte intent:` entry but the legacy `.description` field still does, treat `.description` as Source B with the same parse rules. This is a one-time migration aid; `baluarte-design` now writes annotations exclusively.

**Source C — Structural hints from `globalVars`** (fallback). When neither A nor B yielded a field, infer from the deep-fetch payload:
- A referenced layout style with `"overflowScroll": ["x"]` → `intent.scrollable: "x"`. Same for `"y"`.
- `sizing.horizontal: "fixed"` + numeric `dimensions.width` → `intent.min_width: <width>` (only when no explicit min was set from A/B).
- A `COMPONENT_SET` whose variant names imply states (`State=Hover`, `State=Active`, etc.) → infer `intent.interactivity: [{event: 'hover', target_state: 'hover'}, ...]` only when source A/B was silent.

**Bridge offline** — Source A is skipped. Description + structural hints still run.

**Description prose, separate channel.** The plain-text `description` column gets the value of `intent.prompt` (the original `/baluarte-design` request). The structured object becomes `intent_json` as a serialized JSON string.

**Idempotency.** If the on-disk `intent_json` already has a non-empty `prompt` and the fresh extraction has no prompt, preserve the existing prompt and merge other fields. The COALESCE pattern in `update_component`/`update_layout` makes a NULL `:intent_json` a no-op; pass the merged JSON string only when something actually changed.

### 7. Persist through `baluarte-remember`

Order matters because of foreign keys:

1. **Properties (re-emit any newly discovered Figma variables).** `insert_property` per variable.
2. **Components first** — call `insert_component` / `update_component` per dirty component row, passing `:description=<intent.prompt>` and `:intent_json=<JSON-string>` from step 6.5. For each, also:
   - upsert its `figma_nodes` row (`reference_type='component'`).
   - wipe + re-insert its `component_variants` from the COMPONENT_SET children (if any), keyed by parsed variant name (e.g. `state=hover` → join with `select_state_by_type`).
   - record nested `INSTANCE` references via `link_component_child` (`parent_id` = this component, `child_id` = the registry uuid of the referenced component — look it up via `select_component_uuid_by_figma_node` on the instance's `componentId`).
3. **Layouts** — `insert_layout` / `update_layout` per dirty layout (with the same `:description` / `:intent_json` pair), then `figma_nodes` row (`reference_type='layout'`), then `link_layout_child` for each nested `INSTANCE`, looking up the child component the same way.
4. **Page** — `insert_page` with `:file_key` and `:edited_at = file.lastModified`. Then `link_page_child` for every layout / component that was just written.
5. **Annotation write-back (when Source B resolved typos or bare annotations).** When §6.5 corrected a mistyped `@<tag>:` line, or upgraded a bare `@<tag>:` annotation to the canonical `@baluarte intent:` form, rewrite the Figma annotation with the cleaned label via `figma_write_evaluate_script`. This is the only Figma write the analyze skill makes, and only when corrections were resolved. Preserve unrelated annotations on the node untouched.

Each step is logged so the final summary can report counts.

### 8. Summary output

```
Finished. Synced <file-key>.
- layouts:    <N created>  /  <M updated>  /  <K unchanged>
- components: <N created>  /  <M updated>  /  <K unchanged>
- properties: <N seeded>   /  <M updated>
```

If every bucket is `0/0/K`, print `no changes — file is already in sync.`

### 9. Optional `--with-build`

If `--with-build` was set AND step 7 completed without error, invoke `Skill(skill="baluarte-build")` with no extra args. Append its output verbatim. Otherwise, stop.

## Universal rules

- **Skill auto-call whitelist is one:** `baluarte-remember`. (`--with-build` chains into `baluarte-build` only on explicit user opt-in.)
- **No raw SQL.** Every DB read or write is a `Skill(skill="baluarte-remember")` call referencing a named query in `/queries/INDEX.md`.
- **No `/baluarte-*` tags.** Names come from the Figma artboard `name` field directly. Surface a confirmation when a name collides with another artboard in the same bucket — the second hit becomes a no-op upsert keyed by `figma_node`.
- **No REST API.** Only `mcp__metalab__figma_*` tools.
